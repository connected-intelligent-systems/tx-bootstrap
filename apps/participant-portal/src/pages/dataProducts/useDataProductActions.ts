import { useState } from 'react'
import { useDataProvider, useNotify, useTranslate } from 'react-admin'
import type { DataProductOffer } from '../../types/dataProduct'

type PendingAction =
  | { kind: 'negotiation'; id: string }
  | { kind: 'transfer'; id: string }
  | { kind: 'retire'; id: string }
  | { kind: 'reactivate'; id: string }

interface DataProductActionRefetchers {
  refetchDefinitions: () => unknown
  refetchTransfers: () => unknown
  refetchNegotiations: () => unknown
  refetchRetirements: () => unknown
}

export const useDataProductActions = ({
  refetchDefinitions,
  refetchTransfers,
  refetchNegotiations,
  refetchRetirements,
}: DataProductActionRefetchers) => {
  const translate = useTranslate()
  const notify = useNotify()
  const dataProvider = useDataProvider()
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [removeOffer, setRemoveOffer] = useState<DataProductOffer>()

  const actionConfig: Record<PendingAction['kind'], { title: string; description: string; confirmLabel: string }> = {
    negotiation: {
      title: translate('portalUx.product.cancelNegotiation'),
      description: translate('portalUx.product.cancelNegotiationText'),
      confirmLabel: translate('portalUx.product.cancelNegotiation'),
    },
    transfer: {
      title: translate('portalUx.product.cancelTransfer'),
      description: translate('portalUx.product.cancelTransferText'),
      confirmLabel: translate('portalUx.product.cancelTransfer'),
    },
    retire: {
      title: translate('portalUx.product.retireAgreement'),
      description: translate('portalUx.product.retireAgreementText'),
      confirmLabel: translate('portalUx.product.retire'),
    },
    reactivate: {
      title: translate('portalUx.product.reactivateAgreement'),
      description: translate('portalUx.product.reactivateAgreementText'),
      confirmLabel: translate('portalUx.product.reactivate'),
    },
  }

  const confirmAction = async (reason: string) => {
    if (!pendingAction) return
    try {
      if (pendingAction.kind === 'negotiation') {
        await dataProvider.create('terminatecontractnegotiation', { data: { id: pendingAction.id, reason } })
        notify(translate('portalUx.product.negotiationCancelled'), { type: 'success' })
        refetchNegotiations()
      } else if (pendingAction.kind === 'transfer') {
        await dataProvider.create('terminatetransferprocess', { data: { id: pendingAction.id, reason } })
        notify(translate('portalUx.product.transferCancelled'), { type: 'success' })
        refetchTransfers()
      } else if (pendingAction.kind === 'retire') {
        await dataProvider.create('contractagreementretirements', { data: { id: pendingAction.id, reason } })
        notify(translate('portalUx.product.agreementRetired'), { type: 'success' })
        refetchRetirements()
      } else {
        await dataProvider.delete('contractagreementretirements', { id: pendingAction.id })
        notify(translate('portalUx.product.agreementReactivated'), { type: 'success' })
        refetchRetirements()
      }
      setPendingAction(undefined)
    } catch (error: any) {
      notify(error?.message || translate('ra.notification.http_error'), { type: 'error' })
    }
  }

  const confirmRemove = async () => {
    if (!removeOffer) return
    try {
      await dataProvider.delete('contractdefinitions', { id: removeOffer.id, previousData: removeOffer.source })
      notify(translate('portalUx.product.offerRemoved'), { type: 'success' })
      setRemoveOffer(undefined)
      refetchDefinitions()
    } catch (error: any) {
      notify(error?.message || translate('ra.notification.http_error'), { type: 'error' })
    }
  }

  return {
    pendingAction,
    setPendingAction,
    removeOffer,
    setRemoveOffer,
    actionConfig,
    confirmAction,
    confirmRemove,
  }
}
