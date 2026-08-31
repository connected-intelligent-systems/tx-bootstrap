import { lazy, Suspense, useState } from 'react'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DownloadIcon from '@mui/icons-material/Download'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material'
import { RecordContextProvider, useGetOne, useNotify, useTranslate } from 'react-admin'
import type { Dataset } from '../../types/catalog'
import type { TransferProcess } from '../../types/transferProcess'

const OpenAPIViewer = lazy(() =>
  import('../../components/datasets/OpenAPIViewer').then((module) => ({ default: module.OpenAPIViewer })),
)

interface TransferDataAddress {
  id: string
  endpoint?: string
  authType?: string
  authorization?: string
  [key: string]: unknown
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`

export const buildCurlCommand = (data?: TransferDataAddress) => {
  if (!data?.endpoint) return ''
  const authorization = data.authorization ? ` -H ${shellQuote(`Authorization: ${data.authorization}`)}` : ''
  return `curl --fail-with-body${authorization} ${shellQuote(data.endpoint)}`
}

interface TransferPreview {
  status: number
  contentType: string
  body: string
  truncated: boolean
}

const CopyButton = ({ value, label }: { value?: string; label: string }) => {
  const translate = useTranslate()
  const notify = useNotify()
  if (!value) return null
  return (
    <Tooltip title={translate('portalUx.myData.copyValue', { label })}>
      <IconButton
        aria-label={translate('portalUx.myData.copyValue', { label })}
        onClick={() =>
          void navigator.clipboard
            .writeText(value)
            .then(() => notify(translate('portalUx.myData.valueCopied', { label }), { type: 'info' }))
        }
        edge="end"
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}

export const supportsPullAccess = (transfer: TransferProcess) =>
  transfer.transferDirection.toUpperCase() === 'CONSUMER' && /-pull$/i.test(transfer.transferType || '')

export const supportsHttpDownload = (transfer: TransferProcess, dataset?: Dataset, endpoint?: string) =>
  /httpdata.*-pull$/i.test(transfer.transferType || '') &&
  transfer.transferDirection.toUpperCase() === 'CONSUMER' &&
  Boolean(dataset && !dataset.apiDescription && endpoint)

export const TransferAccessDetailsAction = ({
  transfer,
  dataset,
}: {
  transfer: TransferProcess
  dataset?: Dataset
}) => {
  const translate = useTranslate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'access' | 'openapi'>('access')
  const [showToken, setShowToken] = useState(false)
  const [preview, setPreview] = useState<TransferPreview>()
  const [previewError, setPreviewError] = useState<string>()
  const [previewing, setPreviewing] = useState(false)
  const { data, error, isPending, refetch } = useGetOne<TransferDataAddress>(
    'datarequests',
    { id: transfer.id },
    { enabled: open },
  )

  if (!supportsPullAccess(transfer)) return null

  const supportsOpenApi =
    /httpdata.*-pull$/i.test(transfer.transferType || '') && Boolean(dataset?.apiDescription && data?.endpoint)
  const supportsHttpPreview = /httpdata.*-pull$/i.test(transfer.transferType || '') && Boolean(data?.endpoint)
  const supportsDownload = supportsHttpDownload(transfer, dataset, data?.endpoint)
  const curlCommand = buildCurlCommand(data)
  const downloadUrl = `/api/portal/transfers/${encodeURIComponent(transfer.id)}/download`

  const loadPreview = async () => {
    setPreviewing(true)
    setPreview(undefined)
    setPreviewError(undefined)
    try {
      const response = await fetch(`/api/portal/transfers/${encodeURIComponent(transfer.id)}/preview`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
      setPreview(payload)
    } catch (reason) {
      setPreviewError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPreviewing(false)
    }
  }

  const close = () => {
    setOpen(false)
    setTab('access')
    setShowToken(false)
    setPreview(undefined)
    setPreviewError(undefined)
  }

  return (
    <>
      <Tooltip title={translate('portalUx.myData.accessDetails')}>
        <IconButton size="small" aria-label={translate('portalUx.myData.accessDetails')} onClick={() => setOpen(true)}>
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={close} fullWidth maxWidth="lg" aria-labelledby="transfer-access-details-title">
        <DialogTitle id="transfer-access-details-title">
          {translate('portalUx.myData.pullAccess', {
            type: transfer.transferType || translate('portalUx.myData.pull'),
          })}
        </DialogTitle>
        <Tabs
          value={tab}
          onChange={(_, value: 'access' | 'openapi') => setTab(value)}
          sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="access" label={translate('portalUx.myData.accessDetails')} />
          {supportsOpenApi && <Tab value="openapi" label={translate('portalUx.myData.openapi')} />}
        </Tabs>
        <DialogContent dividers sx={{ minHeight: 360 }}>
          {tab === 'access' && (
            <>
              {isPending && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress />
                </Box>
              )}
              {error && (
                <Alert
                  severity="warning"
                  action={
                    <Button color="inherit" size="small" onClick={() => void refetch()}>
                      {translate('portalUx.common.retry')}
                    </Button>
                  }
                >
                  {translate('portalUx.myData.accessDetailsUnavailable')}
                </Alert>
              )}
              {data && (
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <TextField
                    label={translate('portalUx.myData.endpoint')}
                    value={data.endpoint || ''}
                    placeholder="-"
                    fullWidth
                    slotProps={{
                      input: {
                        readOnly: true,
                        endAdornment: (
                          <CopyButton value={data.endpoint} label={translate('portalUx.myData.endpoint')} />
                        ),
                      },
                    }}
                  />
                  {supportsHttpPreview && (
                    <Box sx={{ display: 'grid', gap: 2 }}>
                      <TextField
                        label={translate('portalUx.myData.curlCommand')}
                        value={curlCommand}
                        fullWidth
                        multiline
                        minRows={2}
                        slotProps={{
                          input: {
                            readOnly: true,
                            endAdornment: (
                              <CopyButton value={curlCommand} label={translate('portalUx.myData.curlCommand')} />
                            ),
                          },
                        }}
                      />
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Button
                          variant="contained"
                          startIcon={previewing ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                          disabled={previewing}
                          onClick={() => void loadPreview()}
                        >
                          {translate('portalUx.myData.previewData')}
                        </Button>
                        {supportsDownload && (
                          <Button
                            component="a"
                            href={downloadUrl}
                            download
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                          >
                            {translate('portalUx.myData.downloadData')}
                          </Button>
                        )}
                      </Box>
                      {previewError && <Alert severity="warning">{previewError}</Alert>}
                      {preview && (
                        <Box>
                          <Alert
                            severity={preview.status >= 200 && preview.status < 300 ? 'success' : 'warning'}
                            sx={{ mb: 1 }}
                          >
                            {translate('portalUx.myData.previewStatus', {
                              status: preview.status,
                              contentType: preview.contentType,
                            })}
                            {preview.truncated ? ` · ${translate('portalUx.myData.previewTruncated')}` : ''}
                          </Alert>
                          <TextField
                            label={translate('portalUx.myData.responsePreview')}
                            value={preview.body}
                            fullWidth
                            multiline
                            minRows={6}
                            maxRows={18}
                            slotProps={{ input: { readOnly: true } }}
                          />
                        </Box>
                      )}
                    </Box>
                  )}
                  <TextField
                    label={translate('portalUx.myData.authenticationType')}
                    value={data.authType || '-'}
                    fullWidth
                    slotProps={{ input: { readOnly: true } }}
                  />
                  <TextField
                    label={translate('portalUx.myData.authorizationToken')}
                    value={data.authorization || ''}
                    placeholder="-"
                    type={showToken ? 'text' : 'password'}
                    fullWidth
                    slotProps={{
                      input: {
                        readOnly: true,
                        endAdornment: (
                          <InputAdornment position="end">
                            {data.authorization && (
                              <Tooltip
                                title={translate(showToken ? 'portalUx.myData.hideToken' : 'portalUx.myData.showToken')}
                              >
                                <IconButton
                                  aria-label={translate(
                                    showToken ? 'portalUx.myData.hideToken' : 'portalUx.myData.showToken',
                                  )}
                                  onClick={() => setShowToken((value) => !value)}
                                  edge="end"
                                >
                                  {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                </IconButton>
                              </Tooltip>
                            )}
                            <CopyButton
                              value={data.authorization}
                              label={translate('portalUx.myData.authorizationToken')}
                            />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
              )}
            </>
          )}
          {tab === 'openapi' && dataset && (
            <RecordContextProvider value={dataset}>
              <Suspense
                fallback={
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                  </Box>
                }
              >
                <OpenAPIViewer authToken={data?.authorization} endpoint={data?.endpoint} />
              </Suspense>
            </RecordContextProvider>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{translate('portalUx.common.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
