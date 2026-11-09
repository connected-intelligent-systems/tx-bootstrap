import { describe, expect, it } from "vitest";
import type { BusinessPartnerRow, OnboardingCaseRow } from "../db/database.js";
import { CredentialState, ParticipantStage } from "./constants.js";
import {
  deriveCredentialState,
  deriveParticipantStage,
  nextParticipantAction,
  toRevocationDto,
} from "./participant-mappers.js";

describe("deriveCredentialState", () => {
  it("does not treat a requested receipt as issued", () => {
    expect(
      deriveCredentialState(onboardingCase("CREDENTIALS_REQUESTED"), [
        { status: "requested" },
      ]),
    ).toBe(CredentialState.REQUESTED);
  });

  it("uses the latest receipt when a failed request is retried", () => {
    expect(
      deriveCredentialState(onboardingCase("CREDENTIALS_REQUESTED"), [
        { status: "failed" },
        { status: "requested" },
      ]),
    ).toBe(CredentialState.REQUESTED);
  });

  it("reports issued only after an issued receipt", () => {
    expect(
      deriveCredentialState(onboardingCase("CREDENTIALS_REQUESTED"), [
        { status: "issued" },
      ]),
    ).toBe(CredentialState.ISSUED);
  });
});

function onboardingCase(state: OnboardingCaseRow["state"]): OnboardingCaseRow {
  return { state } as OnboardingCaseRow;
}

describe("participant revocation", () => {
  const partner = {
    verification_status: "REVOKED",
    revoked_at: new Date("2026-11-09T12:00:00Z"),
    revocation_reason: "Left the project",
    revocation_checks: [
      { name: "issuer-holder-block", status: "ok", message: "" },
      { name: "bdrs-removal", status: "ok", message: "" },
      { name: "tunnel-revocation", status: "skipped", message: "" },
    ],
    updated_at: new Date("2026-11-09T12:00:00Z"),
  } as unknown as BusinessPartnerRow;
  const issuedCase = {
    state: "REVOKED",
  } as unknown as OnboardingCaseRow;

  it("puts revocation ahead of every other stage", () => {
    expect(deriveParticipantStage(partner, issuedCase)).toBe(
      ParticipantStage.REVOKED,
    );
  });

  it("reports a revocation as complete when every step is done or not applicable", () => {
    expect(toRevocationDto(partner)).toEqual({
      revokedAt: "2026-11-09T12:00:00.000Z",
      reason: "Left the project",
      checks: partner.revocation_checks,
      complete: true,
      failed: false,
    });
    const failed = {
      ...partner,
      revocation_checks: [
        { name: "bdrs-removal", status: "failed", message: "" },
        { name: "tunnel-revocation", status: "pending", message: "" },
      ],
    } as unknown as BusinessPartnerRow;
    expect(toRevocationDto(failed)).toMatchObject({
      complete: false,
      failed: true,
    });
  });

  it("reports pending steps as in progress, not failed", () => {
    const pending = {
      ...partner,
      revocation_checks: [
        { name: "tunnel-revocation", status: "pending", message: "" },
      ],
    } as unknown as BusinessPartnerRow;
    expect(toRevocationDto(pending)).toMatchObject({
      complete: false,
      failed: false,
    });
  });

  it("describes revoked and rejected participants", () => {
    expect(
      nextParticipantAction(
        ParticipantStage.REVOKED,
        partner,
        issuedCase,
        true,
      ),
    ).toBe("Revoked: Left the project");
    expect(
      nextParticipantAction(
        ParticipantStage.REVOKED,
        {
          ...partner,
          revocation_checks: [
            { name: "readmission", status: "pending", message: "" },
          ],
        } as unknown as BusinessPartnerRow,
        issuedCase,
        true,
      ),
    ).toMatch(/^Revocation in progress/);
    expect(
      nextParticipantAction(
        ParticipantStage.REJECTED,
        {
          ...partner,
          verification_status: "REJECTED",
          verification_notes: "Not eligible",
        } as unknown as BusinessPartnerRow,
        undefined,
        true,
      ),
    ).toBe("Not eligible");
  });

  it("has no revocation for active participants", () => {
    expect(
      toRevocationDto({
        ...partner,
        verification_status: "VERIFIED",
      } as unknown as BusinessPartnerRow),
    ).toBeNull();
  });
});
