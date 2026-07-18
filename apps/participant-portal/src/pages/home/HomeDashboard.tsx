import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslate } from 'react-admin'
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import type { Asset } from '../../types/asset'
import type { ContractDefinition } from '../../types/contractDefinition'
import type { ContractNegotiation } from '../../types/contractNegotiation'
import type { ContractAgreement } from '../../types/contractAgreement'
import type { TransferProcess } from '../../types/transferProcess'
import { useAllRecords } from '../../hooks/useAllRecords'
import { buildDashboardSummary, getAccessRequestStatus } from '../../services/dataProductViewModels'
import { PageHeader } from '../../components/portal/PortalPage'

const SummaryCard = ({ label, value, onClick }: { label: string; value?: number; onClick: () => void }) => (
  <Card variant="outlined">
    <CardActionArea onClick={onClick}>
      <CardContent>
        <Typography variant="h4">{value ?? '—'}</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {label}
        </Typography>
      </CardContent>
    </CardActionArea>
  </Card>
)

export const HomeDashboard = () => {
  const translate = useTranslate()
  const navigate = useNavigate()
  const assets = useAllRecords<Asset>('assets')
  const definitions = useAllRecords<ContractDefinition>('contractdefinitions')
  const negotiations = useAllRecords<ContractNegotiation>('contractnegotiations', {
    sort: { field: 'createdAt', order: 'DESC' },
  })
  const agreements = useAllRecords<ContractAgreement>('contractagreements', {
    sort: { field: 'contractSigningDate', order: 'DESC' },
  })
  const transfers = useAllRecords<TransferProcess>('transferprocesses', { sort: { field: 'updatedAt', order: 'DESC' } })
  const hasError = Boolean(
    assets.error || definitions.error || negotiations.error || agreements.error || transfers.error,
  )
  const summary = useMemo(
    () => buildDashboardSummary(assets.data, definitions.data, negotiations.data, agreements.data, transfers.data),
    [assets.data, definitions.data, negotiations.data, agreements.data, transfers.data],
  )
  const publishedIds = useMemo(
    () => new Set(definitions.data.flatMap((item) => item.assetsSelector || [])),
    [definitions.data],
  )
  const needsAttention = useMemo(
    () =>
      [
        ...assets.data
          .filter((asset) => !publishedIds.has(asset.id))
          .map((asset) => ({
            id: `asset-${asset.id}`,
            title: asset.title || asset.id,
            reason: translate('portalUx.dashboard.unsharedProduct'),
            href: `/data-products/${encodeURIComponent(asset.id)}`,
            tone: 'warning' as const,
          })),
        ...negotiations.data
          .filter((item) => getAccessRequestStatus(item) === 'rejected')
          .map((item) => ({
            id: `neg-${item.id}`,
            title: item.datasetId || item.id,
            reason: translate('portalUx.dashboard.rejectedRequest'),
            href: '/data-access?status=issues',
            tone: 'error' as const,
          })),
        ...transfers.data
          .filter((item) => ['FAILED', 'ERROR', 'TERMINATED'].includes(item.state))
          .map((item) => ({
            id: `transfer-${item.id}`,
            title: item.assetId || item.id,
            reason: translate('portalUx.dashboard.failedTransfer'),
            href: '/data-access?status=issues',
            tone: 'error' as const,
          })),
      ].slice(0, 8),
    [assets.data, negotiations.data, publishedIds, transfers.data, translate],
  )
  return (
    <Box>
      <PageHeader
        title={translate('portalUx.dashboard.title')}
        subtitle={translate('portalUx.dashboard.subtitle')}
        actions={
          <>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/data-products/create')}>
              {translate('portalUx.dashboard.createProduct')}
            </Button>
            <Button variant="outlined" startIcon={<SearchIcon />} onClick={() => navigate('/discover')}>
              {translate('portalUx.dashboard.discoverData')}
            </Button>
          </>
        }
      />
      <Alert severity="success" sx={{ mb: 2 }}>
        {translate('portalUx.dashboard.onboardingReady')}
      </Alert>
      {hasError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {translate('portalUx.dashboard.partialError')}
        </Alert>
      )}
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}
      >
        <SummaryCard
          label={translate('portalUx.dashboard.privateProducts')}
          value={assets.error || definitions.error ? undefined : summary.privateProducts}
          onClick={() => navigate('/data-products?visibility=private')}
        />
        <SummaryCard
          label={translate('portalUx.dashboard.publishedProducts')}
          value={assets.error || definitions.error ? undefined : summary.publishedProducts}
          onClick={() => navigate('/data-products?visibility=published')}
        />
        <SummaryCard
          label={translate('portalUx.dashboard.pendingRequests')}
          value={negotiations.error ? undefined : summary.pendingRequests}
          onClick={() => navigate('/data-access?status=pending')}
        />
        <SummaryCard
          label={translate('portalUx.dashboard.activeAccess')}
          value={agreements.error ? undefined : summary.activeAccess}
          onClick={() => navigate('/data-access?status=active')}
        />
        <SummaryCard
          label={translate('portalUx.dashboard.failedTransfers')}
          value={transfers.error ? undefined : summary.failedTransfers}
          onClick={() => navigate('/data-access?status=issues')}
        />
      </Box>
      <Box sx={{ mt: 3 }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">{translate('portalUx.dashboard.needsAttention')}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
              {needsAttention.length === 0 ? (
                <Typography color="text.secondary">{translate('portalUx.dashboard.noAttention')}</Typography>
              ) : (
                needsAttention.map((item) => (
                  <CardActionArea key={item.id} onClick={() => navigate(item.href)} sx={{ borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 1 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.reason}
                        </Typography>
                      </Box>
                      <Chip size="small" color={item.tone} label="!" />
                    </Box>
                  </CardActionArea>
                ))
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
