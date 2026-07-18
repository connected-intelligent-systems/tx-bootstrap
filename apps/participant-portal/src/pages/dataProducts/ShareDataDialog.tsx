import { useEffect, useMemo, useState } from 'react'
import { useDataProvider, useNotify, useTranslate } from 'react-admin'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import type { Asset } from '../../types/asset'
import type { DataProductOffer } from '../../types/dataProduct'
import { createDataProductOffer, OfferCreationError } from '../../services/dataProductOfferService'

type Audience = 'members' | 'partners' | 'group'
type Draft = {
  audience: Audience
  partners: string
  group: string
  purpose: string
  framework: string
  endDate: string
}
const initialDraft: Draft = {
  audience: 'members',
  partners: '',
  group: '',
  purpose: 'cx.core.industrycore:1',
  framework: 'DataExchangeGovernance:1.0',
  endDate: '',
}

const draftFromOffer = (offer?: DataProductOffer): Draft => {
  if (!offer) return initialDraft
  const access = offer.accessPolicy?.rules?.permissions?.flatMap((rule) => rule.constraints || []) || []
  const usage = offer.contractPolicy?.rules?.permissions?.flatMap((rule) => rule.constraints || []) || []
  const partner = access.find((item) => item.leftOperand === 'BusinessPartnerNumber')
  const group = access.find((item) => item.leftOperand === 'BusinessPartnerGroup')
  const purpose = usage.find((item) => item.leftOperand === 'UsagePurpose')
  const framework = usage.find((item) => item.leftOperand === 'FrameworkAgreement')
  const end = usage.find((item) => item.leftOperand === 'DataUsageEndDate')
  return {
    audience: partner ? 'partners' : group ? 'group' : 'members',
    partners: Array.isArray(partner?.rightOperand)
      ? partner.rightOperand.join(', ')
      : String(partner?.rightOperand || ''),
    group: String(group?.rightOperand || ''),
    purpose: Array.isArray(purpose?.rightOperand)
      ? String(purpose.rightOperand[0] || initialDraft.purpose)
      : String(purpose?.rightOperand || initialDraft.purpose),
    framework: String(framework?.rightOperand || initialDraft.framework),
    endDate: String(end?.rightOperand || ''),
  }
}

