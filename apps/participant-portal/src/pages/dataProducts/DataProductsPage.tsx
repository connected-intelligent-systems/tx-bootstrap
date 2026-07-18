import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FilterForm,
  ListContextProvider,
  Pagination,
  SelectInput,
  TextInput,
  useList,
  useListContext,
  useLocale,
  useTranslate,
} from 'react-admin'
import { Box, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import type { Asset } from '../../types/asset'
import type { ContractDefinition } from '../../types/contractDefinition'
import type { ContractAgreement } from '../../types/contractAgreement'
import { useAllRecords } from '../../hooks/useAllRecords'
import { EmptyState, LoadingState, PageHeader, ResourceError } from '../../components/portal/PortalPage'
import { DataProductCard } from './DataProductCard'
import { DEFAULT_CATEGORIES } from '../../config'

type Visibility = 'all' | 'private' | 'published'
type FilterableAsset = Asset & { visibility: Exclude<Visibility, 'all'> }

const DataProductCards = ({
  definitions,
  agreements,
  publishedIds,
  sourceCount,
  onOpen,
  onCreate,
}: {
  definitions: ContractDefinition[]
  agreements: ContractAgreement[]
  publishedIds: Set<string>
  sourceCount: number
  onOpen: (assetId: string) => void
  onCreate: () => void
}) => {
  const translate = useTranslate()
  const { data = [], isPending, error, filterValues, refetch } = useListContext<FilterableAsset>()
  const hasActiveFilter = Object.keys(filterValues || {}).length > 0

  if (isPending) return <LoadingState />
  if (error) {
    return (
      <ResourceError
        message={translate('portalUx.dataProducts.loadError')}
        retryLabel={translate('portalUx.common.retry')}
        onRetry={refetch}
      />
    )
  }
  if (data.length === 0) {
    const genuinelyEmpty = sourceCount === 0 && !hasActiveFilter
    return (
      <EmptyState
        title={translate(genuinelyEmpty ? 'portalUx.dataProducts.emptyTitle' : 'portalUx.dataProducts.noMatchesTitle')}
        text={translate(genuinelyEmpty ? 'portalUx.dataProducts.emptyText' : 'portalUx.dataProducts.noMatchesText')}
        action={
          genuinelyEmpty ? (
            <Button variant="contained" onClick={onCreate}>
              {translate('portalUx.dataProducts.create')}
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <Box
      sx={{
        mt: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
        gap: 2,
      }}
    >
      {data.map((asset, index) => (
        <DataProductCard
          key={asset.id}
          asset={asset}
          index={index}
          published={publishedIds.has(asset.id)}
          offerCount={definitions.filter((item) => item.assetsSelector?.includes(asset.id)).length}
          agreementCount={agreements.filter((item) => item.assetId === asset.id).length}
          onOpen={() => onOpen(asset.id)}
        />
      ))}
    </Box>
  )
}

const VisibilityUrlSync = ({
  searchParams,
  setSearchParams,
}: {
  searchParams: URLSearchParams
  setSearchParams: ReturnType<typeof useSearchParams>[1]
}) => {
  const { filterValues } = useListContext<FilterableAsset>()
  const visibility = filterValues.visibility as Visibility | undefined

  useEffect(() => {
    const current = searchParams.get('visibility') || 'all'
    const nextVisibility = visibility || 'all'
    if (current === nextVisibility) return
    const next = new URLSearchParams(searchParams)
    if (nextVisibility === 'all') next.delete('visibility')
    else next.set('visibility', nextVisibility)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, visibility])

  return null
}

export const DataProductsPage = () => {
  const translate = useTranslate()
  const navigate = useNavigate()
  const locale = useLocale() === 'de' ? 'de' : 'en'
  const [searchParams, setSearchParams] = useSearchParams()
  const assets = useAllRecords<Asset>('assets')
  const definitions = useAllRecords<ContractDefinition>('contractdefinitions')
  const agreements = useAllRecords<ContractAgreement>('contractagreements')
  const requestedVisibility = searchParams.get('visibility')
  const visibility: Visibility =
    requestedVisibility === 'private' || requestedVisibility === 'published' ? requestedVisibility : 'all'
  const publishedIds = useMemo(
    () => new Set(definitions.data.flatMap((item) => item.assetsSelector || [])),
    [definitions.data],
  )
  const filterableAssets = useMemo<FilterableAsset[]>(
    () =>
      assets.data.map((asset) => ({
        ...asset,
        visibility: publishedIds.has(asset.id) ? 'published' : 'private',
      })),
    [assets.data, publishedIds],
  )
  const categories = window.config.categories?.length ? window.config.categories : DEFAULT_CATEGORIES
  const pending = assets.isPending || definitions.isPending || agreements.isPending
  const error = assets.error || definitions.error || agreements.error
  const listContext = useList<FilterableAsset>({
    data: filterableAssets,
    error,
    filter: visibility === 'all' ? {} : { visibility },
    isPending: pending,
    page: 1,
    perPage: 12,
    resource: 'assets',
    sort: { field: 'title', order: 'ASC' },
  })
  const filters = useMemo(
    () => [
      <TextInput key="q" source="q" label={translate('portalUx.dataProducts.search')} alwaysOn resettable />,
      <SelectInput
        key="theme.title"
        source="theme.title"
        label={translate('portalUx.dataProducts.category')}
        choices={categories.map((item) => ({ id: item.id, name: item.translations[locale] }))}
        alwaysOn
        resettable
        emptyText={translate('portalUx.dataProducts.allCategories')}
      />,
      <SelectInput
        key="visibility"
        source="visibility"
        label={translate('portalUx.dataProducts.visibility')}
        choices={[
          { id: 'private', name: translate('portalUx.dataProducts.private') },
          { id: 'published', name: translate('portalUx.dataProducts.published') },
        ]}
        alwaysOn
        resettable
        emptyText={translate('portalUx.dataProducts.all')}
      />,
    ],
    [categories, locale, translate],
  )
  const refresh = () => {
    assets.refresh()
    definitions.refresh()
    agreements.refresh()
  }

  return (
    <Box>
      <PageHeader
        title={translate('portalUx.dataProducts.title')}
        subtitle={translate('portalUx.dataProducts.subtitle')}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/data-products/create')}>
            {translate('portalUx.dataProducts.create')}
          </Button>
        }
      />
      <ListContextProvider value={{ ...listContext, refetch: refresh }}>
        <VisibilityUrlSync searchParams={searchParams} setSearchParams={setSearchParams} />
        <FilterForm filters={filters} />
        <DataProductCards
          definitions={definitions.data}
          agreements={agreements.data}
          publishedIds={publishedIds}
          sourceCount={assets.data.length}
          onOpen={(assetId) => navigate(`/data-products/${assetId}`)}
          onCreate={() => navigate('/data-products/create')}
        />
        {filterableAssets.length > 12 && <Pagination rowsPerPageOptions={[12]} />}
      </ListContextProvider>
    </Box>
  )
}
