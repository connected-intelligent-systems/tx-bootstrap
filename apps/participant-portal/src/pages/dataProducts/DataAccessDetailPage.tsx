import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  DateField,
  Labeled,
  NumberField,
  RecordContextProvider,
  TextField,
  useGetOne,
  useRecordContext,
  useRefresh,
  useTranslate,
} from 'react-admin'
import { Alert, Box, Button, Card, CardContent, LinearProgress, Tab, Tabs } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import HandshakeIcon from '@mui/icons-material/Handshake'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import AutoModeIcon from '@mui/icons-material/AutoMode'
import type { DataAccessLifecycleRecord } from '../../types/dataAccess'
import type { Dataset } from '../../types/catalog'
import { FriendlyStatusChip, LoadingState, PageHeader, ResourceError } from '../../components/portal/PortalPage'
import TransferProcessDialog from '../../components/transferprocesses/TransferProcessDialog'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  buildDatasetAccessSections,
  DatasetAccessOverviewContent,
} from '../../components/datasets/DatasetAccessOverview'
import { DataAccessAgreementsList, DataAccessNegotiationsList, DataAccessTransfersList } from './DataAccessRelatedLists'

type LifecycleTab = 'negotiations' | 'agreements' | 'transfers'
type DetailTab = 'overview' | LifecycleTab | string
const LIFECYCLE_TABS: LifecycleTab[] = ['negotiations', 'agreements', 'transfers']

const TabPanel = ({ active, children }: { active: boolean; children: ReactNode }) =>
  active ? <Box sx={{ mt: 3 }}>{children}</Box> : null

const LifecycleStatus = () => {
  const record = useRecordContext<DataAccessLifecycleRecord>()
  const translate = useTranslate()
  if (!record) return null
  const tone = record.status === 'active' ? 'granted' : record.status === 'issues' ? 'failed' : 'in-progress'
  return <FriendlyStatusChip status={tone} label={translate(`portalUx.myData.${record.status}`)} />
}

