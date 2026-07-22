import { describe, expect, it } from "vitest";
import type { OnboardingCaseRow } from "../db/database.js";
import { CredentialState } from "./constants.js";
import { deriveCredentialState } from "./participant-mappers.js";

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
