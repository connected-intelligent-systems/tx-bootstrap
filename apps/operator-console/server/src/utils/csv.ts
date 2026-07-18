import type { BusinessPartnerRow } from "@tx-bootstrap/core/server/db/database.js";

/**
 * Escapes CSV syntax and prevents spreadsheet applications from evaluating
 * participant-controlled values as formulas.
 */
function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  const formulaSafeValue =
    /^[\t\r]/.test(stringValue) || /^ *[=+\-@]/.test(stringValue)
      ? `'${stringValue}`
      : stringValue;
  // If the field contains comma, quote, or newline, wrap it in quotes and escape internal quotes
  if (
    formulaSafeValue.includes(",") ||
    formulaSafeValue.includes('"') ||
    formulaSafeValue.includes("\n") ||
    formulaSafeValue.includes("\r")
  ) {
    return `"${formulaSafeValue.replace(/"/g, '""')}"`;
  }
  return formulaSafeValue;
}

/**
 * Formats a date for CSV export
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * Converts an array of business partners to CSV format
 */
export function participantsToCsv(participants: BusinessPartnerRow[]): string {
  const headers = [
    "ID",
    "Legal Name",
    "Legal Form",
    "Country",
    "Tax ID",
    "Commercial Register Number",
    "Website",
    "Contact Email",
    "Requested BPN",
    "Assigned BPN",
    "BPN Source",
    "External Authority",
    "Verification Status",
    "Verification Notes",
    "Verified At",
    "Created At",
    "Updated At",
  ];

  const rows = participants.map((p) => [
    escapeCsvField(p.id),
    escapeCsvField(p.legal_name),
    escapeCsvField(p.legal_form),
    escapeCsvField(p.country),
    escapeCsvField(p.tax_id),
    escapeCsvField(p.commercial_register_number),
    escapeCsvField(p.website),
    escapeCsvField(p.contact_email),
    escapeCsvField(p.requested_bpn),
    escapeCsvField(p.assigned_bpn),
    escapeCsvField(p.bpn_source),
    escapeCsvField(p.external_authority),
    escapeCsvField(p.verification_status),
    escapeCsvField(p.verification_notes),
    formatDate(p.verified_at),
    formatDate(p.created_at),
    formatDate(p.updated_at),
  ]);

  const csvLines = [headers.join(","), ...rows.map((row) => row.join(","))];
  return csvLines.join("\n");
}
