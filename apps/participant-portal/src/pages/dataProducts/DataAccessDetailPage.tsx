import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  DateField,
  Labeled,
  NumberField,
  RecordContextProvider,
  TextField,
  useDataProvider,
  useGetOne,
  useNotify,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import KeyIcon from '@mui/icons-material/Key'
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
import { lifecycleStatusTone } from '../../services/dataAccessRoutes'
import { edcErrorReason } from '../../services/dataProductViewModels'
import { dataAccessState, PUSH_TRANSFER_TYPES, startDataAccess } from '../../services/dataAccessTransfer'
import { TransferAccessPanel } from './TransferAccessDetailsDialog'
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
  const tone = lifecycleStatusTone(record.status)
  return <FriendlyStatusChip status={tone} label={translate(`portalUx.myData.${record.status}`)} />
}

export const DataAccessDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>()
  const translate = useTranslate()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const location = useLocation()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const autoStartHandled = useRef(false)
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
  const accessState = dataAccessState(lifecycleForDataset?.accessTransfer)
  const preparingAccess = starting || accessState === 'preparing'

  const startAccess = useCallback(async () => {
    if (!lifecycleForDataset) return
    setStarting(true)
    try {
      await startDataAccess(dataProvider, lifecycleForDataset)
      await refetchLifecycle()
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), { type: 'error' })
    } finally {
      setStarting(false)
    }
  }, [dataProvider, lifecycleForDataset, notify, refetchLifecycle])

  // "Get access" on the data access list opens this page and starts access here.
  const startRequested = Boolean((location.state as { startAccess?: boolean } | null)?.startAccess)
  useEffect(() => {
    if (!startRequested || !lifecycleForDataset || autoStartHandled.current) return
    autoStartHandled.current = true
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    if (lifecycleForDataset.canUseData && ['none', 'failed'].includes(accessState)) void startAccess()
  }, [accessState, lifecycleForDataset, location.pathname, location.search, navigate, startAccess, startRequested])
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
  // Access is a tab of its own once an agreement allows use or a transfer exists.
  const showAccess = Boolean(lifecycleForDataset?.canUseData) || accessState === 'ready' || accessState === 'failed'
  const availableTabs = useMemo(
    () => [
      'overview',
      ...(showAccess ? ['access'] : []),
      ...datasetSections.map((section) => section.id),
      ...LIFECYCLE_TABS,
    ],
    [datasetSections, showAccess],
  )

  // A record with running access opens on it.
  const defaultTab: DetailTab = accessState === 'ready' ? 'access' : 'overview'
  useEffect(() => {
    setTab(requestedTab && availableTabs.includes(requestedTab) ? requestedTab : defaultTab)
  }, [availableTabs, defaultTab, id, requestedTab])

  useEffect(() => {
    if (!id || (lifecycleStatus !== 'pending' && accessState !== 'preparing')) return undefined
    const interval = window.setInterval(() => {
      void refetchLifecycle()
    }, 2000)
    return () => window.clearInterval(interval)
  }, [accessState, id, lifecycleStatus, refetchLifecycle])

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
    if (nextTab === defaultTab) next.delete('tab')
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
          actions={<LifecycleStatus />}
        />
        {lifecycle.usageEndsAt && (
          <Alert severity={lifecycle.status === 'expired' ? 'warning' : 'info'} sx={{ mb: 2 }}>
            {translate(lifecycle.status === 'expired' ? 'portalUx.myData.usageEnded' : 'portalUx.myData.usageEnds', {
              date: new Date(lifecycle.usageEndsAt).toLocaleString(),
            })}
          </Alert>
        )}
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
          {showAccess && (
            <Tab
              value="access"
              icon={preparingAccess ? <CircularProgress size={20} /> : <KeyIcon />}
              label={translate('portalUx.myData.accessTitle')}
            />
          )}
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
          {lifecycle.errorDetail && lifecycle.errorDetail !== lifecycle.accessTransfer?.errorDetail && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {edcErrorReason(lifecycle.errorDetail)}
            </Alert>
          )}
        </TabPanel>
        <TabPanel active={tab === 'access'}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {translate('portalUx.myData.readViaApi')}
                </Typography>
                {preparingAccess && (
                  <Box>
                    <LinearProgress aria-label={translate('portalUx.myData.accessPreparing')} />
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      {translate('portalUx.myData.accessPreparing')}
                    </Typography>
                  </Box>
                )}
                {!preparingAccess && accessState === 'ready' && lifecycle.accessTransfer && (
                  <TransferAccessPanel transfer={lifecycle.accessTransfer} dataset={dataset} />
                )}
                {!preparingAccess && accessState === 'failed' && (
                  <Alert
                    severity="error"
                    action={
                      lifecycle.canUseData ? (
                        <Button color="inherit" size="small" onClick={() => void startAccess()}>
                          {translate('portalUx.myData.retryAccess')}
                        </Button>
                      ) : undefined
                    }
                  >
                    {translate('portalUx.myData.accessFailed', {
                      reason: edcErrorReason(lifecycle.accessTransfer?.errorDetail || ''),
                    })}
                  </Alert>
                )}
                {!preparingAccess && accessState === 'none' && (
                  <Box>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                      {translate('portalUx.myData.accessNone')}
                    </Typography>
                    <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => void startAccess()}>
                      {translate('portalUx.myData.getAccess')}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
            {lifecycle.canUseData && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6">{translate('portalUx.myData.sendCopyTitle')}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                    {translate('portalUx.myData.sendCopyHelp')}
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<SendIcon />}
                    onClick={() =>
                      setTransferDefaults({
                        counterPartyAddress: lifecycle.counterPartyAddress,
                        counterPartyId: lifecycle.providerId,
                        protocol: lifecycle.protocol,
                        contractId: lifecycle.agreementId,
                        assetId: lifecycle.assetId,
                      })
                    }
                  >
                    {translate('portalUx.myData.sendCopy')}
                  </Button>
                </CardContent>
              </Card>
            )}
          </Box>
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
          title={translate('portalUx.myData.sendCopyTitle')}
          transferTypes={PUSH_TRANSFER_TYPES}
          defaultValues={transferDefaults}
          onClose={() => setTransferDefaults(undefined)}
          onSuccess={() => {
            void refetchLifecycle()
            selectTab('transfers')
          }}
        />
      )}
    </RecordContextProvider>
  )
}
