import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, Container, CssBaseline, Paper, Stack, Typography } from '@mui/material'
import { alpha, ThemeProvider } from '@mui/material/styles'
import { api } from '../../utils/onboarding-api'
import { GatewayContent } from '../../components/onboarding/GatewayContent'
import { TopBar } from '../../components/onboarding/TopBar'
import { copy } from '../../i18n/onboarding'
import {
  buildAttachPayload,
  buildDiagnostics,
  friendlyErrorMessage,
  isApproved,
  type InviteInput,
  type Message,
} from '../../utils/onboarding-lib/onboarding-view'
import { initialLanguage, initialThemeMode, persistLanguage, persistThemeMode } from '../../utils/onboarding-storage'
import { createGatewayTheme } from '../../utils/onboarding-theme'
import type { GatewayState, Language, ThemeMode } from '../../types/onboarding'

const portalConfig = window.config ?? {}

type OnboardingFlowProps = {
  initialState?: GatewayState
  onComplete: () => void
}

export function OnboardingFlow({ initialState, onComplete }: OnboardingFlowProps) {
  const [state, setState] = useState<GatewayState | null>(initialState ?? null)
  const [busy, setBusy] = useState<string>('')
  const [language, setLanguage] = useState<Language>(() => initialLanguage())
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => initialThemeMode())
  const [message, setMessage] = useState<Message | null>(null)
  const refreshInFlight = useRef(false)
  const completionScheduled = useRef(false)
  const t = copy[language]
  const { theme, logo } = useMemo(() => createGatewayTheme(themeMode), [themeMode])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    persistThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.lang = language
    persistLanguage(language)
  }, [language])

  const refreshState = useCallback(
    async (showMessage = true) => {
      if (refreshInFlight.current) return
      refreshInFlight.current = true
      setBusy((current) => current || 'state')
      try {
        const next = await api<GatewayState>('/api/onboarding/state')
        setState(next)
        if (showMessage) {
          setMessage({
            tone: next.onboarded ? 'ok' : 'info',
            text: next.onboarded ? t.portalOpening : t.statusRefreshed,
          })
        }
        if (next.onboarded && !completionScheduled.current) {
          completionScheduled.current = true
          window.setTimeout(() => onComplete(), 600)
        }
      } catch (error) {
        setMessage({ tone: 'error', text: friendlyErrorMessage(error, t) })
      } finally {
        refreshInFlight.current = false
        setBusy((current) => (current === 'state' ? '' : current))
      }
    },
    [t, onComplete],
  )

  useEffect(() => {
    if (!initialState) refreshState(false)
    const interval = window.setInterval(() => {
      if (!document.hidden) refreshState(false)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [initialState, refreshState])

  async function attachInvite(input: InviteInput) {
    setBusy('attach')
    setMessage(null)
    try {
      const body = buildAttachPayload(input, t)
      const next = await api<GatewayState>('/api/onboarding/attach', { method: 'POST', body })
      setState(next)
      setMessage({ tone: 'ok', text: t.inviteAttached })
      await refreshState(false)
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyErrorMessage(error, t) })
    } finally {
      setBusy('')
    }
  }

  async function retryCredentialSetup() {
    setBusy('credentials')
    setMessage(null)
    try {
      const next = await api<GatewayState>('/api/onboarding/credentials/request', { method: 'POST' })
      setState(next)
      setMessage({ tone: 'ok', text: t.credentialSetupRetried })
      await refreshState(false)
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyErrorMessage(error, t) })
    } finally {
      setBusy('')
    }
  }

  async function copyDiagnostics() {
    if (!state) return
    try {
      await navigator.clipboard.writeText(buildDiagnostics(state))
      setMessage({ tone: 'ok', text: t.diagnosticsCopied })
    } catch {
      setMessage({ tone: 'error', text: t.copyDiagnosticsFailed })
    }
  }

  const isBusy = Boolean(busy)

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={(muiTheme) => ({
          minHeight: '100vh',
          bgcolor: 'background.default',
          backgroundImage:
            'linear-gradient(90deg, ' + alpha(muiTheme.palette.primary.main, 0.07) + ', transparent 42%)',
        })}
      >
        <TopBar
          language={language}
          logo={logo}
          themeMode={themeMode}
          title={portalConfig.participantPortalName || portalConfig.title || t.portal}
          onLanguageChange={setLanguage}
          onRefresh={() => refreshState()}
          onToggleTheme={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          refreshLabel={t.refresh}
          themeLabel={t.toggleTheme}
          portalLogoLabel={t.portalLogo}
          disabled={isBusy}
        />

        {!state ? (
          <Container maxWidth="lg" sx={{ py: 3 }}>
            <Paper elevation={1} sx={{ p: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <CircularProgress size={20} />
                <Typography>{t.loading}</Typography>
              </Stack>
            </Paper>
          </Container>
        ) : (
          <GatewayContent
            canRetryCredentials={Boolean(state.caseId && isApproved(state) && !state.onboarded && state.lastError)}
            isBusy={isBusy}
            language={language}
            message={message}
            state={state}
            t={t}
            onAttachInvite={attachInvite}
            onCopyDiagnostics={copyDiagnostics}
            onRefresh={() => refreshState()}
            onRetryCredentialSetup={retryCredentialSetup}
          />
        )}
      </Box>
    </ThemeProvider>
  )
}
