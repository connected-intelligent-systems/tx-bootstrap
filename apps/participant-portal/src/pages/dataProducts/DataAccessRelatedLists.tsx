import type { ReactNode } from 'react'
import { DataTable, DateField, ListBase, Pagination, useListContext, useRecordContext, useTranslate } from 'react-admin'
import { Alert, Chip } from '@mui/material'
import type { ContractAgreement } from '../../types/contractAgreement'
import type { ContractNegotiation } from '../../types/contractNegotiation'
import type { Dataset } from '../../types/catalog'
import type { TransferProcess } from '../../types/transferProcess'
import { getAccessRequestStatus } from '../../services/dataProductViewModels'
import { FriendlyStatusChip, LoadingState, ResourceError } from '../../components/portal/PortalPage'
import { TransferAccessDetailsAction } from './TransferAccessDetailsDialog'

const RelatedList = ({ children, emptyText }: { children: ReactNode; emptyText: string }) => {
  const translate = useTranslate()
  const { error, isPending, total = 0, refetch } = useListContext()
  if (isPending) return <LoadingState />
  if (error)
    return <ResourceError message={error.message} retryLabel={translate('portalUx.common.retry')} onRetry={refetch} />
  if (!total) return <Alert severity="info">{emptyText}</Alert>
  return (
    <>
      <DataTable bulkActionButtons={false} size="small" sx={{ '& td': { verticalAlign: 'middle' } }}>
        {children}
      </DataTable>
      <Pagination rowsPerPageOptions={[10, 25, 50]} />
    </>
  )
}

export const DataAccessNegotiationsList = ({ lifecycleId }: { lifecycleId: string }) => {
  const t = useTranslate()
  return (
    <ListBase
      resource="dataaccessnegotiations"
      filter={{ lifecycleId }}
      perPage={10}
      sort={{ field: 'updatedAt', order: 'DESC' }}
      disableSyncWithLocation
    >
      <RelatedList emptyText={t('portalUx.product.noNegotiations')}>
        <DataTable.Col<ContractNegotiation>
          label={t('portalUx.product.status')}
          render={(record) => {
            const status = getAccessRequestStatus(record)
            return <FriendlyStatusChip status={status} label={t(`portalUx.status.${status}`)} />
          }}
          disableSort
        />
        <DataTable.Col<ContractNegotiation> source="state" label={t('portalUx.product.state')} disableSort />
        <DataTable.Col<ContractNegotiation> source="createdAt" label={t('portalUx.product.created')} disableSort>
          <DateField source="createdAt" showTime />
        </DataTable.Col>
        <DataTable.Col<ContractNegotiation>
          source="contractAgreementId"
          label={t('portalUx.myData.agreement')}
          disableSort
          sx={{ overflowWrap: 'anywhere' }}
        />
      </RelatedList>
    </ListBase>
  )
}

export const DataAccessAgreementsList = ({ lifecycleId }: { lifecycleId: string }) => {
  const t = useTranslate()
  return (
    <ListBase
      resource="dataaccessagreements"
      filter={{ lifecycleId }}
      perPage={10}
      sort={{ field: 'contractSigningDate', order: 'DESC' }}
      disableSyncWithLocation
    >
      <RelatedList emptyText={t('portalUx.product.noAgreements')}>
        <DataTable.Col<ContractAgreement>
          label={t('portalUx.product.status')}
          render={() => <FriendlyStatusChip status="granted" label={t('portalUx.product.active')} />}
          disableSort
        />
        <DataTable.Col<ContractAgreement>
          source="id"
          label={t('portalUx.myData.agreement')}
          disableSort
          sx={{ overflowWrap: 'anywhere' }}
        />
        <DataTable.Col<ContractAgreement> source="contractSigningDate" label={t('portalUx.product.signed')} disableSort>
          <DateField source="contractSigningDate" showTime />
        </DataTable.Col>
      </RelatedList>
    </ListBase>
  )
}

const TransferDate = () => {
  const transfer = useRecordContext<TransferProcess>()
  const date = transfer?.updatedAt || transfer?.stateTimestamp
  return transfer && date ? <DateField source="date" record={{ id: transfer.id, date }} showTime /> : '—'
}

export const DataAccessTransfersList = ({ lifecycleId, dataset }: { lifecycleId: string; dataset?: Dataset }) => {
  const t = useTranslate()
  return (
    <ListBase
      resource="dataaccesstransfers"
      filter={{ lifecycleId }}
      perPage={10}
      sort={{ field: 'updatedAt', order: 'DESC' }}
      disableSyncWithLocation
    >
      <RelatedList emptyText={t('portalUx.product.noTransfers')}>
        <DataTable.Col<TransferProcess>
          source="state"
          label={t('portalUx.product.state')}
          render={(record) => <Chip size="small" variant="outlined" label={record.state} />}
          disableSort
        />
        <DataTable.Col<TransferProcess>
          source="transferDirection"
          label={t('portalUx.product.direction')}
          disableSort
        />
        <DataTable.Col<TransferProcess>
          source="transferType"
          label={t('portalUx.product.type')}
          render={(record) => record.transferType || '—'}
          disableSort
        />
        <DataTable.Col<TransferProcess>
          source="contractId"
          label={t('portalUx.myData.agreement')}
          disableSort
          sx={{ overflowWrap: 'anywhere' }}
        />
        <DataTable.Col<TransferProcess> label={t('portalUx.product.updatedAt')} disableSort>
          <TransferDate />
        </DataTable.Col>
        <DataTable.Col<TransferProcess>
          label={t('portalUx.myData.actions')}
          render={(record) => <TransferAccessDetailsAction transfer={record} dataset={dataset} />}
          disableSort
        />
      </RelatedList>
    </ListBase>
  )
}
