import { useCallback, useEffect, useState } from 'react'
import { useDataProvider } from 'react-admin'

type Sort = { field: string; order: 'ASC' | 'DESC' }

export type AllRecordsResult<T> = {
  data: T[]
  isPending: boolean
  error?: Error
  refresh: () => void
}

export async function fetchAllRecords<T>(
  dataProvider: any,
  resource: string,
  options: { sort?: Sort; filter?: Record<string, unknown>; perPage?: number } = {},
): Promise<T[]> {
  const perPage = options.perPage ?? 100
  const records: T[] = []
  let page = 1

  while (true) {
    const response = await dataProvider.getList(resource, {
      pagination: { page, perPage },
      sort: options.sort ?? { field: 'id', order: 'ASC' },
      filter: options.filter ?? {},
    })
    records.push(...response.data)
    if (!response.pageInfo?.hasNextPage) return records
    page += 1
  }
}

export async function fetchAllReferences<T>(
  dataProvider: any,
  resource: string,
  id: string,
  options: { target?: string; sort?: Sort; filter?: Record<string, unknown>; perPage?: number } = {},
): Promise<T[]> {
  const perPage = options.perPage ?? 100
  const records: T[] = []
  let page = 1

  while (true) {
    const response = await dataProvider.getManyReference(resource, {
      target: options.target ?? 'id',
      id,
      pagination: { page, perPage },
      sort: options.sort ?? { field: 'id', order: 'ASC' },
      filter: options.filter ?? {},
    })
    records.push(...response.data)
    if (!response.pageInfo?.hasNextPage) return records
    page += 1
  }
}

export function useAllRecords<T>(
  resource: string,
  options: { sort?: Sort; filter?: Record<string, unknown>; perPage?: number } = {},
): AllRecordsResult<T> {
  const dataProvider = useDataProvider()
  const [data, setData] = useState<T[]>([])
  const [isPending, setIsPending] = useState(true)
  const [error, setError] = useState<Error>()
  const [revision, setRevision] = useState(0)
  const sortField = options.sort?.field
  const sortOrder = options.sort?.order
  const filterKey = JSON.stringify(options.filter ?? {})
  const perPage = options.perPage

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    let active = true
    setIsPending(true)
    setError(undefined)
    fetchAllRecords<T>(dataProvider, resource, {
      sort: sortField && sortOrder ? { field: sortField, order: sortOrder } : undefined,
      filter: JSON.parse(filterKey),
      perPage,
    })
      .then((records) => {
        if (active) setData(records)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason : new Error(String(reason)))
      })
      .finally(() => {
        if (active) setIsPending(false)
      })
    return () => {
      active = false
    }
  }, [dataProvider, filterKey, perPage, resource, revision, sortField, sortOrder])

  return { data, isPending, error, refresh }
}
