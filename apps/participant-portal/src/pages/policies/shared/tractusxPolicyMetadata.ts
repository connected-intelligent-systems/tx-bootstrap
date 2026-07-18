export type TractusXValueType =
  | "text"
  | "text-list"
  | "date"
  | "number"
  | "boolean";

export type TractusXAction = "access" | "use";
export type TractusXRuleType = "permission" | "prohibition" | "obligation";

export interface TractusXConstraintDefinition {
  id: string;
  label: string;
  actions: TractusXAction[];
  defaultAction: TractusXAction;
  ruleTypes: TractusXRuleType[];
  operators: string[];
  valueType: TractusXValueType;
  defaultValue: string | string[] | number | boolean;
}

const equalityOperators = ["eq", "neq"];
const listOperators = ["isAnyOf", "isAllOf", "isNoneOf", "isPartOf"];
const equalityAndListOperators = [...equalityOperators, ...listOperators];
const comparableOperators = ["eq", "neq", "gt", "gteq", "lt", "lteq"];

export const TRACTUSX_CONSTRAINTS: TractusXConstraintDefinition[] = [
  {
    id: "AffiliatesBpnl",
    label: "Affiliates BPNL",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission", "prohibition"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["BPNL000000000000"],
  },
  {
    id: "AffiliatesRegion",
    label: "Affiliates Region",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission", "prohibition"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["EU"],
  },
  {
    id: "BusinessPartnerGroup",
    label: "Business Partner Group",
    actions: ["access"],
    defaultAction: "access",
    ruleTypes: ["permission"],
    operators: equalityAndListOperators,
    valueType: "text-list",
    defaultValue: ["gold-partners"],
  },
  {
    id: "BusinessPartnerNumber",
    label: "Business Partner Number",
    actions: ["access"],
    defaultAction: "access",
    ruleTypes: ["permission"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["BPNL000000000000"],
  },
  {
    id: "ConfidentialInformationMeasures",
    label: "Confidential Information Measures",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["technical-and-organizational-measures"],
  },
  {
    id: "ConfidentialInformationSharing",
    label: "Confidential Information Sharing",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "allowed",
  },
  {
    id: "ContractReference",
    label: "Contract Reference",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "contract-reference",
  },
  {
    id: "ContractTermination",
    label: "Contract Termination",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "allowed",
  },
  {
    id: "DataFrequency",
    label: "Data Frequency",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: comparableOperators,
    valueType: "number",
    defaultValue: 1,
  },
  {
    id: "DataUsageEndDate",
    label: "Data Usage End Date",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: comparableOperators,
    valueType: "date",
    defaultValue: "",
  },
  {
    id: "DataUsageEndDefinition",
    label: "Data Usage End Definition",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "definition",
  },
  {
    id: "DataUsageEndDurationDays",
    label: "Data Usage End Duration Days",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: comparableOperators,
    valueType: "number",
    defaultValue: 30,
  },
  {
    id: "DataProvisioningEndDurationDays",
    label: "Data Provisioning End Duration Days",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["obligation"],
    operators: comparableOperators,
    valueType: "number",
    defaultValue: 30,
  },
  {
    id: "DataProvisioningEndDate",
    label: "Data Provisioning End Date",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["obligation"],
    operators: comparableOperators,
    valueType: "date",
    defaultValue: "",
  },
  {
    id: "ExclusiveUsage",
    label: "Exclusive Usage",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "boolean",
    defaultValue: true,
  },
  {
    id: "FrameworkAgreement",
    label: "Framework Agreement",
    actions: ["access", "use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "DataExchangeGovernance:1.0",
  },
  {
    id: "JurisdictionLocation",
    label: "Jurisdiction Location",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["DE"],
  },
  {
    id: "JurisdictionLocationReference",
    label: "Jurisdiction Location Reference",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "jurisdiction-reference",
  },
  {
    id: "Liability",
    label: "Liability",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "liable",
  },
  {
    id: "Membership",
    label: "Membership",
    actions: ["access", "use"],
    defaultAction: "access",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "active",
  },
  {
    id: "Precedence",
    label: "Precedence",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: comparableOperators,
    valueType: "number",
    defaultValue: 1,
  },
  {
    id: "UsagePurpose",
    label: "Usage Purpose",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: listOperators,
    valueType: "text-list",
    defaultValue: ["cx.core.industrycore:1"],
  },
  {
    id: "UsageRestriction",
    label: "Usage Restriction",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["prohibition"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "restricted",
  },
  {
    id: "VersionChanges",
    label: "Version Changes",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "allowed",
  },
  {
    id: "Warranty",
    label: "Warranty",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "provided",
  },
  {
    id: "WarrantyDefinition",
    label: "Warranty Definition",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: equalityOperators,
    valueType: "text",
    defaultValue: "warranty-definition",
  },
  {
    id: "WarrantyDurationMonths",
    label: "Warranty Duration Months",
    actions: ["use"],
    defaultAction: "use",
    ruleTypes: ["permission"],
    operators: comparableOperators,
    valueType: "number",
    defaultValue: 12,
  },
];

export const TRACTUSX_CONSTRAINT_IDS = new Set(
  TRACTUSX_CONSTRAINTS.map((constraint) => constraint.id)
);

export const getTractusXConstraint = (id?: string) =>
  TRACTUSX_CONSTRAINTS.find((constraint) => constraint.id === id);

export const getTractusXConstraintChoices = (
  ruleType?: TractusXRuleType,
  action?: TractusXAction
) =>
  TRACTUSX_CONSTRAINTS.filter((constraint) => {
    const matchesRuleType = ruleType
      ? constraint.ruleTypes.includes(ruleType)
      : true;
    const matchesAction = action ? constraint.actions.includes(action) : true;
    return matchesRuleType && matchesAction;
  }).map((constraint) => ({ id: constraint.id, name: constraint.label }));

export const getTractusXActionChoices = (ruleType?: TractusXRuleType) => {
  const actions = new Set<TractusXAction>();

  TRACTUSX_CONSTRAINTS.forEach((constraint) => {
    if (!ruleType || constraint.ruleTypes.includes(ruleType)) {
      constraint.actions.forEach((action) => actions.add(action));
    }
  });

  return Array.from(actions).map((action) => ({ id: action, name: action }));
};
