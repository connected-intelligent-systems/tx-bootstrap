import type { ColumnType, Insertable, Selectable } from "kysely";

export type TimestampColumn = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;
export type JsonColumn<T = unknown> = ColumnType<T, T | string, T | string>;

export type BusinessPartnerTable = {
  id: string;
  legal_name: string;
  legal_form: string;
  registered_address: string;
  country: string;
  tax_id: string;
  commercial_register_number: string;
  website: string;
  contact_email: string;
  requested_bpn: string;
  assigned_bpn: ColumnType<string, string | undefined, string>;
  bpn_source: ColumnType<
    "LOCAL" | "IMPORTED" | "EXTERNAL",
    "LOCAL" | "IMPORTED" | "EXTERNAL" | undefined,
    "LOCAL" | "IMPORTED" | "EXTERNAL"
  >;
  external_authority: ColumnType<string, string | undefined, string>;
  verification_status: ColumnType<
    "UNVERIFIED" | "IN_REVIEW" | "VERIFIED" | "REJECTED",
    "UNVERIFIED" | "IN_REVIEW" | "VERIFIED" | "REJECTED" | undefined,
    "UNVERIFIED" | "IN_REVIEW" | "VERIFIED" | "REJECTED"
  >;
  verification_notes: ColumnType<string, string | undefined, string>;
  verified_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
};

export type OnboardingCaseTable = {
  id: string;
  participant_token_hash: string;
  business_partner_id: string | null;
  organization_name: string;
  requested_bpn: string;
  bpn: string;
  did: string;
  dsp_endpoint: string;
  identityhub_credential_service_endpoint: string;
  contact_email: string;
  requested_role: string;
  state: ColumnType<
    | "REQUESTED"
    | "IN_REVIEW"
    | "READY_FOR_PARTICIPANT"
    | "CREDENTIALS_REQUESTED"
    | "REJECTED"
    | "FAILED",
    | "REQUESTED"
    | "IN_REVIEW"
    | "READY_FOR_PARTICIPANT"
    | "CREDENTIALS_REQUESTED"
    | "REJECTED"
    | "FAILED"
    | undefined,
    | "REQUESTED"
    | "IN_REVIEW"
    | "READY_FOR_PARTICIPANT"
    | "CREDENTIALS_REQUESTED"
    | "REJECTED"
    | "FAILED"
  >;
  admin_notes: string;
  rejection_reason: string;
  issuer_did: string;
  credential_request: JsonColumn;
  setup_checks: JsonColumn;
  setup_attempt_count: ColumnType<number, number | undefined, number>;
  setup_started_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  setup_next_attempt_at: TimestampColumn;
  credential_receipts: JsonColumn;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
};

export type ParticipantEventTable = {
  id: string;
  business_partner_id: string | null;
  onboarding_case_id: string | null;
  actor: string;
  action: string;
  message: string;
  payload: JsonColumn<Record<string, unknown>>;
  created_at: TimestampColumn;
};

export type SchemaMigrationTable = {
  filename: string;
  checksum: string;
  executed_at: TimestampColumn;
};

export type IssuerPolicyClaimsTable = {
  holder_id: string;
  holder_identifier: string;
  member_of: string;
  bpn: string;
  group_name: string;
  use_case: string;
  contract_template: string;
  contract_version: string;
  created_date: number;
  last_modified_date: number;
};

export type Database = {
  business_partners: BusinessPartnerTable;
  onboarding_cases: OnboardingCaseTable;
  participant_events: ParticipantEventTable;
  schema_migrations: SchemaMigrationTable;
};

export type IssuerClaimsDatabase = {
  custom_attestation_claims: IssuerPolicyClaimsTable;
};

export type BusinessPartnerRow = Selectable<BusinessPartnerTable>;
export type BusinessPartnerInsert = Insertable<BusinessPartnerTable>;
export type OnboardingCaseRow = Selectable<OnboardingCaseTable>;
export type OnboardingCaseInsert = Insertable<OnboardingCaseTable>;
export type ParticipantEventRow = Selectable<ParticipantEventTable>;
