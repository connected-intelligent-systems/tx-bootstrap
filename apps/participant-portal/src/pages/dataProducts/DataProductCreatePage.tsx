import { CreateBase, useNotify, useTranslate, type RaRecord } from 'react-admin'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogTitle, Typography } from '@mui/material'
import { DataProductWizardForm } from './DataProductWizardForm'

export const DataProductCreatePage = () => {
  const translate = useTranslate()
  const navigate = useNavigate()
  const notify = useNotify()
  const close = () => navigate('/data-products')

  return (
    <Dialog
      open
      fullWidth
      maxWidth="lg"
      onClose={close}
      aria-labelledby="create-data-product-title"
      slotProps={{
        paper: {
          sx: {
            height: 'min(860px, calc(100vh - 64px))',
          },
        },
      }}
    >
      <DialogTitle id="create-data-product-title">
        {translate('portalUx.productCreate.title')}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {translate('portalUx.productCreate.subtitle')}
        </Typography>
      </DialogTitle>
      <CreateBase
        resource="assets"
        redirect={false}
        mutationOptions={{
          onSuccess: (record: RaRecord) => {
            notify(translate('portalUx.productCreate.created'), { type: 'success' })
            navigate(`/data-products/${encodeURIComponent(String(record.id))}`)
          },
        }}
      >
        <DataProductWizardForm
          defaultValues={{
            keywords: [],
            dataAddress: {
              type: 'HttpData',
              proxyPath: false,
              proxyQueryParams: false,
              proxyBody: false,
              proxyMethod: false,
            },
          }}
          saveLabel={translate('portalUx.productCreate.save')}
          onCancel={close}
        />
      </CreateBase>
    </Dialog>
  )
}
