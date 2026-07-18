import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslate } from 'react-admin'
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Pagination, Select, TextField } from '@mui/material'
import { DEFAULT_CATEGORIES, DEFAULT_MEDIA_TYPES } from '../../config'
import type { DiscoveredDataProduct } from '../../types/dataProduct'
import { toDiscoveredDataProduct } from '../../services/dataProductViewModels'
import { EmptyState, LoadingState, PageHeader } from '../../components/portal/PortalPage'
import { ContractNegotiationDialog } from '../catalogs/ContractNegotiationDialog'
import { parseDatasetFromJsonLd } from '../../dataProvider/resources/catalog/transformer'
import {
  getFederatedCatalogParticipants,
  searchFederatedCatalog,
  type ParticipantCrawlStatus,
} from '../../services/federatedCatalogService'
import { DiscoverDataProductCard } from './DiscoverDataProductCard'

const pageSize = 20

export const DiscoverDataPage = () => {
  const translate = useTranslate()
  const locale = useLocale() === 'de' ? 'de' : 'en'
  const [products, setProducts] = useState<DiscoveredDataProduct[]>([])
  const [selected, setSelected] = useState<DiscoveredDataProduct>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [crawlWarnings, setCrawlWarnings] = useState<string[]>([])
  const [participants, setParticipants] = useState<ParticipantCrawlStatus[]>([])
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [participantBpn, setParticipantBpn] = useState('')
  const [category, setCategory] = useState('')
  const [contentType, setContentType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    void refresh
    setLoading(true)
    setLoadError(undefined)
    try {
      const result = await searchFederatedCatalog({
        q: query,
        participantBpn,
        theme: category,
        contentType,
        offset: (page - 1) * pageSize,
        limit: pageSize,
      })
      const mapped = await Promise.allSettled(
        result.items.map(async (entry) => {
          const dataset = await parseDatasetFromJsonLd(entry.dataset)
          dataset.id = entry.datasetId
          dataset.originalId = entry.datasetId
          dataset.catalogUrl = entry.counterPartyAddress
          dataset.participantId = entry.counterPartyId
          dataset.raw = entry.dataset
          return {
            ...toDiscoveredDataProduct(dataset, entry.id),
            id: entry.id,
            stale: entry.stale,
            providerName: entry.participant.name,
            participantBpn: entry.participant.bpn,
            crawledAt: entry.crawledAt,
          }
        }),
      )
      const transformationErrors = mapped.filter((item) => item.status === 'rejected')
      setProducts(mapped.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : [])))
      if (transformationErrors.length > 0) {
        setLoadError(translate('portalUx.discover.transformError', { smart_count: transformationErrors.length }))
      }
      setTotal(result.total)
    } catch (error) {
      setProducts([])
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [category, contentType, page, participantBpn, query, refresh, translate])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getFederatedCatalogParticipants()
      .then((items) => {
        setParticipants(items.filter((item) => item.active))
        setCrawlWarnings(
          items
            .filter((item) => item.active && (item.state === 'error' || item.state === 'degraded'))
            .map(
              (item) => `${item.participant.name}: ${item.lastError || translate(`portalUx.discover.${item.state}`)}`,
            ),
        )
      })
      .catch((error) => setCrawlWarnings([error instanceof Error ? error.message : String(error)]))
  }, [refresh, translate])

  const categories = window.config.categories?.length ? window.config.categories : DEFAULT_CATEGORIES
  const mediaTypes = window.config.mediaTypes?.length ? window.config.mediaTypes : DEFAULT_MEDIA_TYPES

  return (
    <Box>
      <PageHeader title={translate('portalUx.discover.title')} subtitle={translate('portalUx.discover.subtitle')} />
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setQuery(draftQuery.trim())
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          overflowX: 'auto',
          flexWrap: 'nowrap',
          pb: 0.5,
          '& > *': { flexShrink: 0 },
        }}
      >
        <TextField
          size="small"
          label={translate('portalUx.discover.search')}
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          sx={{ width: 300, minWidth: 220, flex: '1 1 300px' }}
        />
        <FormControl size="small" sx={{ width: 220 }}>
          <InputLabel>{translate('portalUx.discover.provider')}</InputLabel>
          <Select
            label={translate('portalUx.discover.provider')}
            value={participantBpn}
            onChange={(event) => {
              setParticipantBpn(event.target.value)
              setPage(1)
            }}
          >
            <MenuItem value="">{translate('portalUx.discover.allProviders')}</MenuItem>
            {participants.map((item) => (
              <MenuItem key={item.participant.bpn} value={item.participant.bpn}>
                {item.participant.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: 190 }}>
          <InputLabel>{translate('portalUx.discover.category')}</InputLabel>
          <Select
            label={translate('portalUx.discover.category')}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
          >
            <MenuItem value="">{translate('portalUx.discover.allCategories')}</MenuItem>
            {categories.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.translations[locale]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: 180 }}>
          <InputLabel>{translate('portalUx.discover.contentType')}</InputLabel>
          <Select
            label={translate('portalUx.discover.contentType')}
            value={contentType}
            onChange={(event) => {
              setContentType(event.target.value)
              setPage(1)
            }}
          >
            <MenuItem value="">{translate('portalUx.discover.allContentTypes')}</MenuItem>
            {mediaTypes.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.translations[locale]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button type="submit" variant="contained" sx={{ whiteSpace: 'nowrap' }}>
          {translate('portalUx.discover.search')}
        </Button>
      </Box>
      {loading && <LoadingState />}
      {(loadError || crawlWarnings.length > 0) && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => setRefresh((value) => value + 1)}>
              {translate('portalUx.common.retry')}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {translate('portalUx.discover.loadError')} {[loadError, ...crawlWarnings].filter(Boolean).join(' · ')}
        </Alert>
      )}
      {!loading && products.length === 0 && (
        <EmptyState title={translate('portalUx.discover.emptyTitle')} text={translate('portalUx.discover.emptyText')} />
      )}
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        {products.map((product, index) => (
          <DiscoverDataProductCard
            key={product.id}
            product={product}
            index={index}
            onOpen={() => setSelected(product)}
          />
        ))}
      </Box>
      {total > pageSize && (
        <Pagination
          sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
          count={Math.ceil(total / pageSize)}
          page={page}
          onChange={(_event, value) => setPage(value)}
          color="primary"
        />
      )}
      {selected && (
        <ContractNegotiationDialog
          dataset={selected.dataset}
          counterPartyAddress={selected.dataset.catalogUrl}
          counterPartyId={selected.providerId}
          open
          onClose={() => setSelected(undefined)}
        />
      )}
    </Box>
  )
}
