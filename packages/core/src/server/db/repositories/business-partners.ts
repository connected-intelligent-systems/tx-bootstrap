import { sql, type Kysely } from "kysely";
import type {
  BusinessPartnerInsert,
  BusinessPartnerRow,
  Database,
} from "../database.js";

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
            "UNVERIFIED" | "IN_REVIEW" | "VERIFIED" | "REJECTED",
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

    async nextLocalBpnValue(): Promise<string> {
      const result = await sql<{
        value: string;
      }>`SELECT nextval('local_bpn_sequence')::text AS value`.execute(db);
      return result.rows[0]?.value ?? "1";
    },
  };
}
