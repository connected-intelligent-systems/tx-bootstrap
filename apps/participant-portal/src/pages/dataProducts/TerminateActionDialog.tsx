import { useState } from 'react'
import { useTranslate } from 'react-admin'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material'

type TerminateActionDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export const TerminateActionDialog = ({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: TerminateActionDialogProps) => {
  const translate = useTranslate()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleClose = () => {
    if (saving) return
    setReason('')
    onClose()
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(reason)
      setReason('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>
        <TextField
          label={translate('portalUx.product.reason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          {translate('portalUx.common.cancel')}
        </Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={saving}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
