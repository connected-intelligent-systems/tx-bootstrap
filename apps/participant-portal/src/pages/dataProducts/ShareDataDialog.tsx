import { useEffect, useMemo, useState } from 'react'
import { useDataProvider, useGetList, useNotify, useTranslate } from 'react-admin'
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Asset } from '../../types/asset'
import type { BusinessPartnerGroup } from '../../types/businessPartnerGroup'
import type { DataProductOffer } from '../../types/dataProduct'
import { createDataProductOffer, OfferCreationError } from '../../services/dataProductOfferService'
import { connectorErrorReasons } from '../../services/dataProductViewModels'
import { ParticipantMultiSelect } from '../../components/portal/ParticipantMultiSelect'
import {
  buildAccessConstraints,
  buildUsageConstraints,
  DEFAULT_USAGE_PURPOSE,
  FRAMEWORK_AGREEMENT,
  invalidBpns,
  isFutureEndDate,
  isValidDurationDays,
  isValidUsagePurpose,
  type OfferAudience,
  parseBpns,
  toDateInputValue,
  USAGE_PURPOSES,
  type UsageEnd,
} from './offerPolicy'

type Draft = {
  audience: OfferAudience
  partners: string
  group: string
  purpose: string
  usageEnd: UsageEnd
  endDate: string
  durationDays: string
}
const initialDraft: Draft = {
  audience: 'members',
  partners: '',
  group: '',
  purpose: DEFAULT_USAGE_PURPOSE,
  usageEnd: 'none',
  endDate: '',
  durationDays: '30',
}

