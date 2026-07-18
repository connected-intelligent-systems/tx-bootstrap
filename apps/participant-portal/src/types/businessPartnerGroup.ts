export interface BusinessPartnerGroup {
  id: string
  groups: string[]
  raw?: any
}

export interface BusinessPartnerGroupFormData extends Partial<BusinessPartnerGroup> {
  [key: string]: any
}
