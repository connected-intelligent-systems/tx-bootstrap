import type { Kysely } from "kysely";
import type { Database, OnboardingCaseInsert } from "../database.js";

const jsonColumns = [
  "credential_request",
  "setup_checks",
  "credential_receipts",
] as const;

function serializeJsonColumns<T extends Partial<OnboardingCaseInsert>>(
  row: T,
): T {
  const serialized = { ...row } as Partial<OnboardingCaseInsert>;
  for (const column of jsonColumns) {
    const value = serialized[column];
    if (value !== undefined && typeof value !== "string") {
      serialized[column] = JSON.stringify(value);
    }
  }
  return serialized as T;
}

export function createOnboardingCaseRepository(db: Kysely<Database>) {
  return {
    /**
     * Get a single case by ID with joined business partner data
     */
    async getWithBusinessPartner(id: string) {
      return db
        .selectFrom("onboarding_cases as c")
        .leftJoin("business_partners as bp", "bp.id", "c.business_partner_id")
        .select([
          // Case fields
          "c.id",
          "c.participant_token_hash",
          "c.business_partner_id",
          "c.organization_name",
          "c.requested_bpn",
          "c.bpn",
          "c.did",
          "c.dsp_endpoint",
          "c.identityhub_credential_service_endpoint",
          "c.contact_email",
          "c.requested_role",
          "c.state",
          "c.admin_notes",
          "c.rejection_reason",
          "c.issuer_did",
          "c.credential_request",
          "c.setup_checks",
          "c.setup_attempt_count",
          "c.setup_started_at",
          "c.setup_next_attempt_at",
          "c.credential_receipts",
          "c.created_at",
          "c.updated_at",
          // Business partner fields (prefixed with bp_)
          "bp.id as bp_id",
          "bp.legal_name as bp_legal_name",
          "bp.legal_form as bp_legal_form",
          "bp.registered_address as bp_registered_address",
          "bp.country as bp_country",
          "bp.tax_id as bp_tax_id",
          "bp.commercial_register_number as bp_commercial_register_number",
          "bp.website as bp_website",
          "bp.contact_email as bp_contact_email",
          "bp.requested_bpn as bp_requested_bpn",
          "bp.assigned_bpn as bp_assigned_bpn",
          "bp.bpn_source as bp_bpn_source",
          "bp.external_authority as bp_external_authority",
          "bp.verification_status as bp_verification_status",
          "bp.verification_notes as bp_verification_notes",
          "bp.verified_at as bp_verified_at",
          "bp.created_at as bp_created_at",
          "bp.updated_at as bp_updated_at",
        ])
        .where("c.id", "=", id)
        .executeTakeFirst();
    },

    /**
     * List cases for specific business partners
     */
    async listForBusinessPartners(businessPartnerIds: string[]) {
      return db
        .selectFrom("onboarding_cases as c")
        .leftJoin("business_partners as bp", "bp.id", "c.business_partner_id")
        .select([
          // Case fields
          "c.id",
          "c.participant_token_hash",
          "c.business_partner_id",
          "c.organization_name",
          "c.requested_bpn",
          "c.bpn",
          "c.did",
          "c.dsp_endpoint",
          "c.identityhub_credential_service_endpoint",
          "c.contact_email",
          "c.requested_role",
          "c.state",
          "c.admin_notes",
          "c.rejection_reason",
          "c.issuer_did",
          "c.credential_request",
          "c.setup_checks",
          "c.setup_attempt_count",
          "c.setup_started_at",
          "c.setup_next_attempt_at",
          "c.credential_receipts",
          "c.created_at",
          "c.updated_at",
          // Business partner fields (prefixed with bp_)
          "bp.id as bp_id",
          "bp.legal_name as bp_legal_name",
          "bp.legal_form as bp_legal_form",
          "bp.registered_address as bp_registered_address",
          "bp.country as bp_country",
          "bp.tax_id as bp_tax_id",
          "bp.commercial_register_number as bp_commercial_register_number",
          "bp.website as bp_website",
          "bp.contact_email as bp_contact_email",
          "bp.requested_bpn as bp_requested_bpn",
          "bp.assigned_bpn as bp_assigned_bpn",
          "bp.bpn_source as bp_bpn_source",
          "bp.external_authority as bp_external_authority",
          "bp.verification_status as bp_verification_status",
          "bp.verification_notes as bp_verification_notes",
          "bp.verified_at as bp_verified_at",
          "bp.created_at as bp_created_at",
          "bp.updated_at as bp_updated_at",
        ])
        .where("c.business_partner_id", "in", businessPartnerIds)
        .orderBy("c.updated_at", "desc")
        .execute();
    },

    /**
     * Get the latest case for a business partner
     */
    async getLatestForBusinessPartner(businessPartnerId: string) {
      return db
        .selectFrom("onboarding_cases as c")
        .leftJoin("business_partners as bp", "bp.id", "c.business_partner_id")
        .select([
          // Case fields
          "c.id",
          "c.participant_token_hash",
          "c.business_partner_id",
          "c.organization_name",
          "c.requested_bpn",
          "c.bpn",
          "c.did",
          "c.dsp_endpoint",
          "c.identityhub_credential_service_endpoint",
          "c.contact_email",
          "c.requested_role",
          "c.state",
          "c.admin_notes",
          "c.rejection_reason",
          "c.issuer_did",
          "c.credential_request",
          "c.setup_checks",
          "c.setup_attempt_count",
          "c.setup_started_at",
          "c.setup_next_attempt_at",
          "c.credential_receipts",
          "c.created_at",
          "c.updated_at",
          // Business partner fields (prefixed with bp_)
          "bp.id as bp_id",
          "bp.legal_name as bp_legal_name",
          "bp.legal_form as bp_legal_form",
          "bp.registered_address as bp_registered_address",
          "bp.country as bp_country",
          "bp.tax_id as bp_tax_id",
          "bp.commercial_register_number as bp_commercial_register_number",
          "bp.website as bp_website",
          "bp.contact_email as bp_contact_email",
          "bp.requested_bpn as bp_requested_bpn",
          "bp.assigned_bpn as bp_assigned_bpn",
          "bp.bpn_source as bp_bpn_source",
          "bp.external_authority as bp_external_authority",
          "bp.verification_status as bp_verification_status",
          "bp.verification_notes as bp_verification_notes",
          "bp.verified_at as bp_verified_at",
          "bp.created_at as bp_created_at",
          "bp.updated_at as bp_updated_at",
        ])
        .where("c.business_partner_id", "=", businessPartnerId)
        .orderBy("c.updated_at", "desc")
        .limit(1)
        .executeTakeFirst();
    },

    /**
     * Insert a new onboarding case
     */
    async insert(row: OnboardingCaseInsert) {
      const result = await db
        .insertInto("onboarding_cases")
        .values(serializeJsonColumns(row))
        .returning("id")
        .executeTakeFirstOrThrow();
      return result.id;
    },

    /**
     * Update case state and related fields
     */
    async updateState(
      id: string,
      state:
        | "REQUESTED"
        | "IN_REVIEW"
        | "READY_FOR_PARTICIPANT"
        | "CREDENTIALS_REQUESTED"
        | "REJECTED"
        | "FAILED",
      additionalFields?: Partial<OnboardingCaseInsert>,
    ) {
      return db
        .updateTable("onboarding_cases")
        .set({
          state,
          ...serializeJsonColumns(additionalFields ?? {}),
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .returning("id")
        .executeTakeFirst();
    },

    /**
     * Update technical metadata
     */
    async updateTechnicalMetadata(
      id: string,
      metadata: {
        did: string;
        dsp_endpoint: string;
        identityhub_credential_service_endpoint: string;
      },
    ) {
      return db
        .updateTable("onboarding_cases")
        .set({
          ...metadata,
          state: "IN_REVIEW",
          setup_checks: JSON.stringify([]),
          setup_attempt_count: 0,
          setup_started_at: null,
          setup_next_attempt_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .where("state", "in", ["REQUESTED", "IN_REVIEW", "FAILED"])
        .where("setup_started_at", "is", null)
        .returning("id")
        .executeTakeFirst();
    },

    /**
     * Update unverified onboarding metadata
     */
    async updateUnverifiedMetadata(
      businessPartnerId: string,
      data: {
        organizationName: string;
        contactEmail: string;
        requestedBpn: string;
      },
    ) {
      return db
        .updateTable("onboarding_cases as c")
        .set({
          organization_name: data.organizationName,
          contact_email: data.contactEmail,
          requested_bpn: data.requestedBpn,
          updated_at: new Date(),
        })
        .from("business_partners as bp")
        .where("c.business_partner_id", "=", businessPartnerId)
        .where("bp.id", "=", businessPartnerId)
        .where((eb) =>
          eb.or([
            eb("bp.verification_status", "!=", "VERIFIED"),
            eb("bp.verification_status", "is", null),
          ]),
        )
        .execute();
    },

    /**
     * Reject cases for a business partner
     */
    async rejectForBusinessPartner(businessPartnerId: string, reason: string) {
      return db
        .updateTable("onboarding_cases")
        .set({
          state: "REJECTED",
          rejection_reason: reason,
          updated_at: new Date(),
        })
        .where("business_partner_id", "=", businessPartnerId)
        .where("state", "not in", ["CREDENTIALS_REQUESTED"])
        .execute();
    },

    /**
     * Get dashboard statistics
     */
    async getDashboardStats() {
      const result = await db
        .selectFrom("onboarding_cases")
        .select((eb) => [
          eb.fn.count("id").as("total"),
          eb.fn
            .count("id")
            .filterWhere("state", "=", "REQUESTED")
            .as("requested"),
          eb.fn
            .count("id")
            .filterWhere("state", "=", "IN_REVIEW")
            .as("in_review"),
          eb.fn
            .count("id")
            .filterWhere("state", "=", "READY_FOR_PARTICIPANT")
            .as("ready_for_participant"),
          eb.fn
            .count("id")
            .filterWhere("state", "=", "CREDENTIALS_REQUESTED")
            .as("credentials_requested"),
          eb.fn
            .count("id")
            .filterWhere("state", "=", "REJECTED")
            .as("rejected"),
          eb.fn.count("id").filterWhere("state", "=", "FAILED").as("failed"),
        ])
        .executeTakeFirst();

      const recentCases = await db
        .selectFrom("onboarding_cases")
        .select((eb) => eb.fn.count("id").as("count"))
        .where(
          "created_at",
          ">=",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        ) // Last 7 days
        .executeTakeFirst();

      return {
        total: Number(result?.total ?? 0),
        byStatus: {
          requested: Number(result?.requested ?? 0),
          inReview: Number(result?.in_review ?? 0),
          readyForParticipant: Number(result?.ready_for_participant ?? 0),
          credentialsRequested: Number(result?.credentials_requested ?? 0),
          rejected: Number(result?.rejected ?? 0),
          failed: Number(result?.failed ?? 0),
        },
        recentActivity: Number(recentCases?.count ?? 0),
      };
    },
  };
}

export type OnboardingCaseRepository = ReturnType<
  typeof createOnboardingCaseRepository
>;
