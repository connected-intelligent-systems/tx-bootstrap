import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Confirm, RecordContextProvider, useDataProvider, useNotify, useTranslate } from 'react-admin'
import { Alert, Box, Button, Chip, LinearProgress, Tab, Tabs } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ShareIcon from '@mui/icons-material/Share'
import InfoIcon from '@mui/icons-material/Info'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import AutoModeIcon from '@mui/icons-material/AutoMode'
import HandshakeIcon from '@mui/icons-material/Handshake'
import type { DataProductOffer } from '../../types/dataProduct'
import { getAssetSections } from '../../components/assets'
import { LoadingState, PageHeader, ResourceError } from '../../components/portal/PortalPage'
import { ShareDataDialog } from './ShareDataDialog'
import { DataProductEditDialog } from './DataProductEditDialog'
import { TerminateActionDialog } from './TerminateActionDialog'
import { DataProductOverview } from './DataProductOverview'
import { AgreementsTable, NegotiationsTable, OffersTable, TransfersTable } from './DataProductSubLists'
import { useDataProductDetails } from './useDataProductDetails'
import { useDataProductActions } from './useDataProductActions'

type LifecycleTab = 'offers' | 'negotiations' | 'agreements' | 'transfers'
type ProductTab = 'overview' | LifecycleTab | string

const LIFECYCLE_TABS: LifecycleTab[] = ['offers', 'negotiations', 'agreements', 'transfers']
const TabPanel = ({ active, children }: { active: boolean; children: ReactNode }) =>
  active ? <Box sx={{ mt: 3 }}>{children}</Box> : null

