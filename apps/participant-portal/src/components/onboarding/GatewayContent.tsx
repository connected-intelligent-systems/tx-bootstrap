import { Alert, Box, Container, Stack } from '@mui/material'
import type { UiCopy } from '../../i18n/onboarding'
import {
  buildParticipantDetails,
  buildSetupSteps,
  derivePageState,
  friendlyErrorMessage,
  messageSeverity,
  type InviteInput,
  type Message,
} from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, Language } from '../../types/onboarding'
import { Hero } from './Hero'
import { ParticipantPanel } from './ParticipantPanel'
import { ProgressPanel } from './ProgressPanel'
import { TechnicalPanel } from './TechnicalPanel'

export function GatewayContent(props: {
  canRetryCredentials: boolean
  isBusy: boolean
  language: Language
  message: Message | null
  state: GatewayState
  t: UiCopy
  onAttachInvite: (input: InviteInput) => void
  onCopyDiagnostics: () => void
  onRefresh: () => void
  onRetryCredentialSetup: () => void
}) {
  const pageState = derivePageState(props.state)
  const caseData = props.state.case
  const details = buildParticipantDetails(props.state)
  const setupSteps = buildSetupSteps(props.state, props.t)

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.4}>
        <Hero language={props.language} pageState={pageState} state={props.state} t={props.t} />

        {props.message && <Alert severity={messageSeverity(props.message.tone)}>{props.message.text}</Alert>}
        {props.state.lastError && (
          <Alert severity="error">{friendlyErrorMessage(props.state.lastError, props.t)}</Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.55fr) minmax(320px, 0.9fr)' },
            gap: 1.6,
            alignItems: 'start',
          }}
        >
          <ParticipantPanel
            canRetryCredentials={props.canRetryCredentials}
            details={details}
            isBusy={props.isBusy}
            pageState={pageState}
            state={props.state}
            t={props.t}
            onAttachInvite={props.onAttachInvite}
            onRefresh={props.onRefresh}
            onRetryCredentialSetup={props.onRetryCredentialSetup}
          />
          <ProgressPanel
            caseData={caseData}
            language={props.language}
            state={props.state}
            steps={setupSteps}
            t={props.t}
          />
        </Box>

        <TechnicalPanel
          caseData={caseData}
          language={props.language}
          state={props.state}
          t={props.t}
          onCopyDiagnostics={props.onCopyDiagnostics}
        />
      </Stack>
    </Container>
  )
}
