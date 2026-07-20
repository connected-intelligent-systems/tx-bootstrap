import { useMemo, useState } from 'react'
import { useDataProvider, useGetList, useNotify, useTranslate } from 'react-admin'
import AddIcon from '@mui/icons-material/Add'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '../../components/portal/PortalPage'
import { ParticipantMultiSelect } from '../../components/portal/ParticipantMultiSelect'
import type { BusinessPartnerGroup } from '../../types/businessPartnerGroup'
import { invalidBpns, parseBpns } from '../../utils/bpn'
import { planPartnerGroupChanges, toPartnerGroups, type PartnerGroupOperation } from './partnerGroupModel'

const RESOURCE = 'businesspartnergroups'

interface GroupForm {
  previousName?: string
  name: string
  members: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const PartnerGroupsPage = () => {
  const translate = useTranslate()
  const notify = useNotify()
  const dataProvider = useDataProvider()
  const { data, isLoading, error, refetch } = useGetList<BusinessPartnerGroup>(RESOURCE, {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'id', order: 'ASC' },
  })
  const [form, setForm] = useState<GroupForm>()
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState<string>()

  const entries = useMemo(() => data || [], [data])
  const groups = useMemo(() => toPartnerGroups(entries), [entries])
  const members = form ? parseBpns(form.members) : []
  const invalidMembers = form ? invalidBpns(form.members) : []
  const normalizedName = form?.name.trim() || ''
  const duplicateName = groups.some((group) => group.name === normalizedName && group.name !== form?.previousName)
  const formValid = Boolean(normalizedName && members.length && !invalidMembers.length && !duplicateName)

  const applyOperation = async (operation: PartnerGroupOperation) => {
    if (operation.kind === 'create') {
      await dataProvider.create(RESOURCE, { data: operation.data })
    } else if (operation.kind === 'update') {
      await dataProvider.update(RESOURCE, {
        id: operation.id,
        data: operation.data,
        previousData: operation.previousData,
      })
    } else {
      await dataProvider.delete(RESOURCE, { id: operation.id, previousData: operation.previousData })
    }
  }

  const save = async () => {
    if (!form || !formValid) return
    setBusy(true)
    setMutationError(undefined)
    try {
      const operations = planPartnerGroupChanges({
        entries,
        previousName: form.previousName,
        name: normalizedName,
        members,
      })
      for (const operation of operations) await applyOperation(operation)
      setForm(undefined)
      await refetch()
      notify(translate('portalUx.partnerGroups.saved'), { type: 'success' })
    } catch (saveError) {
      setMutationError(errorMessage(saveError))
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string) => {
    if (!window.confirm(translate('portalUx.partnerGroups.deleteConfirm', { name }))) return
    setBusy(true)
    setMutationError(undefined)
    try {
      const operations = planPartnerGroupChanges({ entries, previousName: name, members: [] })
      for (const operation of operations) await applyOperation(operation)
      await refetch()
      notify(translate('portalUx.partnerGroups.deleted'), { type: 'success' })
    } catch (deleteError) {
      setMutationError(errorMessage(deleteError))
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box>
      <PageHeader
        title={translate('portalUx.partnerGroups.title')}
        subtitle={translate('portalUx.partnerGroups.subtitle')}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ name: '', members: '' })}>
            {translate('portalUx.partnerGroups.create')}
          </Button>
        }
      />

      {(error || mutationError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mutationError || errorMessage(error)}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        <Alert severity="info">{translate('portalUx.partnerGroups.empty')}</Alert>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{translate('portalUx.partnerGroups.name')}</TableCell>
                <TableCell>{translate('portalUx.partnerGroups.members')}</TableCell>
                <TableCell align="right" sx={{ width: 1, whiteSpace: 'nowrap' }}>
                  {translate('portalUx.partnerGroups.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.name}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{group.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {translate('portalUx.partnerGroups.memberCount', { smart_count: group.members.length })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                      {group.members.slice(0, 5).map((bpn) => (
                        <Chip key={bpn} label={bpn} size="small" />
                      ))}
                      {group.members.length > 5 && <Chip label={`+${group.members.length - 5}`} size="small" />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 1, whiteSpace: 'nowrap' }}>
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        setForm({
                          previousName: group.name,
                          name: group.name,
                          members: group.members.join('\n'),
                        })
                      }
                    >
                      {translate('portalUx.common.edit')}
                    </Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => remove(group.name)}>
                      {translate('portalUx.common.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={Boolean(form)} onClose={busy ? undefined : () => setForm(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>
          {form?.previousName
            ? translate('portalUx.partnerGroups.editTitle')
            : translate('portalUx.partnerGroups.createTitle')}
        </DialogTitle>
        {form && (
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label={translate('portalUx.partnerGroups.name')}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              disabled={Boolean(form.previousName)}
              error={duplicateName}
              helperText={
                duplicateName
                  ? translate('portalUx.partnerGroups.duplicateName')
                  : translate(
                      form.previousName ? 'portalUx.partnerGroups.nameImmutable' : 'portalUx.partnerGroups.nameHelp',
                    )
              }
            />
            <ParticipantMultiSelect
              label={translate('portalUx.partnerGroups.memberBpns')}
              value={members}
              onChange={(bpns) => setForm({ ...form, members: bpns.join('\n') })}
              error={invalidMembers.length > 0}
              helperText={
                invalidMembers.length
                  ? translate('portalUx.partnerGroups.invalidBpns', { values: invalidMembers.join(', ') })
                  : translate('portalUx.partnerGroups.membersHelp')
              }
            />
          </DialogContent>
        )}
        <DialogActions>
          <Button disabled={busy} onClick={() => setForm(undefined)}>
            {translate('portalUx.common.cancel')}
          </Button>
          <Button variant="contained" disabled={busy || !formValid} onClick={save}>
            {translate('portalUx.common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
