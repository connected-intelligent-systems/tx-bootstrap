import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslate, useCreate, useNotify } from 'react-admin'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import HandshakeIcon from '@mui/icons-material/Handshake'
import InfoIcon from '@mui/icons-material/Info'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Dataset } from '../../../types/catalog'
import { PolicySelectionView } from './PolicySelectionView'
import { DatasetDetailsView } from './DatasetDetailsView'
import { saveAccessRequestContext } from '../../../services/accessRequestContext'
import { dataAccessDetailPath } from '../../../services/dataAccessRoutes'

interface ContractNegotiationDialogProps {
  dataset: Dataset
  open: boolean
  counterPartyAddress?: string
  counterPartyId?: string
  onClose: () => void
}

type DialogStep = 'view' | 'policySelection'

export const ContractNegotiationDialog: React.FC<ContractNegotiationDialogProps> = ({
  dataset,
  open,
  onClose,
  counterPartyAddress,
  counterPartyId,
}) => {
  const navigate = useNavigate()
  const notify = useNotify()
  const [create, { isPending: isCreating }] = useCreate()
  const [step, setStep] = useState<DialogStep>('view')
  const [selectedPolicy, setSelectedPolicy] = useState(0)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const translate = useTranslate()

  const policies = useMemo(() => dataset?.policies ?? [], [dataset?.policies])
  const datasetId = dataset?.id
  const participantId = dataset?.participantId

  const handleStartNegotiation = () => {
    if (policies.length === 0) return
    setStep('policySelection')
  }

  const handleBackToView = () => {
    setStep('view')
  }

  const handleClose = useCallback(() => {
    setStep('view')
    setSelectedPolicy(0)
    onClose()
  }, [onClose])

  const handleConfirmNegotiation = useCallback(() => {
    if (isCreating) {
      return
    }

    const policy = policies[selectedPolicy]
    if (!policy) {
      return
    }

    const negotiationData = {
      policy: {
        type: policy?.type,
        id: policy?.id,
        assigner: participantId,
        obligations: policy?.obligations,
        permissions: policy?.permissions,
        prohibitions: policy?.prohibitions,
        target: datasetId,
        raw: policy.raw,
      },
      counterPartyAddress,
      counterPartyId,
      protocol: 'dataspace-protocol-http',
    }

    create(
      'contractnegotiations',
      { data: negotiationData },
      {
        onSuccess: (data) => {
          const negotiationId = data?.id

          if (negotiationId) {
            saveAccessRequestContext({
              negotiationId,
              datasetId,
              datasetTitle: dataset.title || dataset.theme?.title,
              dataset,
              providerId: counterPartyId || participantId,
              catalogId: dataset.catalogUrl,
              offerId: policy.id,
              createdAt: new Date().toISOString(),
            })
          }

          notify(translate('resources.contractnegotiations.messages.negotiationStarted'), { type: 'success' })
          handleClose()
          const providerId = counterPartyId || participantId
          if (providerId && datasetId) {
            navigate(dataAccessDetailPath(providerId, datasetId))
          } else {
            navigate('/data-access')
          }
        },
        onError: (error: any) => {
          notify(error?.message || translate('resources.contractnegotiations.messages.negotiationFailed'), {
            type: 'error',
          })
        },
      },
    )
  }, [
    create,
    counterPartyAddress,
    counterPartyId,
    dataset,
    datasetId,
    handleClose,
    isCreating,
    navigate,
    notify,
    participantId,
    policies,
    selectedPolicy,
    translate,
  ])

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      sx={isMobile ? {} : { '& .MuiDialog-paper': { minHeight: '70vh' } }}
      aria-labelledby="dataset-dialog-title"
      aria-describedby="dataset-dialog-description"
    >
      <DialogTitle id="dataset-dialog-title">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {step === 'policySelection' && <ArrowBackIcon sx={{ cursor: 'pointer' }} onClick={handleBackToView} />}
          <InfoIcon />
          <Typography variant="h6" component="div">
            {step === 'view'
              ? translate('resources.catalog.dataset.datasetDetailsAndNegotiation')
              : translate('resources.catalog.dataset.selectPolicy')}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }} id="dataset-dialog-description">
        {step === 'view' ? (
          <DatasetDetailsView dataset={dataset} isMobile={isMobile} />
        ) : (
          <Box sx={{ p: 3 }}>
            <PolicySelectionView
              policies={policies}
              selectedPolicy={selectedPolicy}
              onSelectPolicy={setSelectedPolicy}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button onClick={handleClose} aria-label={translate('resources.catalog.dataset.aria.closeDialog')}>
            {translate('resources.catalog.dataset.close')}
          </Button>
          {step === 'view' && policies.length > 0 && (
            <Button
              variant="contained"
              startIcon={<HandshakeIcon />}
              onClick={handleStartNegotiation}
              aria-label={translate('resources.catalog.dataset.aria.startNegotiation')}
            >
              {translate('resources.catalog.dataset.startNegotiation')}
            </Button>
          )}
          {step === 'policySelection' && (
            <Button
              variant="contained"
              startIcon={<HandshakeIcon />}
              onClick={handleConfirmNegotiation}
              disabled={isCreating}
              aria-label={translate('resources.catalog.dataset.aria.confirmNegotiation')}
            >
              {isCreating
                ? translate('resources.catalog.dataset.creatingNegotiation')
                : translate('resources.catalog.dataset.confirmNegotiation')}
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  )
}
