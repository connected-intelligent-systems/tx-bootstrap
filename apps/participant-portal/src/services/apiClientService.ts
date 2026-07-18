export async function apiClientRequest<T = unknown>(url: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, { ...init, headers })
  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}`)
  return payload
}
