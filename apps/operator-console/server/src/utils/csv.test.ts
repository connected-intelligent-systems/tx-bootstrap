import type { BusinessPartnerRow } from "@tx-bootstrap/core/server/db/database.js";
import { describe, expect, it } from "vitest";
import { participantsToCsv } from "./csv.js";

const participant = {
  id: "partner-1",
  legal_name: "=2+3",
  legal_form: " +CMD",
  registered_address: "Example Street 1",
  country: "DE",
  tax_id: "\t=FORMULA",
  commercial_register_number: "HRB 123",
  website: "@SUM(1,1)",
  contact_email: "-1",
  requested_bpn: "BPNLREQUESTED001",
  assigned_bpn: "BPNLASSIGNED0001",
  bpn_source: "LOCAL",
  external_authority: "Authority",
  verification_status: "VERIFIED",
  verification_notes: 'normal, "quoted"\r\nline',
  verified_at: new Date("2026-01-01T00:00:00Z"),
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
} satisfies BusinessPartnerRow;

describe("participantsToCsv", () => {
  it("neutralizes spreadsheet formulas in participant-controlled fields", () => {
    const csv = participantsToCsv([participant]);

    expect(csv).toContain(`,'=2+3,' +CMD,`);
    expect(csv).toContain(",'\t=FORMULA,");
    expect(csv).toContain(`,"'@SUM(1,1)",'-1,`);
  });

  it("continues to quote CSV control characters", () => {
    const csv = participantsToCsv([participant]);

    expect(csv).toContain('"normal, ""quoted""\r\nline"');
  });
});
