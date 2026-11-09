import { isRecord } from './objects.js'

/** Match the operator's request against usable credentials in the local wallet. */
export function hasExpectedCredentials(
  payload: unknown,
  request: unknown,
  participantDid: string,
  now = Date.now(),
): boolean {
  if (!isRecord(request) || typeof request.issuerDid !== 'string' || !request.issuerDid || !participantDid) return false
  if (!Array.isArray(request.credentials) || !request.credentials.length) return false
  const records = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.credentials)
      ? payload.credentials
      : isRecord(payload) && Array.isArray(payload.content)
        ? payload.content
        : []

  const usable = records.filter(isRecord).filter((record) => {
    // IdentityHub VcStatus.ISSUED is 500; other lifecycle states cannot be
    // used, even when a verifiableCredential object is still present.
    if (!['500', 'ISSUED'].includes(String(record.status ?? record.state ?? '').toUpperCase())) return false
    const credential = credentialObject(record)
    const issuer = isRecord(credential.issuer) ? credential.issuer.id : credential.issuer
    if (issuer !== request.issuerDid) return false
    const subjects = Array.isArray(credential.credentialSubject)
      ? credential.credentialSubject
      : [credential.credentialSubject]
    if (!subjects.some((subject) => isRecord(subject) && subject.id === participantDid)) return false
    for (const end of [credential.expirationDate, credential.validUntil]) {
      if (end !== undefined && (typeof end !== 'string' || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= now))
        return false
    }
    for (const start of [credential.issuanceDate, credential.validFrom]) {
      if (
        start !== undefined &&
        (typeof start !== 'string' || !Number.isFinite(Date.parse(start)) || Date.parse(start) > now)
      )
        return false
    }
    return true
  })
  return request.credentials.every((expected) => {
    if (!isRecord(expected)) return false
    return usable.some((record) => {
      const credential = credentialObject(record)
      const types = Array.isArray(credential.type) ? credential.type : [credential.type]
      if (typeof expected.type === 'string' && expected.type) return types.includes(expected.type)
      return (
        typeof expected.id === 'string' && !!expected.id && (record.id === expected.id || credential.id === expected.id)
      )
    })
  })
}

function credentialObject(record: Record<string, unknown>): Record<string, unknown> {
  const container = isRecord(record.verifiableCredential) ? record.verifiableCredential : record
  return isRecord(container.credential)
    ? container.credential
    : isRecord(record.credential)
      ? record.credential
      : record
}
