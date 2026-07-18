import { describe, expect, it } from "vitest";
import {
  parsePolicyFromJsonLd,
  serializePolicyToJsonLd,
} from "../../dataProvider/resources/policy";
import {
  getTractusXConstraint,
  getTractusXConstraintChoices,
} from "../../pages/policies/shared/tractusxPolicyMetadata";

const EDC_NAMESPACE = "https://w3id.org/edc/v0.0.1/ns/";
const ODRL_NAMESPACE = "http://www.w3.org/ns/odrl/2/";
const CATENAX_POLICY_NAMESPACE = "https://w3id.org/catenax/policy/";

describe("Policy Transformers", () => {
  const sampleJsonLdPolicy = {
    "@id": "policy-123",
    "@type": "PolicyDefinition",
    privateProperties: {
      name: "Test Policy",
      description: "A test policy",
    },
    policy: {
      "@type": "odrl:Set",
      "odrl:permission": [
        {
          "odrl:action": {
            "@id": "odrl:use",
          },
        },
      ],
    },
  };

  it("should parse compact ODRL policy fields into editable policy data", async () => {
    const result = await parsePolicyFromJsonLd(sampleJsonLdPolicy);

    expect(result.id).toBe("policy-123");
    expect(result.name).toBe("Test Policy");
    expect(result.description).toBe("A test policy");
    expect(result.type).toBe("PolicyDefinition");
    expect(result.policyType).toBe("Set");
    expect(Array.isArray(result.rules.permissions)).toBe(true);
    expect(result.rules.permissions).toHaveLength(1);
    expect(result.rules.permissions?.[0].action).toBe("use");
  });

  it("should handle single permission object from the API", async () => {
    const singlePermissionPolicy = {
      "@id": "policy-456",
      "@type": "PolicyDefinition",
      privateProperties: {
        name: "Single Permission Policy",
        description: "A policy with single permission object",
      },
      policy: {
        "@type": "odrl:Set",
        "odrl:permission": {
          "odrl:action": {
            "@id": "odrl:read",
          },
        },
      },
    };

    const result = await parsePolicyFromJsonLd(singlePermissionPolicy);

    expect(result.id).toBe("policy-456");
    expect(result.name).toBe("Single Permission Policy");
    expect(Array.isArray(result.rules.permissions)).toBe(true);
    expect(result.rules.permissions).toHaveLength(1);
    expect(result.rules.permissions?.[0].action).toBe("read");
  });

  it("should serialize policies to official Tractus-X JSON-LD", async () => {
    const policyData = {
      name: "Test Policy",
      description: "A test policy",
      rules: {
        permissions: [
          {
            action: "use",
            constraints: [
              {
                leftOperand: "UsagePurpose",
                operator: "isAnyOf",
                rightOperand: ["cx.core.industrycore:1"],
              },
            ],
          },
        ],
      },
    };

    const result = await serializePolicyToJsonLd(policyData);

    expect(result["@context"]).toEqual([
      "https://w3id.org/dspace/2025/1/odrl-profile.jsonld",
      "https://w3id.org/catenax/2025/9/policy/context.jsonld",
      { "@vocab": "https://w3id.org/edc/v0.0.1/ns/" },
    ]);
    expect(result.policy["@type"]).toBe("Set");
    expect(result.policy.permission[0]).toEqual({
      action: "use",
      constraint: {
        leftOperand: "UsagePurpose",
        operator: "isAnyOf",
        rightOperand: ["cx.core.industrycore:1"],
      },
    });
    expect(result.policy["odrl:permission"]).toBeUndefined();
  });

  it("should serialize membership access policy with Tractus-X context", async () => {
    const result = await serializePolicyToJsonLd({
      name: "Membership",
      rules: {
        permissions: [
          {
            action: "access",
            constraints: [
              {
                leftOperand: "Membership",
                operator: "eq",
                rightOperand: "active",
              },
            ],
          },
        ],
      },
    });

    expect(result.policy.permission[0]).toEqual({
      action: "access",
      constraint: {
        leftOperand: "Membership",
        operator: "eq",
        rightOperand: "active",
      },
    });
  });

  it("should serialize BPN access policy with list-valued right operand", async () => {
    const result = await serializePolicyToJsonLd({
      name: "BPN",
      rules: {
        permissions: [
          {
            action: "access",
            constraints: [
              {
                leftOperand: "BusinessPartnerNumber",
                operator: "isAnyOf",
                rightOperand: ["BPNL000000000000"],
              },
            ],
          },
        ],
      },
    });

    expect(result.policy.permission[0].constraint.rightOperand).toEqual([
      "BPNL000000000000",
    ]);
  });

  it("should serialize usage policy with FrameworkAgreement and UsagePurpose joined by and", async () => {
    const result = await serializePolicyToJsonLd({
      name: "Data Exchange",
      rules: {
        permissions: [
          {
            action: "use",
            constraints: [
              {
                leftOperand: "FrameworkAgreement",
                operator: "eq",
                rightOperand: "DataExchangeGovernance:1.0",
              },
              {
                leftOperand: "UsagePurpose",
                operator: "isAnyOf",
                rightOperand: ["cx.core.industrycore:1"],
              },
            ],
          },
        ],
      },
    });

    expect(result.policy.permission[0].constraint).toEqual({
      and: [
        {
          leftOperand: "FrameworkAgreement",
          operator: "eq",
          rightOperand: "DataExchangeGovernance:1.0",
        },
        {
          leftOperand: "UsagePurpose",
          operator: "isAnyOf",
          rightOperand: ["cx.core.industrycore:1"],
        },
      ],
    });
  });

  it("should serialize prohibition and obligation rule buckets", async () => {
    const result = await serializePolicyToJsonLd({
      name: "Rules",
      rules: {
        prohibitions: [
          {
            action: "use",
            constraints: [
              {
                leftOperand: "UsageRestriction",
                operator: "eq",
                rightOperand: "restricted",
              },
            ],
          },
        ],
        obligations: [
          {
            action: "use",
            constraints: [
              {
                leftOperand: "DataProvisioningEndDurationDays",
                operator: "lteq",
                rightOperand: 30,
              },
            ],
          },
        ],
      },
    });

    expect(result.policy.prohibition).toHaveLength(1);
    expect(result.policy.obligation).toHaveLength(1);
  });

  it("should parse official Tractus-X policies and flatten and constraints", async () => {
    const result = await parsePolicyFromJsonLd({
      "@id": "tx-policy",
      "@type": "PolicyDefinition",
      privateProperties: { name: "Tractus-X" },
      policy: {
        "@type": "Set",
        permission: {
          action: "use",
          constraint: {
            and: [
              {
                leftOperand: "FrameworkAgreement",
                operator: "eq",
                rightOperand: "DataExchangeGovernance:1.0",
              },
              {
                leftOperand: "UsagePurpose",
                operator: "isAnyOf",
                rightOperand: ["cx.core.industrycore:1"],
              },
            ],
          },
        },
      },
    });

    expect(result.rules.permissions?.[0].action).toBe("use");
    expect(result.rules.permissions?.[0].constraints).toHaveLength(2);
    expect(result.rules.permissions?.[0].constraints?.[1].rightOperand).toEqual(
      ["cx.core.industrycore:1"]
    );
  });

  it("should parse walkthrough-style constraint arrays that contain an and node", async () => {
    const result = await parsePolicyFromJsonLd({
      "@id": "membership-deg",
      "@type": "PolicyDefinition",
      privateProperties: { name: "Membership DEG" },
      policy: {
        "@type": "Set",
        permission: [
          {
            action: "access",
            constraint: [
              {
                and: [
                  {
                    leftOperand: "Membership",
                    operator: "eq",
                    rightOperand: "active",
                  },
                  {
                    leftOperand: "FrameworkAgreement",
                    operator: "eq",
                    rightOperand: "DataExchangeGovernance:1.0",
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.rules.permissions?.[0]).toEqual({
      action: "access",
      constraints: [
        {
          leftOperand: "Membership",
          operator: "eq",
          rightOperand: "active",
        },
        {
          leftOperand: "FrameworkAgreement",
          operator: "eq",
          rightOperand: "DataExchangeGovernance:1.0",
        },
      ],
    });
  });

  it("should parse compact edc and odrl policy keys for editing", async () => {
    const result = await parsePolicyFromJsonLd({
      "@id": "compact-policy",
      "@type": "edc:PolicyDefinition",
      "edc:privateProperties": {
        "edc:name": "Compact Namespaces",
      },
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          {
            "odrl:action": { "@id": "odrl:use" },
            "odrl:constraint": {
              "odrl:and": [
                {
                  "odrl:leftOperand": { "@id": "cx-policy:FrameworkAgreement" },
                  "odrl:operator": { "@id": "odrl:eq" },
                  "odrl:rightOperand": "DataExchangeGovernance:1.0",
                },
                {
                  "odrl:leftOperand": { "@id": "cx-policy:UsagePurpose" },
                  "odrl:operator": { "@id": "odrl:isAnyOf" },
                  "odrl:rightOperand": ["cx.core.industrycore:1"],
                },
              ],
            },
          },
        ],
      },
    });

    expect(result.type).toBe("PolicyDefinition");
    expect(result.policyType).toBe("Set");
    expect(result.name).toBe("Compact Namespaces");
    expect(result.rules.permissions?.[0].action).toBe("use");
    expect(result.rules.permissions?.[0].constraints).toEqual([
      {
        leftOperand: "FrameworkAgreement",
        operator: "eq",
        rightOperand: "DataExchangeGovernance:1.0",
      },
      {
        leftOperand: "UsagePurpose",
        operator: "isAnyOf",
        rightOperand: ["cx.core.industrycore:1"],
      },
    ]);
  });

  it("should parse expanded IRI policy keys and values for editing", async () => {
    const result = await parsePolicyFromJsonLd({
      "@id": "expanded-policy",
      "@type": [{ "@id": `${EDC_NAMESPACE}PolicyDefinition` }],
      [`${EDC_NAMESPACE}privateProperties`]: [
        {
          [`${EDC_NAMESPACE}name`]: [{ "@value": "Expanded Namespaces" }],
        },
      ],
      [`${EDC_NAMESPACE}policy`]: [
        {
          "@type": [{ "@id": `${ODRL_NAMESPACE}Set` }],
          [`${ODRL_NAMESPACE}permission`]: [
            {
              [`${ODRL_NAMESPACE}action`]: [{ "@id": `${ODRL_NAMESPACE}use` }],
              [`${ODRL_NAMESPACE}constraint`]: [
                {
                  [`${ODRL_NAMESPACE}and`]: [
                    {
                      [`${ODRL_NAMESPACE}leftOperand`]: [
                        {
                          "@id": `${CATENAX_POLICY_NAMESPACE}FrameworkAgreement`,
                        },
                      ],
                      [`${ODRL_NAMESPACE}operator`]: [
                        { "@id": `${ODRL_NAMESPACE}eq` },
                      ],
                      [`${ODRL_NAMESPACE}rightOperand`]: [
                        { "@value": "DataExchangeGovernance:1.0" },
                      ],
                    },
                    {
                      [`${ODRL_NAMESPACE}leftOperand`]: [
                        { "@id": `${CATENAX_POLICY_NAMESPACE}UsagePurpose` },
                      ],
                      [`${ODRL_NAMESPACE}operator`]: [
                        { "@id": `${ODRL_NAMESPACE}isAnyOf` },
                      ],
                      [`${ODRL_NAMESPACE}rightOperand`]: [
                        { "@value": "cx.core.industrycore:1" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.type).toBe("PolicyDefinition");
    expect(result.policyType).toBe("Set");
    expect(result.name).toBe("Expanded Namespaces");
    expect(result.rules.permissions?.[0].action).toBe("use");
    expect(result.rules.permissions?.[0].constraints).toEqual([
      {
        leftOperand: "FrameworkAgreement",
        operator: "eq",
        rightOperand: "DataExchangeGovernance:1.0",
      },
      {
        leftOperand: "UsagePurpose",
        operator: "isAnyOf",
        rightOperand: ["cx.core.industrycore:1"],
      },
    ]);
  });

  it("should preserve data through round-trip transformation", async () => {
    const lifted = await parsePolicyFromJsonLd(sampleJsonLdPolicy);
    const lowered = await serializePolicyToJsonLd(lifted);
    const final = await parsePolicyFromJsonLd(lowered);

    expect(final.name).toBe(lifted.name);
    expect(final.description).toBe(lifted.description);
    expect(final.rules.permissions?.[0].action).toBe("use");
  });

  it("should handle policy with no name", async () => {
    const noNamePolicy = {
      "@id": "policy-no-name",
      "@type": "PolicyDefinition",
      policy: {
        "@type": "odrl:Set",
      },
    };

    const result = await parsePolicyFromJsonLd(noNamePolicy);
    expect(result.name).toBe("Untitled Policy");
  });

  it("should expose constraints using the official Tractus-X validation matrix", () => {
    expect(getTractusXConstraint("DataProvisioningEndDate")?.ruleTypes).toEqual(
      ["obligation"]
    );
    expect(
      getTractusXConstraint("DataProvisioningEndDurationDays")?.ruleTypes
    ).toEqual(["obligation"]);
    expect(getTractusXConstraint("UsageRestriction")?.ruleTypes).toEqual([
      "prohibition",
    ]);
    expect(getTractusXConstraint("FrameworkAgreement")?.actions).toEqual([
      "access",
      "use",
    ]);
    expect(getTractusXConstraint("Membership")?.actions).toEqual([
      "access",
      "use",
    ]);

    const accessPermissionIds = getTractusXConstraintChoices(
      "permission",
      "access"
    ).map((choice) => choice.id);
    expect(accessPermissionIds).toContain("BusinessPartnerNumber");
    expect(accessPermissionIds).toContain("FrameworkAgreement");
    expect(accessPermissionIds).toContain("Membership");
    expect(accessPermissionIds).not.toContain("UsagePurpose");

    const obligationIds = getTractusXConstraintChoices("obligation", "use").map(
      (choice) => choice.id
    );
    expect(obligationIds).toEqual([
      "DataProvisioningEndDurationDays",
      "DataProvisioningEndDate",
    ]);
  });
});
