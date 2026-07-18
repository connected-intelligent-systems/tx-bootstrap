import type { Kysely } from "kysely";
import type { Database, IssuerClaimsDatabase } from "../database.js";
import { createBusinessPartnerRepository } from "./business-partners.js";
import { createIssuerPolicyClaimsRepository } from "./issuer-policy-claims.js";
import { createOnboardingCaseRepository } from "./onboarding-cases.js";
import { createParticipantEventRepository } from "./participant-events.js";

export function createRepositories(
  db: Kysely<Database>,
  issuerClaimsDb: Kysely<IssuerClaimsDatabase> | null,
) {
  return {
    businessPartners: createBusinessPartnerRepository(db),
    issuerPolicyClaims: createIssuerPolicyClaimsRepository(issuerClaimsDb),
    onboardingCases: createOnboardingCaseRepository(db),
    participantEvents: createParticipantEventRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
