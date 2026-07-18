import { useMemo, type ReactElement, type ReactNode } from 'react'
import {
  DataTable,
  DateField,
  FilterForm,
  ListContextProvider,
  Pagination,
  ResourceContextProvider,
  SelectInput,
  TextInput,
  useList,
  useRecordContext,
  useTranslate,
  type RaRecord,
  type SortPayload,
} from 'react-admin'
import { Box, Button, Chip } from '@mui/material'
import type { ContractAgreement } from '../../types/contractAgreement'
import type { ContractNegotiation } from '../../types/contractNegotiation'
import type { DataProductOffer } from '../../types/dataProduct'
import type { TransferProcess } from '../../types/transferProcess'
import { getAccessRequestStatus, policySummary } from '../../services/dataProductViewModels'
import { FriendlyStatusChip } from '../../components/portal/PortalPage'

const PAGE_SIZE = 10
const NEGOTIATION_TERMINAL_STATES = new Set(['TERMINATED', 'FINALIZED'])
const TRANSFER_TERMINAL_STATES = new Set(['COMPLETED', 'TERMINATED'])

const LocalDataTable = <RecordType extends RaRecord>({
  resource,
  data,
  sort,
  filters,
  children,
}: {
  resource: string
  data: RecordType[]
  sort: SortPayload
  filters?: ReactElement[]
  children: ReactNode
}) => {
  const listContext = useList<RecordType>({ data, perPage: PAGE_SIZE, resource, sort })

  return (
    <ResourceContextProvider value={resource}>
      <ListContextProvider value={listContext}>
        {filters?.length ? (
          <Box sx={{ mb: 2 }}>
            <FilterForm filters={filters} />
          </Box>
        ) : null}
        <DataTable bulkActionButtons={false} size="small" sx={{ '& td': { verticalAlign: 'middle' } }}>
          {children}
        </DataTable>
        {data.length > PAGE_SIZE && <Pagination rowsPerPageOptions={[PAGE_SIZE]} />}
      </ListContextProvider>
    </ResourceContextProvider>
  )
}

const formatPolicySummary = (offer: DataProductOffer, translate: ReturnType<typeof useTranslate>) => {
  const summary = policySummary(offer.contractPolicy)
  return summary.startsWith('policy.') ? translate(`portalUx.${summary}`) : summary
}

export const OffersTable = ({
  offers,
  onEdit,
  onRemove,
}: {
  offers: DataProductOffer[]
  onEdit: (offer: DataProductOffer) => void
  onRemove: (offer: DataProductOffer) => void
}) => {
  const translate = useTranslate()

  return (
    <LocalDataTable<DataProductOffer>
      resource="contractdefinitions"
      data={offers}
      sort={{ field: 'name', order: 'ASC' }}
    >
      <DataTable.Col<DataProductOffer>
        label={translate('portalUx.policy.terms')}
        render={(offer) => formatPolicySummary(offer, translate)}
        disableSort
        sx={{ minWidth: 260 }}
      />
      <DataTable.Col<DataProductOffer>
        label={translate('portalUx.product.type')}
        render={(offer) => (
          <Chip
            size="small"
            variant="outlined"
            label={translate(offer.isAdvanced ? 'portalUx.product.advancedOffer' : 'portalUx.product.standardOffer')}
          />
        )}
        disableSort
      />
      <DataTable.Col<DataProductOffer> label={translate('portalUx.product.actions')} disableSort>
        <OfferActions onEdit={onEdit} onRemove={onRemove} />
      </DataTable.Col>
    </LocalDataTable>
  )
}

const OfferActions = ({
  onEdit,
  onRemove,
}: {
  onEdit: (offer: DataProductOffer) => void
  onRemove: (offer: DataProductOffer) => void
}) => {
  const translate = useTranslate()
  const offer = useRecordContext<DataProductOffer>()
  if (!offer) return null

  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {!offer.isAdvanced && (
        <Button size="small" onClick={() => onEdit(offer)}>
          {translate('portalUx.product.editTerms')}
        </Button>
      )}
      <Button size="small" color="error" onClick={() => onRemove(offer)}>
        {translate('portalUx.common.remove')}
      </Button>
    </Box>
  )
}

