import { useCallback, useEffect, useState } from 'react'
import { useTranslate } from 'react-admin'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
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
import { apiClientRequest } from '../../services/apiClientService'

interface ApiClient {
  id: string
  name: string
  scopes: string[]
  tokenHint: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

interface ClientForm {
  id?: string
  name: string
  scopes: string[]
  expiresInDays: number
  expiresAt: string
  expiryDisabled: boolean
}

const presets: Record<string, string[]> = {
  discovery: ['federated-catalog:read'],
  consumer: [
    'federated-catalog:read',
    'catalog:read',
    'contract-negotiations:read',
    'contract-negotiations:write',
    'contract-agreements:read',
    'transfers:read',
    'transfers:write',
    'data:proxy',
  ],
  provider: [
    'assets:read',
    'assets:write',
    'policies:read',
    'policies:write',
    'business-partner-groups:read',
    'business-partner-groups:write',
    'contract-definitions:read',
    'contract-definitions:write',
    'contract-negotiations:read',
    'contract-agreements:read',
    'transfers:read',
  ],
}

const emptyForm = (): ClientForm => ({
  name: '',
  scopes: [...presets.discovery],
  expiresInDays: 90,
  expiresAt: '',
  expiryDisabled: false,
})

export const ApiClientsPage = () => {
  const translate = useTranslate()
  const [clients, setClients] = useState<ApiClient[]>([])
  const [scopes, setScopes] = useState<string[]>([])
  const [scopeWarning, setScopeWarning] = useState(false)
  const [form, setForm] = useState<ClientForm>()
  const [token, setToken] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(undefined)
    try {
      const [clientsResponse, scopesResponse, userResponse] = await Promise.all([
        apiClientRequest<{ items: ApiClient[] }>('/api/portal/api-clients'),
        apiClientRequest<{ items: string[] }>('/api/portal/api-client-scopes'),
        apiClientRequest<{ scopeWarning?: boolean }>('/api/portal/userinfo'),
      ])
      setClients(clientsResponse.items)
      setScopes(scopesResponse.items)
      setScopeWarning(Boolean(userResponse.scopeWarning))
    } catch (loadError) {
      setError(message(loadError))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!form) return
    setBusy(true)
    setError(undefined)
    try {
      if (form.id) {
        await apiClientRequest(`/api/portal/api-clients/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            scopes: form.scopes,
            expiresAt: form.expiryDisabled ? null : new Date(form.expiresAt).toISOString(),
          }),
        })
      } else {
        const result = await apiClientRequest<{ token: string }>('/api/portal/api-clients', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            scopes: form.scopes,
            expiresInDays: form.expiryDisabled ? null : form.expiresInDays,
          }),
        })
        setToken(result.token)
      }
      setForm(undefined)
      await load()
    } catch (saveError) {
      setError(message(saveError))
    } finally {
      setBusy(false)
    }
  }

  const rotate = async (client: ApiClient) => {
    if (!window.confirm(translate('portalUx.apiClients.rotateConfirm', { name: client.name }))) return
    try {
      const result = await apiClientRequest<{ token: string }>(`/api/portal/api-clients/${client.id}/rotate`, {
        method: 'POST',
      })
      setToken(result.token)
      await load()
    } catch (rotateError) {
      setError(message(rotateError))
    }
  }

  const revoke = async (client: ApiClient) => {
    if (!window.confirm(translate('portalUx.apiClients.revokeConfirm', { name: client.name }))) return
    try {
      await apiClientRequest(`/api/portal/api-clients/${client.id}`, { method: 'DELETE' })
      await load()
    } catch (revokeError) {
      setError(message(revokeError))
    }
  }

  return (
    <Box>
      <PageHeader
        title={translate('portalUx.apiClients.title')}
        subtitle={translate('portalUx.apiClients.subtitle')}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<DescriptionOutlinedIcon />}
              href="/api/openapi.json"
              target="_blank"
              rel="noreferrer"
            >
              {translate('portalUx.apiClients.openApi')}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm(emptyForm())}>
              {translate('portalUx.apiClients.create')}
            </Button>
          </>
        }
      />
      {scopeWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {translate('portalUx.apiClients.noneWarning')}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{translate('portalUx.apiClients.name')}</TableCell>
              <TableCell>{translate('portalUx.apiClients.token')}</TableCell>
              <TableCell>{translate('portalUx.apiClients.scopes')}</TableCell>
              <TableCell>{translate('portalUx.apiClients.expires')}</TableCell>
              <TableCell align="right" sx={{ width: 1, whiteSpace: 'nowrap' }}>
                {translate('portalUx.apiClients.actions')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id} sx={{ opacity: client.revokedAt ? 0.55 : 1 }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600 }}>{client.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {client.lastUsedAt
                      ? translate('portalUx.apiClients.lastUsed', { date: formatDate(client.lastUsedAt) })
                      : translate('portalUx.apiClients.neverUsed')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <code>{client.tokenHint}</code>
                </TableCell>
                <TableCell>
                  <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                    {client.scopes.map((scope) => (
                      <Chip key={scope} size="small" label={scope} />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  {client.revokedAt
                    ? translate('portalUx.apiClients.revoked')
                    : client.expiresAt
                      ? formatDate(client.expiresAt)
                      : translate('portalUx.apiClients.noExpiry')}
                </TableCell>
                <TableCell align="right" sx={{ width: 1, whiteSpace: 'nowrap' }}>
                  <Button
                    size="small"
                    disabled={Boolean(client.revokedAt)}
                    onClick={() =>
                      setForm({
                        id: client.id,
                        name: client.name,
                        scopes: client.scopes,
                        expiresInDays: 90,
                        expiresAt: client.expiresAt ? client.expiresAt.slice(0, 16) : '',
                        expiryDisabled: !client.expiresAt,
                      })
                    }
                  >
                    {translate('portalUx.common.edit')}
                  </Button>
                  <Button
                    size="small"
                    startIcon={<RefreshIcon />}
                    disabled={Boolean(client.revokedAt)}
                    onClick={() => rotate(client)}
                  >
                    {translate('portalUx.apiClients.rotate')}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={Boolean(client.revokedAt)}
                    onClick={() => revoke(client)}
                  >
                    {translate('portalUx.apiClients.revoke')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(form)} onClose={() => setForm(undefined)} fullWidth maxWidth="md">
        <DialogTitle>
          {form?.id ? translate('portalUx.apiClients.editTitle') : translate('portalUx.apiClients.createTitle')}
        </DialogTitle>
        {form && (
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="normal"
              label={translate('portalUx.apiClients.name')}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            {!form.id && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', my: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2">{translate('portalUx.apiClients.presets')}</Typography>
                {Object.entries(presets).map(([name, values]) => (
                  <Button
                    key={name}
                    size="small"
                    variant="outlined"
                    onClick={() => setForm({ ...form, scopes: values })}
                  >
                    {translate(`portalUx.apiClients.preset.${name}`)}
                  </Button>
                ))}
              </Box>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              {translate('portalUx.apiClients.scopes')}
            </Typography>
            <FormGroup sx={{ display: 'grid', gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))' } }}>
              {scopes.map((scope) => (
                <FormControlLabel
                  key={scope}
                  control={
                    <Checkbox
                      checked={form.scopes.includes(scope)}
                      onChange={(_event, checked) =>
                        setForm({
                          ...form,
                          scopes: checked ? [...form.scopes, scope] : form.scopes.filter((value) => value !== scope),
                        })
                      }
                    />
                  }
                  label={scope}
                />
              ))}
            </FormGroup>
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.expiryDisabled}
                    onChange={(_event, checked) => setForm({ ...form, expiryDisabled: checked })}
                  />
                }
                label={translate('portalUx.apiClients.disableExpiry')}
              />
              {!form.expiryDisabled &&
                (form.id ? (
                  <TextField
                    type="datetime-local"
                    size="small"
                    label={translate('portalUx.apiClients.expires')}
                    value={form.expiresAt}
                    onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                ) : (
                  <TextField
                    type="number"
                    size="small"
                    label={translate('portalUx.apiClients.expiryDays')}
                    value={form.expiresInDays}
                    onChange={(event) => setForm({ ...form, expiresInDays: Number(event.target.value) })}
                    slotProps={{ htmlInput: { min: 1, max: 3650 } }}
                  />
                ))}
            </Box>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(undefined)}>{translate('portalUx.common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={busy || !form?.name.trim() || Boolean(form?.id && !form.expiryDisabled && !form.expiresAt)}
            onClick={save}
          >
            {translate('portalUx.common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(token)} onClose={() => setToken(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{translate('portalUx.apiClients.tokenTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            {translate('portalUx.apiClients.tokenOnce')}
          </Alert>
          <TextField fullWidth value={token ?? ''} slotProps={{ input: { readOnly: true } }} />
        </DialogContent>
        <DialogActions>
          <Button startIcon={<ContentCopyIcon />} onClick={() => token && navigator.clipboard.writeText(token)}>
            {translate('portalUx.apiClients.copy')}
          </Button>
          <Button variant="contained" onClick={() => setToken(undefined)}>
            {translate('portalUx.common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}
