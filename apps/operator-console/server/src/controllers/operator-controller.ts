import type { Config } from "../config/index.js";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import type { createAuth } from "../http/auth.js";
import { createParticipantApprovalService } from "../services/participant-approval-service.js";
import { createParticipantLifecycleService } from "@tx-bootstrap/core/server/services/participant-lifecycle-service.js";
import { createAdminParticipantActions } from "./admin-participant-actions.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { participantsToCsv } from "../utils/csv.js";

type OperatorAuth = ReturnType<typeof createAuth>;

export function createOperatorController({
  config,
  repositories,
  auth,
  emailService,
}: {
  config: Config;
  repositories: Repositories;
  auth: OperatorAuth;
  emailService: EmailService;
}) {
  const {
    businessPartners,
    issuerPolicyClaims,
    onboardingCases,
    participantEvents,
  } = repositories;
  const approvalService = createParticipantApprovalService({
    config,
    issuerPolicyClaims,
  });
  const lifecycle = createParticipantLifecycleService({
    auth,
    businessPartners,
    issuerDid: config.issuer.did,
    onboardingCases,
    participantEvents,
    approvalService,
  });
  const participantActions = createAdminParticipantActions({
    businessPartners,
    lifecycle,
    onboardingCases,
    emailService,
  });

  async function listParticipants(
    filters?: import("@tx-bootstrap/core/server/db/repositories/business-partners.js").ListPartnersFilters,
  ) {
    return lifecycle.listParticipants(filters);
  }

  async function getDashboardStats() {
    return onboardingCases.getDashboardStats();
  }

  async function getParticipantEvents(participantId: string) {
    return participantEvents.listForBusinessPartners([participantId]);
  }

  async function exportParticipantsCsv(
    filters?: import("@tx-bootstrap/core/server/db/repositories/business-partners.js").ListPartnersFilters,
  ) {
    const participants = await businessPartners.list(filters);
    return participantsToCsv(participants);
  }

  return {
    approvalService,
    listParticipants,
    getDashboardStats,
    getParticipantEvents,
    exportParticipantsCsv,
    ...participantActions,
  };
}

export type OperatorController = ReturnType<typeof createOperatorController>;
