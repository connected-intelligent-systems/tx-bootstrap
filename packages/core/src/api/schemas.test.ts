import { describe, expect, it } from "vitest";
import { technicalMetadataUpdateSchema } from "./schemas.js";

const valid = {
  did: "did:web:provider.example",
  dspEndpoint: "https://provider.example/api/v1/dsp",
  identityHubCredentialServiceEndpoint:
    "https://provider.example/api/credentials/v1/participants/abc",
};

describe("HTTP URL fields", () => {
  it("accept ordinary absolute endpoints", () => {
    expect(technicalMetadataUpdateSchema.safeParse(valid).success).toBe(true);
    expect(
      technicalMetadataUpdateSchema.safeParse({
        ...valid,
        dspEndpoint: "https://provider.example:8443/dsp?tenant=a%20b#x",
      }).success,
    ).toBe(true);
  });

  it.each([
    "https://provider.example/{dsp}",
    "https://provider.example/dsp|v1",
    'https://provider.example/"dsp"',
    "https://provider.example/d sp",
    "https://provider.example/dsp^",
    "https://provider.example/dsp`",
    "https://provider.example/a\\b",
    "https://provider.example/<dsp>",
  ])(
    "reject %s, which URL parsing accepts but RDF IRIs do not",
    (dspEndpoint) => {
      expect(new URL(dspEndpoint).protocol).toBe("https:");
      expect(
        technicalMetadataUpdateSchema.safeParse({ ...valid, dspEndpoint })
          .success,
      ).toBe(false);
    },
  );
});
