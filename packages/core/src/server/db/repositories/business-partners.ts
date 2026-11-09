import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type {
  BusinessPartnerInsert,
  BusinessPartnerRow,
  Database,
} from "../database.js";
import {
  ParticipantLeaseLostError,
  type ParticipantAccessLease,
} from "../participant-access-lease.js";

export interface ListPartnersFilters {
  search?: string;
  status?: string;
  sort?: "created_at" | "updated_at" | "legal_name";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export function createBusinessPartnerRepository(db: Kysely<Database>) {
  return {
    list(filters?: ListPartnersFilters): Promise<BusinessPartnerRow[]> {
      let query = db.selectFrom("business_partners").selectAll();

      // Text search across multiple fields
      if (filters?.search) {
        const searchTerm = `%${filters.search.toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb("legal_name", "ilike", searchTerm),
            eb("assigned_bpn", "ilike", searchTerm),
            eb("requested_bpn", "ilike", searchTerm),
            eb("contact_email", "ilike", searchTerm),
          ]),
        );
      }

      // Status filter
      if (filters?.status) {
        query = query.where(
          "verification_status",
          "=",
          filters.status as
            "UNVERIFIED" | "IN_REVIEW" | "VERIFIED" | "REJECTED" | "REVOKED",
        );
      }

      // Sorting
      const sortField = filters?.sort || "updated_at";
      const sortOrder = filters?.order || "desc";
      query = query.orderBy(sortField, sortOrder);

      // Pagination
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.offset(filters.offset);
      }

      return query.execute();
    },

    async load(id: string): Promise<BusinessPartnerRow | undefined> {
      return db
        .selectFrom("business_partners")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async insert(row: BusinessPartnerInsert): Promise<void> {
      await db.insertInto("business_partners").values(row).execute();
    },

    async updateOrganization(
      id: string,
      data: {
        legalName: string;
        legalForm: string;
        registeredAddress: string;
        country: string;
        taxId: string;
        commercialRegisterNumber: string;
        website: string;
        contactEmail: string;
      },
    ): Promise<void> {
      await db
        .updateTable("business_partners")
        .set({
          legal_name: data.legalName,
          legal_form: data.legalForm,
          registered_address: data.registeredAddress,
          country: data.country,
          tax_id: data.taxId,
          commercial_register_number: data.commercialRegisterNumber,
          website: data.website,
          contact_email: data.contactEmail,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();
    },

    async reject(id: string, reason: string): Promise<void> {
      await db
        .updateTable("business_partners")
        .set({
          verification_status: "REJECTED",
          verification_notes: reason,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Marks the participant and its onboarding cases REVOKED, unless automatic
     * connector setup is running for it. Both happen in one transaction that
     * locks the participant and its cases, and the setup worker only claims
     * VERIFIED participants, so setup cannot start once this returns true.
     * A repeated call (to retry failed steps) keeps the first time and reason.
     */
    async revoke(
      id: string,
      reason: string,
      lease: ParticipantAccessLease,
    ): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        lease.assertActive();
        const owner = await trx
          .selectFrom("business_partners")
          .select("id")
          .where("id", "=", id)
          .where("access_lease_token", "=", lease.token)
          .where("access_lease_until", ">", sql<Date>`clock_timestamp()`)
          .forUpdate()
          .executeTakeFirst();
        if (!owner) throw new ParticipantLeaseLostError();
        const cases = await trx
          .selectFrom("onboarding_cases")
          .select(["id", "state", "setup_started_at"])
          .where("business_partner_id", "=", id)
          .forUpdate()
          .execute();
        if (
          cases.some(
            (row) => row.state === "IN_REVIEW" && row.setup_started_at !== null,
          )
        )
          return false;
        await trx
          .updateTable("business_partners")
          .set((eb) => ({
            verification_status: "REVOKED",
            revoked_at: eb.fn.coalesce("revoked_at", sql<Date>`now()`),
            revocation_reason: sql<string>`CASE WHEN revocation_reason = '' THEN ${reason} ELSE revocation_reason END`,
            updated_at: new Date(),
          }))
          .where("id", "=", id)
          .execute();
        await trx
          .updateTable("onboarding_cases")
          .set({ state: "REVOKED", updated_at: new Date() })
          .where("business_partner_id", "=", id)
          .where("state", "not in", ["REJECTED", "REVOKED"])
          .execute();
        lease.assertActive();
        return true;
      });
    },

    async listRevoked(): Promise<BusinessPartnerRow[]> {
      return db
        .selectFrom("business_partners")
        .selectAll()
        .where("verification_status", "=", "REVOKED")
        .execute();
    },

    /**
     * Runs `fn` while holding a lease on the participant, so revocation,
     * readmission and the revocation reconciler never change the issuer or
     * BDRS for the same participant at once, across console instances too.
     * The lease lives in the participant row, so no database connection is
     * held while `fn` makes remote calls. Renewals keep long scans exclusive;
     * expiry or a failed renewal aborts remote requests and further work.
     * It expires after `leaseMs` if the holder crashes. Returns undefined if
     * someone else still holds it after `waitMs`.
     */
    async withParticipantLock<T>(
      id: string,
      fn: (lease: ParticipantAccessLease) => Promise<T>,
      {
        waitMs = 10_000,
        leaseMs = 10 * 60_000,
      }: { waitMs?: number; leaseMs?: number } = {},
    ): Promise<T | undefined> {
      const token = randomUUID();
      const deadline = Date.now() + waitMs;
      let expiresAt: number;
      for (;;) {
        const startedAt = Date.now();
        const acquired = await db
          .updateTable("business_partners")
          .set({
            access_lease_token: token,
            access_lease_until: sql<Date>`clock_timestamp() + make_interval(secs => ${leaseMs / 1000})`,
          })
          .where("id", "=", id)
          .where((eb) =>
            eb.or([
              eb("access_lease_until", "is", null),
              eb("access_lease_until", "<=", sql<Date>`clock_timestamp()`),
            ]),
          )
          .returning("id")
          .executeTakeFirst();
        if (acquired) {
          // Conservatively measure from before the query, so a slow response
          // never lets this process outlive the database's lease.
          expiresAt = startedAt + leaseMs;
          break;
        }
        if (Date.now() >= deadline) return undefined;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const controller = new AbortController();
      const loseLease = () => controller.abort(new ParticipantLeaseLostError());
      const lease: ParticipantAccessLease = {
        token,
        signal: controller.signal,
        assertActive() {
          if (Date.now() >= expiresAt) loseLease();
          controller.signal.throwIfAborted();
        },
      };
      let renewalTimer: ReturnType<typeof setTimeout> | undefined;
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let renewing: Promise<void> | undefined;
      let stopped = false;
      const schedule = () => {
        expiryTimer = setTimeout(
          loseLease,
          Math.max(0, expiresAt - Date.now()),
        );
        renewalTimer = setTimeout(
          () => {
            renewing = renew();
          },
          Math.max(1, leaseMs / 3),
        );
      };
      const renew = async () => {
        try {
          lease.assertActive();
          const startedAt = Date.now();
          const renewed = await db
            .updateTable("business_partners")
            .set({
              access_lease_until: sql<Date>`clock_timestamp() + make_interval(secs => ${leaseMs / 1000})`,
            })
            .where("id", "=", id)
            .where("access_lease_token", "=", token)
            .where("access_lease_until", ">", sql<Date>`clock_timestamp()`)
            .returning("id")
            .executeTakeFirst();
          if (!renewed) throw new ParticipantLeaseLostError();
          lease.assertActive();
          expiresAt = startedAt + leaseMs;
          clearTimeout(expiryTimer);
          if (!stopped) schedule();
        } catch {
          loseLease();
        }
      };
      schedule();
      try {
        lease.assertActive();
        const result = await fn(lease);
        lease.assertActive();
        return result;
      } finally {
        stopped = true;
        clearTimeout(renewalTimer);
        clearTimeout(expiryTimer);
        await renewing;
        await db
          .updateTable("business_partners")
          .set({ access_lease_token: null, access_lease_until: null })
          .where("id", "=", id)
          .where("access_lease_token", "=", token)
          .execute();
      }
    },

    async completeReadmission(
      id: string,
      caseId: string,
      credentialRequest: unknown,
      lease: ParticipantAccessLease,
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        lease.assertActive();
        const partner = await trx
          .updateTable("business_partners")
          .set({
            verification_status: "VERIFIED",
            revoked_at: null,
            revocation_reason: "",
            revocation_checks: JSON.stringify([]),
            updated_at: new Date(),
          })
          .where("id", "=", id)
          .where("verification_status", "=", "REVOKED")
          .where("access_lease_token", "=", lease.token)
          .where("access_lease_until", ">", sql<Date>`clock_timestamp()`)
          .returning("id")
          .executeTakeFirst();
        if (!partner) throw new ParticipantLeaseLostError();
        await trx
          .updateTable("onboarding_cases")
          .set({
            state: "READY_FOR_PARTICIPANT",
            credential_request: JSON.stringify(credentialRequest),
            credential_receipts: JSON.stringify([]),
            updated_at: new Date(),
          })
          .where("id", "=", caseId)
          .where("business_partner_id", "=", id)
          .where("state", "=", "REVOKED")
          .returning("id")
          .executeTakeFirstOrThrow();
        lease.assertActive();
      });
    },

    async setRevocationChecks(
      id: string,
      checks: unknown[],
      lease: ParticipantAccessLease,
    ): Promise<void> {
      lease.assertActive();
      const result = await db
        .updateTable("business_partners")
        .set({
          revocation_checks: JSON.stringify(checks),
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .where("access_lease_token", "=", lease.token)
        .where("access_lease_until", ">", sql<Date>`clock_timestamp()`)
        .executeTakeFirst();
      if (result.numUpdatedRows !== 1n) throw new ParticipantLeaseLostError();
    },

    async nextLocalBpnValue(): Promise<string> {
      const result = await sql<{
        value: string;
      }>`SELECT nextval('local_bpn_sequence')::text AS value`.execute(db);
      return result.rows[0]?.value ?? "1";
    },
  };
}
