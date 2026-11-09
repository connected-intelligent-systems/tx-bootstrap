/**
 * Headers for provider-controlled bytes served on the portal origin.
 *
 * A sandboxed CSP renders documents in an opaque origin without scripts, and
 * nosniff stops browsers from reinterpreting a response as another type. They
 * replace both upstream values and the portal's own defaults.
 */
export const UNTRUSTED_CONTENT_HEADERS = {
  'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const