export const DataProductDetailPage = () => {
  const { id: assetId } = useParams<{ id: string }>()
  const translate = useTranslate()
  const navigate = useNavigate()
  const notify = useNotify()
  const dataProvider = useDataProvider()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const {
    asset,
    assetQuery,
    product,
    retiredIds,
    relatedPending,
    relatedErrors,
    refresh,
    refetchDefinitions,
    refetchPolicies,
    refetchTransfers,
    refetchNegotiations,
    refetchRetirements,
  } = useDataProductDetails(assetId)

  const [tab, setTab] = useState<ProductTab>(requestedTab || 'overview')
  const [shareOpen, setShareOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [editingOffer, setEditingOffer] = useState<DataProductOffer>()
  const { pendingAction, setPendingAction, removeOffer, setRemoveOffer, actionConfig, confirmAction, confirmRemove } =
    useDataProductActions({
      refetchDefinitions,
      refetchTransfers,
      refetchNegotiations,
      refetchRetirements,
    })

  const detailSections = useMemo(
    () =>
      asset
        ? getAssetSections(asset, translate).filter(
            (section) => !['basic-info', 'description', 'raw'].includes(section.id),
          )
        : [],
    [asset, translate],
  )
  const availableTabs = useMemo(
    () => ['overview', ...detailSections.map((section) => section.id), ...LIFECYCLE_TABS],
    [detailSections],
  )

  useEffect(() => {
    setTab(requestedTab && availableTabs.includes(requestedTab) ? requestedTab : 'overview')
  }, [assetId, availableTabs, requestedTab])
  const published = Boolean(product?.offers.length)
  const closeShare = () => {
    setShareOpen(false)
    setEditingOffer(undefined)
  }
  const openNewOffer = () => {
    setEditingOffer(undefined)
    setShareOpen(true)
  }
  const openDelete = () => {
    setDeleteError(undefined)
    setDeleteOpen(true)
  }
  const closeDelete = () => {
    if (!deleting) setDeleteOpen(false)
  }
  const deleteProduct = async () => {
    if (!asset) return
    setDeleting(true)
    setDeleteError(undefined)
    try {
      await dataProvider.delete('assets', { id: asset.id, previousData: asset })
      notify(translate('portalUx.product.deleted'), { type: 'success' })
      navigate('/data-products')
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message ? error.message : translate('portalUx.product.deleteFailed')
      setDeleteError(message)
      notify(message, { type: 'error' })
    } finally {
      setDeleting(false)
    }
  }
  const selectTab = (nextTab: ProductTab) => {
    setTab(nextTab)
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'overview') next.delete('tab')
    else next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  if (assetQuery.isPending && !asset) return <LoadingState />
  if (assetQuery.error && !asset) {
    return (
      <ResourceError
        message={translate('portalUx.product.loadError')}
        retryLabel={translate('portalUx.common.retry')}
        onRetry={refresh}
      />
    )
  }
  if (!product || !asset) return null

  return (
    <RecordContextProvider value={asset}>
      <Box>
        <PageHeader
          title={product.title}
          subtitle={product.description}
          actions={
            <>
              <Chip
                size="small"
                color={published ? 'primary' : 'default'}
                variant={published ? 'filled' : 'outlined'}
                label={translate(published ? 'portalUx.dataProducts.published' : 'portalUx.dataProducts.private')}
              />
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>
                {translate('portalUx.common.edit')}
              </Button>
              <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={openDelete}>
                {translate('portalUx.common.delete')}
              </Button>
              <Button variant="contained" startIcon={<ShareIcon />} onClick={openNewOffer}>
                {translate('portalUx.product.addOffer')}
              </Button>
            </>
          }
        />

        {relatedPending && <LinearProgress sx={{ mb: 2 }} aria-label={translate('portalUx.product.loadingRelated')} />}
        {relatedErrors.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <ResourceError
              message={translate('portalUx.product.partialLoadError')}
              retryLabel={translate('portalUx.common.retry')}
              onRetry={refresh}
            />
          </Box>
        )}
        <Tabs
          value={tab}
          onChange={(_, value: ProductTab) => selectTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="overview" icon={<InfoIcon />} label={translate('portalUx.product.overview')} />
          {detailSections.map((section) => (
            <Tab key={section.id} value={section.id} icon={section.icon} label={section.label} />
          ))}
          <Tab
            value="offers"
            icon={<ShareIcon />}
            label={`${translate('portalUx.product.offers')} (${product.offers.length})`}
          />
          <Tab
            value="negotiations"
            icon={<HandshakeIcon />}
            label={`${translate('portalUx.product.negotiations')} (${product.negotiations.length})`}
          />
          <Tab
            value="agreements"
            icon={<AssignmentTurnedInIcon />}
            label={`${translate('portalUx.product.agreements')} (${product.agreements.length})`}
          />
          <Tab
            value="transfers"
            icon={<AutoModeIcon />}
            label={`${translate('portalUx.product.transfers')} (${product.transfers.length})`}
          />
        </Tabs>

        <TabPanel active={tab === 'overview'}>
          <DataProductOverview asset={asset} />
        </TabPanel>
        {detailSections.map((section) => (
          <TabPanel key={section.id} active={tab === section.id}>
            {section.component}
          </TabPanel>
        ))}
        <TabPanel active={tab === 'offers'}>
          {product.offers.length === 0 ? (
            <Alert severity="info">{translate('portalUx.product.noOffers')}</Alert>
          ) : (
            <OffersTable
              offers={product.offers}
              onEdit={(offer) => {
                setEditingOffer(offer)
                setShareOpen(true)
              }}
              onRemove={setRemoveOffer}
            />
          )}
        </TabPanel>
        <TabPanel active={tab === 'negotiations'}>
          {product.negotiations.length === 0 ? (
            <Alert severity="info">{translate('portalUx.product.noNegotiations')}</Alert>
          ) : (
            <NegotiationsTable
              negotiations={product.negotiations}
              onCancel={(negotiation) => setPendingAction({ kind: 'negotiation', id: negotiation.id })}
            />
          )}
        </TabPanel>
        <TabPanel active={tab === 'agreements'}>
          {product.agreements.length === 0 ? (
            <Alert severity="info">{translate('portalUx.product.noAgreements')}</Alert>
          ) : (
            <AgreementsTable
              agreements={product.agreements}
              retiredIds={retiredIds}
              onRetire={(agreement) => setPendingAction({ kind: 'retire', id: agreement.id })}
              onReactivate={(agreement) => setPendingAction({ kind: 'reactivate', id: agreement.id })}
            />
          )}
        </TabPanel>
        <TabPanel active={tab === 'transfers'}>
          {product.transfers.length === 0 ? (
            <Alert severity="info">{translate('portalUx.product.noTransfers')}</Alert>
          ) : (
            <TransfersTable
              transfers={product.transfers}
              onCancel={(transfer) => setPendingAction({ kind: 'transfer', id: transfer.id })}
            />
          )}
        </TabPanel>
      </Box>

      <ShareDataDialog
        asset={asset}
        offer={editingOffer}
        open={shareOpen}
        onClose={closeShare}
        onSuccess={() => {
          refetchDefinitions()
          refetchPolicies()
        }}
      />
      <DataProductEditDialog
        asset={asset}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => assetQuery.refetch()}
      />
      <Confirm
        isOpen={deleteOpen}
        loading={deleting}
        title={translate('portalUx.product.deleteTitle')}
        content={
          <Box>
            <Box component="p" sx={{ mt: 0 }}>
              {translate('portalUx.product.deleteConfirm', { name: product.title })}
            </Box>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Box>
        }
        cancel={translate('portalUx.common.cancel')}
        confirm={translate('portalUx.common.delete')}
        confirmColor="warning"
        ConfirmIcon={DeleteIcon}
        onClose={closeDelete}
        onConfirm={deleteProduct}
      />
      <Confirm
        isOpen={Boolean(removeOffer)}
        title={translate('portalUx.product.removeOffer')}
        content={translate('portalUx.product.removeConfirm')}
        cancel={translate('portalUx.common.cancel')}
        confirm={translate('portalUx.common.remove')}
        confirmColor="warning"
        onClose={() => setRemoveOffer(undefined)}
        onConfirm={confirmRemove}
      />
      <TerminateActionDialog
        open={Boolean(pendingAction)}
        title={pendingAction ? actionConfig[pendingAction.kind].title : ''}
        description={pendingAction ? actionConfig[pendingAction.kind].description : ''}
        confirmLabel={pendingAction ? actionConfig[pendingAction.kind].confirmLabel : ''}
        onClose={() => setPendingAction(undefined)}
        onConfirm={confirmAction}
      />
    </RecordContextProvider>
  )
}
