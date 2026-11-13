import { afterEach, describe, expect, it, vi } from 'vitest'
import { create } from '../../dataProvider/resources/policy/resource'

function stubConnector() {
  const fetchMock = vi.fn(
    async (..._args: unknown[]) =>
      new Response(JSON.stringify({ '@type': 'IdResponse', '@id': 'created' }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const sentId = (fetchMock: ReturnType<typeof stubConnector>) =>
  JSON.parse(String((fetchMock.mock.calls[0][1] as { body?: unknown }).body))['@id']

const policy = { policy: { type: 'odrl:Set', permissions: [], prohibitions: [], obligations: [] } }

describe('Policy definition request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends a generated ID, which Tractus-X EDC 0.13 requires', async () => {
    const fetchMock = stubConnector()

    await create({ data: policy })

    expect(sentId(fetchMock)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('keeps an ID chosen by the user', async () => {
    const fetchMock = stubConnector()

    await create({ data: { ...policy, id: 'membership-policy' } })

    expect(sentId(fetchMock)).toBe('membership-policy')
  })
})