export const ShareDataDialog = ({
  asset,
  offer,
  open,
  onClose,
  onSuccess,
}: {
  asset: Asset
  offer?: DataProductOffer
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}) => {
  const translate = useTranslate()
  const notify = useNotify()
  const dataProvider = useDataProvider()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) {
      setDraft(draftFromOffer(offer))
      setStep(0)
    }
  }, [offer, open])
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const steps = [
    translate('portalUx.share.audienceStep'),
    translate('portalUx.share.usageStep'),
    translate('portalUx.share.reviewStep'),
  ]
  const accessConstraints = useMemo(
    () =>
      draft.audience === 'partners'
        ? [
            {
              leftOperand: 'BusinessPartnerNumber',
              operator: 'isAnyOf',
              rightOperand: draft.partners
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            },
          ]
        : draft.audience === 'group'
          ? [{ leftOperand: 'BusinessPartnerGroup', operator: 'eq', rightOperand: draft.group }]
          : [{ leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' }],
    [draft.audience, draft.group, draft.partners],
  )
  const usageConstraints = useMemo(
    () => [
      { leftOperand: 'FrameworkAgreement', operator: 'eq', rightOperand: draft.framework },
      { leftOperand: 'UsagePurpose', operator: 'isAnyOf', rightOperand: [draft.purpose] },
      ...(draft.endDate ? [{ leftOperand: 'DataUsageEndDate', operator: 'lteq', rightOperand: draft.endDate }] : []),
    ],
    [draft.endDate, draft.framework, draft.purpose],
  )
  const valid =
    step === 0
      ? draft.audience === 'partners'
        ? Boolean(draft.partners.trim())
        : draft.audience === 'group'
          ? Boolean(draft.group.trim())
          : true
      : step === 1
        ? Boolean(draft.framework.trim() && draft.purpose.trim())
        : true
  const summary = `${draft.audience === 'members' ? translate('portalUx.share.members') : draft.audience === 'partners' ? translate('portalUx.share.partners') : translate('portalUx.share.group')} · ${draft.framework} · ${draft.purpose}${draft.endDate ? ` · ${draft.endDate}` : ''}`

  const policyData = (kind: 'access' | 'usage') => ({
    name: `${asset.title || asset.id} ${kind}`,
    description:
      kind === 'access'
        ? 'Generated access terms for a data product offer'
        : 'Generated Tractus-X usage terms for a data product offer',
    rules: {
      permissions: [
        {
          action: kind === 'access' ? 'access' : 'use',
          constraints: kind === 'access' ? accessConstraints : usageConstraints,
        },
      ],
    },
  })
  const save = async () => {
    setSaving(true)
    try {
      if (offer?.accessPolicyId && offer.contractPolicyId && offer.accessPolicy && offer.contractPolicy) {
        await dataProvider.update('policies', {
          id: offer.accessPolicyId,
          data: { ...offer.accessPolicy, ...policyData('access') },
          previousData: offer.accessPolicy,
        })
        await dataProvider.update('policies', {
          id: offer.contractPolicyId,
          data: { ...offer.contractPolicy, ...policyData('usage') },
          previousData: offer.contractPolicy,
        })
        await dataProvider.update('contractdefinitions', {
          id: offer.id,
          data: { ...offer.source, assetsSelector: [asset.id] },
          previousData: offer.source,
        })
        notify(translate('portalUx.share.updated'), { type: 'success' })
      } else {
        await createDataProductOffer(dataProvider, {
          assetId: asset.id,
          title: asset.title || asset.id,
          accessPolicy: policyData('access'),
          usagePolicy: policyData('usage'),
        })
        notify(translate('portalUx.share.published'), { type: 'success' })
      }
      onSuccess?.()
      onClose()
    } catch (error: any) {
      const orphaned = error instanceof OfferCreationError ? error.orphanedPolicyIds : []
      notify(error?.message || translate('portalUx.share.failed'), { type: 'error' })
      if (orphaned.length)
        notify(translate('portalUx.share.orphaned', { ids: orphaned.join(', ') }), { type: 'warning' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{translate('portalUx.share.title', { name: asset.title || asset.id })}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} alternativeLabel sx={{ my: 2 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {step === 0 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box>
              <InputLabel>{translate('portalUx.share.audienceQuestion')}</InputLabel>
              <Select
                fullWidth
                value={draft.audience}
                onChange={(event) => set('audience', event.target.value as Audience)}
              >
                <MenuItem value="members">{translate('portalUx.share.members')}</MenuItem>
                <MenuItem value="partners">{translate('portalUx.share.partners')}</MenuItem>
                <MenuItem value="group">{translate('portalUx.share.group')}</MenuItem>
              </Select>
            </Box>
            {draft.audience === 'partners' && (
              <TextField
                label={translate('portalUx.share.bpns')}
                helperText={translate('portalUx.share.bpnsHelp')}
                value={draft.partners}
                onChange={(event) => set('partners', event.target.value)}
              />
            )}
            {draft.audience === 'group' && (
              <TextField
                label={translate('portalUx.share.partnerGroup')}
                value={draft.group}
                onChange={(event) => set('group', event.target.value)}
              />
            )}
          </Box>
        )}
        {step === 1 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label={translate('portalUx.share.framework')}
              value={draft.framework}
              onChange={(event) => set('framework', event.target.value)}
            />
            <TextField
              label={translate('portalUx.share.purpose')}
              value={draft.purpose}
              onChange={(event) => set('purpose', event.target.value)}
            />
            <TextField
              label={translate('portalUx.share.endDate')}
              type="date"
              value={draft.endDate}
              onChange={(event) => set('endDate', event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        )}
        {step === 2 && (
          <Alert severity="info">
            <Typography sx={{ fontWeight: 700 }}>{translate('portalUx.share.summary')}</Typography>
            <Typography sx={{ mt: 0.5 }}>{summary}</Typography>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          {translate('portalUx.common.cancel')}
        </Button>
        {step > 0 && (
          <Button disabled={saving} onClick={() => setStep((value) => value - 1)}>
            {translate('portalUx.common.back')}
          </Button>
        )}
        {step < 2 ? (
          <Button variant="contained" disabled={!valid} onClick={() => setStep((value) => value + 1)}>
            {translate('portalUx.common.next')}
          </Button>
        ) : (
          <Button variant="contained" disabled={saving} onClick={save}>
            {translate(
              saving ? 'portalUx.share.publishing' : offer ? 'portalUx.share.update' : 'portalUx.share.publish',
            )}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