const draftFromOffer = (offer?: DataProductOffer): Draft => {
  if (!offer) return initialDraft
  const access = offer.accessPolicy?.rules?.permissions?.flatMap((rule) => rule.constraints || []) || []
  const usage = offer.contractPolicy?.rules?.permissions?.flatMap((rule) => rule.constraints || []) || []
  const partner = access.find((item) => item.leftOperand === 'BusinessPartnerNumber')
  const group = access.find((item) => item.leftOperand === 'BusinessPartnerGroup')
  const purpose = usage.find((item) => item.leftOperand === 'UsagePurpose')
  const end = usage.find((item) => item.leftOperand === 'DataUsageEndDate')
  const duration = usage.find((item) => item.leftOperand === 'DataUsageEndDurationDays')
  return {
    audience: partner ? 'partners' : group ? 'group' : 'members',
    partners: Array.isArray(partner?.rightOperand)
      ? partner.rightOperand.join(', ')
      : String(partner?.rightOperand || ''),
    group: Array.isArray(group?.rightOperand) ? String(group.rightOperand[0] || '') : String(group?.rightOperand || ''),
    purpose: Array.isArray(purpose?.rightOperand)
      ? String(purpose.rightOperand[0] || initialDraft.purpose)
      : String(purpose?.rightOperand || initialDraft.purpose),
    usageEnd: end ? 'date' : duration ? 'duration' : 'none',
    endDate: toDateInputValue(end?.rightOperand),
    durationDays: duration ? String(duration.rightOperand) : initialDraft.durationDays,
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
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [orphanedPolicyIds, setOrphanedPolicyIds] = useState<string[]>([])
  const clearSaveErrors = () => {
    setSaveErrors([])
    setOrphanedPolicyIds([])
  }
  const { data: groupEntries, isLoading: groupsLoading } = useGetList<BusinessPartnerGroup>(
    'businesspartnergroups',
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'id', order: 'ASC' },
    },
    { enabled: open },
  )
  useEffect(() => {
    if (open) {
      setDraft(draftFromOffer(offer))
      setStep(0)
      setSaveErrors([])
      setOrphanedPolicyIds([])
    }
  }, [offer, open])
  // A changed draft makes the reasons of the last failed attempt stale.
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    clearSaveErrors()
  }
  const steps = [
    translate('portalUx.share.audienceStep'),
    translate('portalUx.share.usageStep'),
    translate('portalUx.share.reviewStep'),
  ]
  const groupChoices = useMemo(() => {
    const groups = Array.from(new Set((groupEntries || []).flatMap((entry) => entry.groups || [])))
    if (draft.group && !groups.includes(draft.group)) groups.push(draft.group)
    return groups.sort((left, right) => left.localeCompare(right))
  }, [draft.group, groupEntries])
  const accessConstraints = buildAccessConstraints(draft)
  const usageConstraints = buildUsageConstraints(draft)
  const parsedBpns = parseBpns(draft.partners)
  const invalidPartnerBpns = invalidBpns(draft.partners)
  const purposeValid = isValidUsagePurpose(draft.purpose)
  const endDateValid = isFutureEndDate(draft.endDate)
  const durationValid = isValidDurationDays(draft.durationDays)
  const usageEndValid = draft.usageEnd === 'date' ? endDateValid : draft.usageEnd === 'duration' ? durationValid : true
  // Grouped by namespace (cx.<namespace>.…); groups must be contiguous.
  const purposeGroup = (purpose: string) => purpose.match(/^cx\.([^.:]+)/)?.[1] ?? ''
  const purposeOptions = (
    USAGE_PURPOSES.includes(draft.purpose) ? [...USAGE_PURPOSES] : [draft.purpose, ...USAGE_PURPOSES]
  ).sort((left, right) => purposeGroup(left).localeCompare(purposeGroup(right)) || left.localeCompare(right))
  const today = new Date().toISOString().slice(0, 10)
  const valid =
    step === 0
      ? draft.audience === 'partners'
        ? parsedBpns.length > 0 && invalidPartnerBpns.length === 0
        : draft.audience === 'group'
          ? Boolean(draft.group.trim() && !groupsLoading && groupChoices.includes(draft.group))
          : true
      : step === 1
        ? purposeValid && usageEndValid
        : true
  const restrictionSummary =
    draft.audience === 'partners'
      ? translate('portalUx.share.restrictionPartnersSummary', { values: parsedBpns.join(', ') })
      : draft.audience === 'group'
        ? translate('portalUx.share.restrictionGroupSummary', { group: draft.group })
        : translate('portalUx.share.members')
  const summaryRows = [
    {
      label: translate('portalUx.share.membershipSummary'),
      value: translate('portalUx.share.membershipSummaryValue'),
    },
    { label: translate('portalUx.share.restrictionSummary'), value: restrictionSummary },
    { label: translate('portalUx.share.framework'), value: FRAMEWORK_AGREEMENT },
    { label: translate('portalUx.share.purpose'), value: draft.purpose },
    ...(draft.usageEnd === 'date'
      ? [{ label: translate('portalUx.share.endDateSummary'), value: draft.endDate }]
      : draft.usageEnd === 'duration'
        ? [
            {
              label: translate('portalUx.share.durationSummary'),
              value: translate('portalUx.share.durationSummaryValue', { days: draft.durationDays.trim() }),
            },
          ]
        : []),
  ]

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
    clearSaveErrors()
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
      setSaveErrors(connectorErrorReasons(error))
      setOrphanedPolicyIds(error instanceof OfferCreationError ? error.orphanedPolicyIds : [])
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
            <FormControl fullWidth>
              <InputLabel id="offer-access-restriction-label">
                {translate('portalUx.share.audienceQuestion')}
              </InputLabel>
              <Select
                labelId="offer-access-restriction-label"
                label={translate('portalUx.share.audienceQuestion')}
                fullWidth
                value={draft.audience}
                onChange={(event) => set('audience', event.target.value as OfferAudience)}
              >
                <MenuItem value="members">{translate('portalUx.share.members')}</MenuItem>
                <MenuItem value="partners">{translate('portalUx.share.partners')}</MenuItem>
                {(groupsLoading || groupChoices.length > 0) && (
                  <MenuItem value="group" disabled={groupsLoading}>
                    {translate('portalUx.share.group')}
                  </MenuItem>
                )}
              </Select>
              <FormHelperText>
                {translate('portalUx.share.audienceHelp')}{' '}
                {!groupsLoading && groupChoices.length === 0 && (
                  <Link component={RouterLink} to="/settings/partner-groups">
                    {translate('portalUx.share.manageGroups')}
                  </Link>
                )}
              </FormHelperText>
            </FormControl>
            {draft.audience === 'partners' && (
              <ParticipantMultiSelect
                label={translate('portalUx.share.bpns')}
                value={parsedBpns}
                onChange={(bpns) => set('partners', bpns.join(', '))}
                error={invalidPartnerBpns.length > 0}
                helperText={
                  invalidPartnerBpns.length > 0
                    ? translate('portalUx.share.bpnsInvalid', { values: invalidPartnerBpns.join(', ') })
                    : translate('portalUx.share.bpnsHelp')
                }
              />
            )}
            {draft.audience === 'group' && (
              <FormControl fullWidth disabled={groupsLoading || groupChoices.length === 0}>
                <InputLabel id="offer-partner-group-label">{translate('portalUx.share.partnerGroup')}</InputLabel>
                <Select
                  labelId="offer-partner-group-label"
                  label={translate('portalUx.share.partnerGroup')}
                  value={draft.group}
                  onChange={(event) => set('group', String(event.target.value))}
                >
                  {groupChoices.map((group) => (
                    <MenuItem key={group} value={group}>
                      {group}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {groupsLoading
                    ? translate('portalUx.share.groupsLoading')
                    : groupChoices.length === 0
                      ? translate('portalUx.share.groupsEmpty')
                      : translate('portalUx.share.groupsHelp')}
                  {!groupsLoading && groupChoices.length > 0 && (
                    <>
                      {' '}
                      <Link component={RouterLink} to="/settings/partner-groups">
                        {translate('portalUx.share.manageGroups')}
                      </Link>
                    </>
                  )}
                </FormHelperText>
              </FormControl>
            )}
          </Box>
        )}
        {step === 1 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label={translate('portalUx.share.framework')}
              value={FRAMEWORK_AGREEMENT}
              helperText={translate('portalUx.share.frameworkHelp')}
              slotProps={{ input: { readOnly: true } }}
            />
            <Autocomplete
              options={purposeOptions}
              groupBy={purposeGroup}
              value={draft.purpose}
              disableClearable
              onChange={(_, value) => set('purpose', value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={translate('portalUx.share.purpose')}
                  error={!purposeValid}
                  helperText={translate(purposeValid ? 'portalUx.share.purposeHelp' : 'portalUx.share.purposeInvalid')}
                />
              )}
            />
            <FormControl fullWidth>
              <InputLabel id="offer-usage-end-label">{translate('portalUx.share.usageEnd')}</InputLabel>
              <Select
                labelId="offer-usage-end-label"
                label={translate('portalUx.share.usageEnd')}
                value={draft.usageEnd}
                onChange={(event) => set('usageEnd', event.target.value as UsageEnd)}
              >
                <MenuItem value="none">{translate('portalUx.share.usageEndNone')}</MenuItem>
                <MenuItem value="date">{translate('portalUx.share.usageEndDate')}</MenuItem>
                <MenuItem value="duration">{translate('portalUx.share.usageEndDuration')}</MenuItem>
              </Select>
            </FormControl>
            {draft.usageEnd === 'date' && (
              <TextField
                label={translate('portalUx.share.endDate')}
                type="date"
                required
                value={draft.endDate}
                onChange={(event) => set('endDate', event.target.value)}
                error={Boolean(draft.endDate) && !endDateValid}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                helperText={translate(
                  draft.endDate && !endDateValid ? 'portalUx.share.endDateInvalid' : 'portalUx.share.endDateHelp',
                )}
              />
            )}
            {draft.usageEnd === 'duration' && (
              <TextField
                label={translate('portalUx.share.durationDays')}
                type="number"
                value={draft.durationDays}
                onChange={(event) => set('durationDays', event.target.value)}
                error={!durationValid}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                helperText={translate(
                  durationValid ? 'portalUx.share.durationDaysHelp' : 'portalUx.share.durationDaysInvalid',
                )}
              />
            )}
          </Box>
        )}
        {step === 2 && saveErrors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>{translate('portalUx.share.failed')}</AlertTitle>
            {saveErrors.map((reason) => (
              <Typography key={reason} variant="body2">
                {reason.startsWith('i18n:') ? translate(reason.slice(5)) : reason}
              </Typography>
            ))}
            {orphanedPolicyIds.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {translate('portalUx.share.orphaned', { ids: orphanedPolicyIds.join(', ') })}
              </Typography>
            )}
          </Alert>
        )}
        {step === 2 && (
          <Alert severity="info">
            <Typography sx={{ fontWeight: 700 }}>{translate('portalUx.share.summary')}</Typography>
            <Box sx={{ display: 'grid', gap: 1.25, mt: 1.5 }}>
              {summaryRows.map((row) => (
                <Box key={row.label}>
                  <Typography variant="caption" color="text.secondary">
                    {row.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              {translate('portalUx.share.catalogDelay')}
            </Typography>
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
