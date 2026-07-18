import { EditBase, useNotify, useTranslate } from 'react-admin'
import { Dialog, DialogTitle } from '@mui/material'
import type { Asset } from '../../types/asset'
import { DataProductWizardForm } from './DataProductWizardForm'

type DataProductEditDialogProps = {
  asset: Asset
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const DataProductEditDialog = ({ asset, open, onClose, onSuccess }: DataProductEditDialogProps) => {
  const translate = useTranslate()
  const notify = useNotify()

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="lg"
      onClose={onClose}
      aria-labelledby="edit-data-product-title"
      slotProps={{
        paper: {
          sx: {
            height: 'min(860px, calc(100vh - 64px))',
          },
        },
      }}
    >
      <DialogTitle id="edit-data-product-title">
        {translate('portalUx.product.editTitle', { name: asset.title || asset.id })}
      </DialogTitle>
      {open && (
        <EditBase<Asset>
          resource="assets"
          id={asset.id}
          redirect={false}
          mutationMode="pessimistic"
          transform={(data) => ({
            ...data,
            // The form edits the current localized values. Clear stale variants so
            // the serializer does not prefer them over title and abstract.
            titles: undefined,
            abstracts: undefined,
          })}
          mutationOptions={{
            onSuccess: () => {
              notify(translate('portalUx.product.updated'), { type: 'success' })
              onSuccess?.()
              onClose()
            },
          }}
        >
          <DataProductWizardForm saveLabel={translate('portalUx.common.save')} onCancel={onClose} />
        </EditBase>
      )}
    </Dialog>
  )
}