export const NegotiationsTable = ({
  negotiations,
  onCancel,
}: {
  negotiations: ContractNegotiation[]
  onCancel: (negotiation: ContractNegotiation) => void
}) => {
  const translate = useTranslate()
  const records = useMemo(
    () => negotiations.map((negotiation) => ({ ...negotiation, status: getAccessRequestStatus(negotiation) })),
    [negotiations],
  )
  const filters = useMemo(
    () => [
      <TextInput key="q" source="q" label={translate('portalUx.product.searchNegotiations')} alwaysOn resettable />,
      <SelectInput
        key="status"
        source="status"
        label={translate('portalUx.product.status')}
        choices={[...new Set(records.map((record) => record.status))].map((status) => ({
          id: status,
          name: translate(`portalUx.status.${status}`),
        }))}
        alwaysOn
        resettable
      />,
    ],
    [records, translate],
  )

  return (
    <LocalDataTable<(typeof records)[number]>
      resource="contractnegotiations"
      data={records}
      sort={{ field: 'createdAt', order: 'DESC' }}
      filters={filters}
    >
      <DataTable.Col<ContractNegotiation>
        label={translate('portalUx.product.status')}
        render={(negotiation) => {
          const status = getAccessRequestStatus(negotiation)
          return <FriendlyStatusChip status={status} label={translate(`portalUx.status.${status}`)} />
        }}
        disableSort
      />
      <DataTable.Col<ContractNegotiation>
        source="counterPartyId"
        label={translate('portalUx.product.counterparty')}
        disableSort
        sx={{ overflowWrap: 'anywhere' }}
      />
      <DataTable.Col<ContractNegotiation> source="createdAt" label={translate('portalUx.product.created')}>
        <DateField source="createdAt" showTime />
      </DataTable.Col>
      <DataTable.Col<ContractNegotiation> label={translate('portalUx.product.actions')} disableSort>
        <NegotiationActions onCancel={onCancel} />
      </DataTable.Col>
    </LocalDataTable>
  )
}

const NegotiationActions = ({ onCancel }: { onCancel: (negotiation: ContractNegotiation) => void }) => {
  const translate = useTranslate()
  const negotiation = useRecordContext<ContractNegotiation>()
  if (!negotiation) return null

  return (
    <Button
      size="small"
      color="error"
      disabled={NEGOTIATION_TERMINAL_STATES.has(negotiation.state)}
      onClick={() => onCancel(negotiation)}
    >
      {translate('portalUx.product.cancel')}
    </Button>
  )
}

export const AgreementsTable = ({
  agreements,
  retiredIds,
  onRetire,
  onReactivate,
}: {
  agreements: ContractAgreement[]
  retiredIds: Set<string>
  onRetire: (agreement: ContractAgreement) => void
  onReactivate: (agreement: ContractAgreement) => void
}) => {
  const translate = useTranslate()
  const records = useMemo(
    () =>
      agreements.map((agreement) => ({ ...agreement, status: retiredIds.has(agreement.id) ? 'retired' : 'active' })),
    [agreements, retiredIds],
  )
  const filters = useMemo(
    () => [
      <TextInput key="q" source="q" label={translate('portalUx.product.searchAgreements')} alwaysOn resettable />,
      <SelectInput
        key="status"
        source="status"
        label={translate('portalUx.product.status')}
        choices={[
          { id: 'active', name: translate('portalUx.product.active') },
          { id: 'retired', name: translate('portalUx.product.retired') },
        ]}
        alwaysOn
        resettable
      />,
    ],
    [translate],
  )

  return (
    <LocalDataTable<(typeof records)[number]>
      resource="contractagreements"
      data={records}
      sort={{ field: 'contractSigningDate', order: 'DESC' }}
      filters={filters}
    >
      <DataTable.Col<ContractAgreement>
        label={translate('portalUx.product.status')}
        render={(agreement) => {
          const retired = retiredIds.has(agreement.id)
          return (
            <FriendlyStatusChip
              status={retired ? 'ended' : 'granted'}
              label={translate(retired ? 'portalUx.product.retired' : 'portalUx.product.active')}
            />
          )
        }}
        disableSort
      />
      <DataTable.Col<ContractAgreement>
        source="consumerId"
        label={translate('portalUx.product.consumer')}
        disableSort
        sx={{ overflowWrap: 'anywhere' }}
      />
      <DataTable.Col<ContractAgreement> source="contractSigningDate" label={translate('portalUx.product.signed')}>
        <DateField source="contractSigningDate" showTime />
      </DataTable.Col>
      <DataTable.Col<ContractAgreement> label={translate('portalUx.product.actions')} disableSort>
        <AgreementActions retiredIds={retiredIds} onRetire={onRetire} onReactivate={onReactivate} />
      </DataTable.Col>
    </LocalDataTable>
  )
}