export const DataAccessDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>()
  const translate = useTranslate()
  const refresh = useRefresh()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState<DetailTab>(requestedTab || 'overview')
  const [transferDefaults, setTransferDefaults] = useState<Record<string, unknown>>()
  const lifecycleQuery = useGetOne<DataAccessLifecycleRecord>(
    'dataaccesslifecycles',
    { id },
    {
      enabled: Boolean(id),
      retry: (failureCount, error) =>
        failureCount < 10 && Boolean(error && typeof error === 'object' && 'status' in error && error.status === 404),
      retryDelay: 500,
    },
  )
  const lifecycleForDataset = lifecycleQuery.data
  const lifecycleStatus = lifecycleQuery.data?.status
  const refetchLifecycle = lifecycleQuery.refetch
  const datasetCatalogUrl = lifecycleForDataset?.catalogUrl || lifecycleForDataset?.counterPartyAddress
  const datasetResourceId =
    datasetCatalogUrl && lifecycleForDataset?.assetId
      ? btoa(datasetCatalogUrl) + '--' + lifecycleForDataset.assetId
      : ''
  const datasetQuery = useGetOne<Dataset>(
    'datasets',
    { id: datasetResourceId, meta: { counterPartyId: lifecycleForDataset?.providerId } },
    { enabled: Boolean(datasetResourceId) },
  )
  const dataset = datasetQuery.data || lifecycleForDataset?.dataset
  const datasetSections = useMemo(
    () => (dataset ? buildDatasetAccessSections(dataset, translate) : []),
    [dataset, translate],
  )
  const availableTabs = useMemo(
    () => ['overview', ...datasetSections.map((section) => section.id), ...LIFECYCLE_TABS],
    [datasetSections],
  )

  useEffect(() => {
    setTab(requestedTab && availableTabs.includes(requestedTab) ? requestedTab : 'overview')
  }, [availableTabs, id, requestedTab])

  useEffect(() => {
    if (!id || lifecycleStatus !== 'pending') return undefined
    const interval = window.setInterval(() => {
      void refetchLifecycle()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [id, lifecycleStatus, refetchLifecycle])

  if (lifecycleQuery.isPending && !lifecycleQuery.data) return <LoadingState />
  if (lifecycleQuery.error || !lifecycleQuery.data) {
    return (
      <ResourceError
        message={lifecycleQuery.error?.message || translate('portalUx.myData.loadError')}
        retryLabel={translate('portalUx.common.retry')}
        onRetry={lifecycleQuery.refetch}
      />
    )
  }

  const lifecycle = lifecycleQuery.data
  const selectTab = (nextTab: DetailTab) => {
    setTab(nextTab)
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'overview') next.delete('tab')
    else next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  return (
    <RecordContextProvider value={lifecycle}>
      <Box>
        <PageHeader
          title={translate('portalUx.myData.detailTitle', {
            product: lifecycle.title || dataset?.title || dataset?.name || lifecycle.assetId,
          })}
          subtitle={translate('portalUx.myData.detailSubtitle')}
          actions={
            <>
              <LifecycleStatus />
              {lifecycle.canUseData && (
                <Button
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  onClick={() =>
                    setTransferDefaults({
                      counterPartyAddress: lifecycle.counterPartyAddress,
                      contractId: lifecycle.agreementId,
                      assetId: lifecycle.assetId,
                    })
                  }
                >
                  {translate('portalUx.myData.useData')}
                </Button>
              )}
            </>
          }
        />
        {lifecycle.status === 'pending' && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress aria-label={translate('portalUx.myData.waitingForAgreement')} />
            <Alert severity="info" sx={{ mt: 1 }}>
              {translate('portalUx.myData.waitingForAgreement')}
            </Alert>
          </Box>
        )}

        <Tabs
          value={tab}
          onChange={(_, value: DetailTab) => selectTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="overview" icon={<InfoIcon />} label={translate('portalUx.product.overview')} />
          {datasetSections.map((section) => (
            <Tab key={section.id} value={section.id} icon={section.icon} label={section.label} />
          ))}
          <Tab
            value="negotiations"
            icon={<HandshakeIcon />}
            label={`${translate('portalUx.product.negotiations')} (${lifecycle.requestCount})`}
          />
          <Tab
            value="agreements"
            icon={<AssignmentTurnedInIcon />}
            label={`${translate('portalUx.product.agreements')} (${lifecycle.agreementCount})`}
          />
          <Tab
            value="transfers"
            icon={<AutoModeIcon />}
            label={`${translate('portalUx.product.transfers')} (${lifecycle.transferCount})`}
          />
        </Tabs>

        <TabPanel active={tab === 'overview'}>
          <Card variant="outlined">
            <CardContent>
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}
              >
                <Labeled label={translate('portalUx.myData.providerLabel')}>
                  <TextField source="providerId" sx={{ overflowWrap: 'anywhere' }} />
                </Labeled>
                <Labeled label={translate('portalUx.myData.assetId')}>
                  <TextField source="assetId" sx={{ overflowWrap: 'anywhere' }} />
                </Labeled>
                <Labeled label={translate('portalUx.myData.updatedLabel')}>
                  <DateField source="updatedAt" showTime emptyText="-" />
                </Labeled>
                <Labeled label={translate('portalUx.myData.requests')}>
                  <NumberField source="requestCount" />
                </Labeled>
                <Labeled label={translate('portalUx.myData.agreements')}>
                  <NumberField source="agreementCount" />
                </Labeled>
                <Labeled label={translate('portalUx.myData.transfers')}>
                  <NumberField source="transferCount" />
                </Labeled>
              </Box>
              {datasetQuery.isPending && !dataset && <LoadingState />}
              {dataset && (
                <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                  <DatasetAccessOverviewContent dataset={dataset} />
                </Box>
              )}
              {!datasetQuery.isPending && !dataset && (
                <Alert severity={datasetQuery.error ? 'warning' : 'info'} sx={{ mt: 3 }}>
                  {translate(
                    datasetQuery.error ? 'portalUx.myData.datasetLoadError' : 'portalUx.myData.datasetUnavailable',
                  )}
                </Alert>
              )}
            </CardContent>
          </Card>
          {lifecycle.errorDetail && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {lifecycle.errorDetail}
            </Alert>
          )}
        </TabPanel>
        {dataset &&
          datasetSections.map((section) => (
            <TabPanel key={section.id} active={tab === section.id}>
              <RecordContextProvider value={dataset}>{section.component}</RecordContextProvider>
            </TabPanel>
          ))}
        <TabPanel active={tab === 'negotiations'}>
          <DataAccessNegotiationsList lifecycleId={id} />
        </TabPanel>
        <TabPanel active={tab === 'agreements'}>
          <DataAccessAgreementsList lifecycleId={id} />
        </TabPanel>
        <TabPanel active={tab === 'transfers'}>
          <DataAccessTransfersList lifecycleId={id} dataset={dataset} />
        </TabPanel>
      </Box>
      {transferDefaults && (
        <TransferProcessDialog
          open
          defaultValues={transferDefaults}
          onClose={() => setTransferDefaults(undefined)}
          onSuccess={refresh}
        />
      )}
    </RecordContextProvider>
  )
}
