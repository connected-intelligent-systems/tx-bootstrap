import { describe, expect, it, vi } from 'vitest'
import { fetchAllRecords, fetchAllReferences } from '../../hooks/useAllRecords'

describe('paginated portal loaders', () => {
  it('loads list pages until the API reports no next page', async () => {
    const getList = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: '1' }], pageInfo: { hasNextPage: true } })
      .mockResolvedValueOnce({ data: [{ id: '2' }], pageInfo: { hasNextPage: false } })

    const records = await fetchAllRecords<{ id: string }>({ getList }, 'assets', { perPage: 1 })

    expect(records.map((record) => record.id)).toEqual(['1', '2'])
    expect(getList).toHaveBeenNthCalledWith(
      2,
      'assets',
      expect.objectContaining({ pagination: { page: 2, perPage: 1 } }),
    )
  })

  it('loads every referenced dataset page', async () => {
    const getManyReference = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'dataset-1' }], pageInfo: { hasNextPage: true } })
      .mockResolvedValueOnce({ data: [{ id: 'dataset-2' }], pageInfo: { hasNextPage: false } })

    const records = await fetchAllReferences<{ id: string }>({ getManyReference }, 'datasets', 'catalog-1', {
      target: 'catalogId',
      perPage: 1,
    })

    expect(records).toHaveLength(2)
    expect(getManyReference).toHaveBeenNthCalledWith(
      2,
      'datasets',
      expect.objectContaining({ id: 'catalog-1', target: 'catalogId', pagination: { page: 2, perPage: 1 } }),
    )
  })
})
