export type PolicyRightOperand =
  | string
  | number
  | boolean
  | Date
  | Array<string | number | boolean>;

export interface PolicyConstraint {
  leftOperand: string;
  operator: string;
  rightOperand: PolicyRightOperand;
}

export interface PolicyPermission {
  action: string;
  constraints?: PolicyConstraint[];
}

export interface PolicyProhibition {
  action: string;
  constraints?: PolicyConstraint[];
}

export interface PolicyObligation {
  action: string;
  constraints?: PolicyConstraint[];
}

export interface PolicyRule {
  permissions?: PolicyPermission[];
  prohibitions?: PolicyProhibition[];
  obligations?: PolicyObligation[];
  target?: string;
}

export interface Policy {
  id: string;

  // Basic properties
  name: string;
  description?: string;
  createdAt?: string;

  // Policy content
  type: string;
  policyType?: string;
  rules: PolicyRule;

  // Internal properties (not exposed to users)
  privateProperties?: {
    [key: string]: any;
  };

  // Raw JSON-LD representation
  raw?: any;
}

// Form data interface for create/edit operations
export interface PolicyFormData extends Partial<Policy> {
  // Allow additional fields during form editing
  [key: string]: any;
}
