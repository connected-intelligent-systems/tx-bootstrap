import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DataTable,
  DateField,
  List,
  NumberField,
  Pagination,
  SelectInput,
  useRecordContext,
  useListContext,
  useTranslate,
} from 'react-admin'
import { Box, Button, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import type { DataAccessLifecycleRecord } from '../../types/dataAccess'
import { EmptyState, FriendlyStatusChip, PageHeader } from '../../components/portal/PortalPage'
import { dataAccessDetailPath, lifecycleStatusTone } from '../../services/dataAccessRoutes'
import { edcErrorReason } from '../../services/dataProductViewModels'

const validStatuses = new Set(['pending', 'active', 'expired', 'issues'])

const ProductCell = () => {
  const record = useRecordContext<DataAccessLifecycleRecord>()
  const translate = useTranslate()
  if (!record) return null
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {record.title || translate('portalUx.myData.noTitle')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {record.assetId}
      </Typography>
      {record.errorDetail && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
          {edcErrorReason(record.errorDetail)}
        </Typography>
      )}
    </Box>
  )
}

const StatusCell = () => {
  const record = useRecordContext<DataAccessLifecycleRecord>()
  const translate = useTranslate()
  if (!record) return null
  const tone = lifecycleStatusTone(record.status)
  return <FriendlyStatusChip status={tone} label={translate(`portalUx.myData.${record.status}`)} />
}

const UseDataAction = ({ onUse }: { onUse: (record: DataAccessLifecycleRecord) => void }) => {
  const record = useRecordContext<DataAccessLifecycleRecord>()
  const translate = useTranslate()
  if (!record?.canUseData) return null
  return (
    <Button
      size="small"
      variant="contained"
      startIcon={<PlayArrowIcon />}
      onClick={(event) => {
        event.stopPropagation()
        onUse(record)
      }}
    >
      {translate('portalUx.myData.useData')}
    </Button>
  )
}

const DataAccessEmpty = () => {
  const translate = useTranslate()
  const navigate = useNavigate()
  const { filterValues, setFilters } = useListContext<DataAccessLifecycleRecord>()
  const hasActiveFilter = Object.keys(filterValues || {}).length > 0

  return (
    <EmptyState
      title={translate('portalUx.myData.emptyTitle')}
      text={translate(hasActiveFilter ? 'portalUx.myData.noMatchesText' : 'portalUx.myData.emptyText')}
      action={
        <Button
          variant={hasActiveFilter ? 'outlined' : 'contained'}
          onClick={() => (hasActiveFilter ? setFilters({}) : navigate('/discover'))}
        >
          {translate(hasActiveFilter ? 'portalUx.myData.clearFilters' : 'portalUx.nav.discover')}
        </Button>
      }
    />
  )
}

const StatusUrlSync = ({
  searchParams,
  setSearchParams,
}: {
  searchParams: URLSearchParams
  setSearchParams: ReturnType<typeof useSearchParams>[1]
}) => {
  const { filterValues } = useListContext<DataAccessLifecycleRecord>()
  const status = filterValues.status as string | undefined

  useEffect(() => {
    const current = searchParams.get('status') || ''
    const nextStatus = validStatuses.has(status || '') ? status || '' : ''
    if (current === nextStatus) return
    const next = new URLSearchParams(searchParams)
    if (nextStatus) next.set('status', nextStatus)
    else next.delete('status')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, status])

  return null
}

export const DataAccessPage = () => {
  const translate = useTranslate()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const filterDefaultValues = validStatuses.has(requestedStatus || '') ? { status: requestedStatus } : undefined
  const filters = useMemo(
    () => [
      <SelectInput
        key="status"
        source="status"
        label={translate('portalUx.myData.status')}
        choices={[
          { id: 'pending', name: translate('portalUx.myData.pending') },
          { id: 'active', name: translate('portalUx.myData.active') },
          { id: 'expired', name: translate('portalUx.myData.expired') },
          { id: 'issues', name: translate('portalUx.myData.issues') },
        ]}
        alwaysOn
        resettable
        emptyText={translate('portalUx.myData.all')}
      />,
    ],
    [translate],
  )

  // Access is started and shown on the detail page.
  const useData = (record: DataAccessLifecycleRecord) =>
    navigate(
      { pathname: dataAccessDetailPath(record.providerId, record.assetId), search: '?tab=access' },
      { state: { startAccess: true } },
    )

  return (
    <Box>
      <PageHeader title={translate('portalUx.myData.title')} subtitle={translate('portalUx.myData.subtitle')} />
      <List
        key={requestedStatus || 'all'}
        resource="dataaccesslifecycles"
        title={false}
        actions={false}
        exporter={false}
        filters={filters}
        filterDefaultValues={filterDefaultValues}
        disableSyncWithLocation
        perPage={10}
        sort={{ field: 'updatedAt', order: 'DESC' }}
        pagination={<Pagination rowsPerPageOptions={[10, 25, 50]} />}
        empty={<DataAccessEmpty />}
      >
        <>
          <StatusUrlSync searchParams={searchParams} setSearchParams={setSearchParams} />
          <DataTable
            bulkActionButtons={false}
            empty={<DataAccessEmpty />}
            rowClick={(id) => `/data-access/${encodeURIComponent(String(id))}`}
            size="small"
            sx={{ '& td': { verticalAlign: 'middle' }, '& tbody tr': { cursor: 'pointer' } }}
          >
            <DataTable.Col<DataAccessLifecycleRecord>
              label={translate('portalUx.myData.product')}
              disableSort
              sx={{ minWidth: 220 }}
            >
              <ProductCell />
            </DataTable.Col>
            <DataTable.Col<DataAccessLifecycleRecord>
              source="providerId"
              label={translate('portalUx.myData.providerLabel')}
              disableSort
              sx={{ maxWidth: 260, overflowWrap: 'anywhere' }}
            />
            <DataTable.Col<DataAccessLifecycleRecord> label={translate('portalUx.myData.status')} disableSort>
              <StatusCell />
            </DataTable.Col>
            <DataTable.Col<DataAccessLifecycleRecord>
              source="requestCount"
              label={translate('portalUx.myData.requests')}
              disableSort
            >
              <NumberField source="requestCount" />
            </DataTable.Col>
            <DataTable.Col<DataAccessLifecycleRecord>
              source="transferCount"
              label={translate('portalUx.myData.transfers')}
              disableSort
            >
              <NumberField source="transferCount" />
            </DataTable.Col>
            <DataTable.Col<DataAccessLifecycleRecord>
              source="updatedAt"
              label={translate('portalUx.myData.updatedLabel')}
              disableSort
            >
              <DateField source="updatedAt" showTime />
            </DataTable.Col>
            <DataTable.Col<DataAccessLifecycleRecord> label={translate('portalUx.myData.actions')} disableSort>
              <UseDataAction onUse={useData} />
            </DataTable.Col>
          </DataTable>
        </>
      </List>
    </Box>
  )
}

export const MyDataPage = DataAccessPage
