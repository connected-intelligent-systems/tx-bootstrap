import { useState } from 'react'
import { useGetList, useCreate, useUpdate, useDelete, useNotify, useTranslate } from 'react-admin'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  TextField as MuiTextField,
  Box,
  Chip,
  Typography,
  List as MuiList,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import { BusinessPartnerGroup } from '../../../types/businessPartnerGroup'

const RESOURCE = 'businesspartnergroups'

interface BusinessPartnerGroupsDialogProps {
  open: boolean
  onClose: () => void
}

export const BusinessPartnerGroupsDialog = ({ open, onClose }: BusinessPartnerGroupsDialogProps) => {
  const translate = useTranslate()
  const notify = useNotify()
  const { data, isLoading, refetch } = useGetList<BusinessPartnerGroup>(
    RESOURCE,
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'id', order: 'ASC' },
    },
    { enabled: open },
  )
  const [create, { isPending: isCreating }] = useCreate()
  const [update, { isPending: isUpdating }] = useUpdate()
  const [deleteOne] = useDelete()

  // null = showing the list, "" = creating a new entry, otherwise the BPN being edited
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formBpn, setFormBpn] = useState('')
  const [formGroups, setFormGroups] = useState<string[]>([])
  const [groupInput, setGroupInput] = useState('')

  const isSaving = isCreating || isUpdating

  const startCreate = () => {
    setEditingId('')
    setFormBpn('')
    setFormGroups([])
    setGroupInput('')
  }

  const startEdit = (entry: BusinessPartnerGroup) => {
    setEditingId(entry.id)
    setFormBpn(entry.id)
    setFormGroups(entry.groups || [])
    setGroupInput('')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const addGroupTag = () => {
    const trimmed = groupInput.trim()
    if (trimmed && !formGroups.includes(trimmed)) {
      setFormGroups([...formGroups, trimmed])
    }
    setGroupInput('')
  }

  const removeGroupTag = (group: string) => {
    setFormGroups(formGroups.filter((existing) => existing !== group))
  }

  const handleSave = () => {
    const bpn = formBpn.trim()
    if (!bpn) return

    const mutate = editingId === '' ? create : update
    const params =
      editingId === ''
        ? { data: { id: bpn, groups: formGroups } }
        : {
            id: editingId,
            data: { id: editingId, groups: formGroups },
            previousData: { id: editingId },
          }

    mutate(RESOURCE, params as any, {
      onSuccess: () => {
        notify(translate('resources.policies.groupsDialog.saved'))
        setEditingId(null)
        refetch()
      },
      onError: (error: any) => {
        notify(error?.message || translate('resources.policies.groupsDialog.saveError'), { type: 'error' })
      },
    })
  }

  const handleDelete = (id: string) => {
    deleteOne(
      RESOURCE,
      { id, previousData: { id } },
      {
        onSuccess: () => {
          notify(translate('resources.policies.groupsDialog.deleted'))
          refetch()
        },
        onError: (error: any) => {
          notify(error?.message || translate('resources.policies.groupsDialog.deleteError'), { type: 'error' })
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>{translate('resources.policies.groupsDialog.title')}</Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : editingId !== null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <MuiTextField
              label={translate('resources.policies.groupsDialog.bpnLabel')}
              value={formBpn}
              onChange={(event) => setFormBpn(event.target.value)}
              disabled={editingId !== ''}
              fullWidth
              size="small"
            />
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {translate('resources.policies.groupsDialog.groupsLabel')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <MuiTextField
                  value={groupInput}
                  onChange={(event) => setGroupInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addGroupTag()
                    }
                  }}
                  size="small"
                  fullWidth
                  label={translate('resources.policies.groupsDialog.groupLabel')}
                />
                <Button onClick={addGroupTag} variant="outlined">
                  {translate('resources.policies.groupsDialog.addGroup')}
                </Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {formGroups.map((group) => (
                  <Chip key={group} label={group} onDelete={() => removeGroupTag(group)} size="small" />
                ))}
              </Box>
            </Box>
          </Box>
        ) : (
          <>
            <Button startIcon={<AddIcon />} onClick={startCreate} sx={{ mb: 1 }}>
              {translate('resources.policies.groupsDialog.addEntry')}
            </Button>
            {data && data.length > 0 ? (
              <MuiList dense>
                {data.map((entry) => (
                  <Box key={entry.id}>
                    <ListItem
                      secondaryAction={
                        <>
                          <IconButton edge="end" size="small" onClick={() => startEdit(entry)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton edge="end" size="small" onClick={() => handleDelete(entry.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      }
                    >
                      <ListItemText
                        primary={entry.id}
                        secondary={
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              flexWrap: 'wrap',
                              mt: 0.5,
                            }}
                          >
                            {(entry.groups || []).map((group) => (
                              <Chip key={group} label={group} size="small" />
                            ))}
                          </Box>
                        }
                        slotProps={{ secondary: { component: 'div' } }}
                      />
                    </ListItem>
                    <Divider component="li" />
                  </Box>
                ))}
              </MuiList>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {translate('resources.policies.groupsDialog.noEntries')}
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {editingId !== null ? (
          <>
            <Button onClick={cancelEdit} disabled={isSaving}>
              {translate('resources.policies.groupsDialog.cancel')}
            </Button>
            <Button onClick={handleSave} variant="contained" disabled={!formBpn.trim() || isSaving}>
              {translate('resources.policies.groupsDialog.save')}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{translate('resources.policies.groupsDialog.close')}</Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
