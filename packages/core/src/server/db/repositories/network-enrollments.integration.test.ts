import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { Database } from "../database.js";
import { createNetworkEnrollmentRepository } from "./network-enrollments.js";

// CI supplies a disposable PostgreSQL instance. Each test owns a fresh schema;
// this suite never reads or changes application tables.
describe.skipIf(!process.env.TXB_TEST_DATABASE_URL)(
  "enrollment recovery in PostgreSQL",
  () => {
    let pool: pg.Pool;
    let db: Kysely<Database>;
    let schema: string;
    let repository: ReturnType<typeof createNetworkEnrollmentRepository>;
    const controlUrl = "https://headscale.example.org";
    const staleBefore = new Date(Date.now() - 60_000);

    beforeAll(() => {
      pool = new pg.Pool({
        connectionString: process.env.TXB_TEST_DATABASE_URL,
        max: 4,
      });
    });
    afterAll(async () => {
      await pool.end();
    });
    beforeEach(async () => {
      schema = `txb_network_test_${randomUUID().replaceAll("-", "")}`;
      const migration = await readFile(
        new URL(
          "../../../../db/migrations/0002_network_enrollments.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const client = await pool.connect();
      try {
        await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
        CREATE TABLE business_partners (id uuid PRIMARY KEY, assigned_bpn text, verification_status text);
        CREATE TABLE participant_events (id uuid PRIMARY KEY, business_partner_id uuid, onboarding_case_id uuid,
          actor text, action text, message text, payload jsonb);`);
        await client.query(migration);
      } finally {
        client.release();
      }
      db = new Kysely<Database>({
        dialect: new PostgresDialect({ pool }),
      }).withSchema(schema);
      repository = createNetworkEnrollmentRepository(db);
    });
    afterEach(async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    });

    async function reservation(
      options: { state?: string; ageMs?: number; url?: string } = {},
    ) {
      const participantId = randomUUID();
      const id = randomUUID();
      await pool.query(
        `INSERT INTO ${schema}.business_partners VALUES ($1, 'BPNL000000000001', 'VERIFIED')`,
        [participantId],
      );
      await pool.query(
        `INSERT INTO ${schema}.network_enrollments
      (id, business_partner_id, control_url, participant_tag, state, pre_auth_key_id, expires_at, updated_at)
      VALUES ($1, $2, $3, 'tag:txb-participant', $4, $5, now() + interval '15 minutes', $6)`,
        [
          id,
          participantId,
          options.url ?? controlUrl,
          options.state ?? "CREATING",
          options.state === "ISSUED" ? "7" : null,
          new Date(Date.now() - (options.ageMs ?? 120_000)),
        ],
      );
      return { id, participantId };
    }

    async function state(id: string) {
      return (
        await pool.query(
          `SELECT state FROM ${schema}.network_enrollments WHERE id=$1`,
          [id],
        )
      ).rows[0].state;
    }

    it("releases only abandoned reservations and records an audit event", async () => {
      const abandoned = await reservation();
      const recent = await reservation({ ageMs: 0 });
      const issued = await reservation({ state: "ISSUED" });
      const otherServer = await reservation({
        url: "https://other.example.org",
      });
      expect(await repository.recoverAbandoned(controlUrl, staleBefore)).toBe(
        1,
      );
      expect(await state(abandoned.id)).toBe("FAILED");
      expect(await state(recent.id)).toBe("CREATING");
      expect(await state(issued.id)).toBe("ISSUED");
      expect(await state(otherServer.id)).toBe("CREATING");
      const audit = await pool.query(
        `SELECT actor,action,payload FROM ${schema}.participant_events`,
      );
      expect(audit.rows).toEqual([
        {
          actor: "system:network-reconciler",
          action: "participant.network_enrollment_abandoned",
          payload: { deploymentId: abandoned.id, provider: "headscale" },
        },
      ]);
      await expect(
        repository.reserve({
          id: randomUUID(),
          participantId: abandoned.participantId,
          controlUrl,
          participantTag: "tag:txb-participant",
          expiresAt: new Date(Date.now() + 900_000),
        }),
      ).resolves.toMatchObject({ state: "CREATING" });
    });

    it("skips a reservation locked by an active issuer without waiting", async () => {
      const pending = await reservation();
      const issuer = await pool.connect();
      try {
        await issuer.query("BEGIN");
        await issuer.query(
          `SELECT id FROM ${schema}.network_enrollments WHERE id=$1 FOR UPDATE`,
          [pending.id],
        );
        expect(await repository.recoverAbandoned(controlUrl, staleBefore)).toBe(
          0,
        );
        expect(await state(pending.id)).toBe("CREATING");
        await issuer.query("COMMIT");
        expect(await repository.recoverAbandoned(controlUrl, staleBefore)).toBe(
          1,
        );
      } finally {
        await issuer.query("ROLLBACK");
        issuer.release();
      }
    });

    it("only selects issued enrollments of verified participants for routing", async () => {
      const verified = await reservation({ state: "ISSUED" });
      const revoked = await reservation({ state: "ISSUED" });
      await reservation();
      await pool.query(
        `UPDATE ${schema}.business_partners SET verification_status='REVOKED' WHERE id=$1`,
        [revoked.participantId],
      );
      expect(await repository.listIssued(controlUrl)).toEqual([
        {
          id: verified.id,
          pre_auth_key_id: "7",
          assigned_bpn: "BPNL000000000001",
        },
      ]);
    });

    it("rolls back recovery when its audit event cannot be committed", async () => {
      const pending = await reservation();
      await pool.query(
        `ALTER TABLE ${schema}.participant_events ADD CHECK (action <> 'participant.network_enrollment_abandoned')`,
      );
      await expect(
        repository.recoverAbandoned(controlUrl, staleBefore),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await state(pending.id)).toBe("CREATING");
    });

    it("recovers each reservation once across concurrent reconcilers", async () => {
      await reservation();
      const counts = await Promise.all([
        repository.recoverAbandoned(controlUrl, staleBefore),
        repository.recoverAbandoned(controlUrl, staleBefore),
      ]);
      expect(counts.sort()).toEqual([0, 1]);
      expect(
        (await pool.query(`SELECT count(*) FROM ${schema}.participant_events`))
          .rows[0].count,
      ).toBe("1");
    });
  },
);