const AgreementActions = ({
  retiredIds,
  onRetire,
  onReactivate,
}: {
  retiredIds: Set<string>
  onRetire: (agreement: ContractAgreement) => void
  onReactivate: (agreement: ContractAgreement) => void
}) => {
  const translate = useTranslate()
  const agreement = useRecordContext<ContractAgreement>()
  if (!agreement) return null
  const retired = retiredIds.has(agreement.id)

  return retired ? (
    <Button size="small" onClick={() => onReactivate(agreement)}>
      {translate('portalUx.product.reactivate')}
    </Button>
  ) : (
    <Button size="small" color="error" onClick={() => onRetire(agreement)}>
      {translate('portalUx.product.retire')}
    </Button>
  )
}

export const TransfersTable = ({
  transfers,
  onCancel,
}: {
  transfers: TransferProcess[]
  onCancel: (transfer: TransferProcess) => void
}) => {
  const translate = useTranslate()
  const filters = useMemo(
    () => [
      <TextInput key="q" source="q" label={translate('portalUx.product.searchTransfers')} alwaysOn resettable />,
      <SelectInput
        key="state"
        source="state"
        label={translate('portalUx.product.state')}
        choices={[...new Set(transfers.map((transfer) => transfer.state))].map((state) => ({ id: state, name: state }))}
        alwaysOn
        resettable
      />,
      <SelectInput
        key="transferDirection"
        source="transferDirection"
        label={translate('portalUx.product.direction')}
        choices={[...new Set(transfers.map((transfer) => transfer.transferDirection))].map((direction) => ({
          id: direction,
          name: direction,
        }))}
        alwaysOn
        resettable
      />,
    ],
    [transfers, translate],
  )

  return (
    <LocalDataTable<TransferProcess>
      resource="transferprocesses"
      data={transfers}
      sort={{ field: 'updatedAt', order: 'DESC' }}
      filters={filters}
    >
      <DataTable.Col<TransferProcess>
        source="state"
        label={translate('portalUx.product.state')}
        render={(transfer) => <Chip size="small" variant="outlined" label={transfer.state} />}
        disableSort
      />
      <DataTable.Col<TransferProcess>
        source="transferDirection"
        label={translate('portalUx.product.direction')}
        disableSort
      />
      <DataTable.Col<TransferProcess>
        source="transferType"
        label={translate('portalUx.product.type')}
        render={(transfer) => transfer.transferType || '—'}
        disableSort
      />
      <DataTable.Col<TransferProcess> label={translate('portalUx.product.updatedAt')}>
        <TransferDate />
      </DataTable.Col>
      <DataTable.Col<TransferProcess> label={translate('portalUx.product.actions')} disableSort>
        <TransferActions onCancel={onCancel} />
      </DataTable.Col>
    </LocalDataTable>
  )
}

const TransferDate = () => {
  const transfer = useRecordContext<TransferProcess>()
  if (!transfer) return null
  const date = transfer.updatedAt || transfer.stateTimestamp
  return date ? <DateField source="date" record={{ id: transfer.id, date }} showTime /> : '—'
}

const TransferActions = ({ onCancel }: { onCancel: (transfer: TransferProcess) => void }) => {
  const translate = useTranslate()
  const transfer = useRecordContext<TransferProcess>()
  if (!transfer) return null

  return (
    <Button
      size="small"
      color="error"
      disabled={TRANSFER_TERMINAL_STATES.has(transfer.state)}
      onClick={() => onCancel(transfer)}
    >
      {translate('portalUx.product.cancel')}
    </Button>
  )
}
