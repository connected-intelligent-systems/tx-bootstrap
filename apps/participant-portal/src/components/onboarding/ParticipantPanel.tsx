import { Alert, Box, Button, Divider, Paper, Stack, Typography } from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { UiCopy } from '../../i18n/onboarding'
import type { InviteInput, PageState } from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, ParticipantDetails } from '../../types/onboarding'
import { AttachInvitePanel } from './AttachInvitePanel'
import { Info, InfoGrid } from './Info'

export function ParticipantPanel(props: {
  canRetryCredentials: boolean
  details: ParticipantDetails
  isBusy: boolean
  pageState: PageState
  state: GatewayState
  t: UiCopy
  onAttachInvite: (input: InviteInput) => void
  onRefresh: () => void
  onRetryCredentialSetup: () => void
}) {
  const missingInvite = props.pageState === 'needsInvite'
  const inviteSummary = props.state.caseId
    ? props.t.preregistrationAttached
    : props.state.attachMode
      ? props.t.preregistrationAttaching
      : props.t.preregistrationMissingDetail

  return (
    <Paper component="section" elevation={1} sx={{ p: 2 }}>
      <Stack spacing={1.6}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {window.config?.participantPortalName || props.t.portal}
          </Typography>
          <Typography color="text.secondary">{props.t.registrationIntro}</Typography>
        </Box>

        <Alert severity={missingInvite ? 'warning' : 'info'} variant="outlined">
          <Typography sx={{ fontWeight: 800 }}>
            {missingInvite ? props.t.preregistrationMissing : props.t.operatorInvite}
          </Typography>
          <Typography variant="body2">
            {missingInvite ? props.t.preregistrationMissingDetail : inviteSummary}
          </Typography>
        </Alert>

        {!props.state.caseId && <AttachInvitePanel isBusy={props.isBusy} t={props.t} onAttach={props.onAttachInvite} />}

        <InfoGrid>
          <Info label={props.t.organization} value={props.details.organizationName} />
          <Info label={props.t.contactEmail} value={props.details.contactEmail} />
          <Info label={props.t.requestedBpn} value={props.details.requestedBpn} mono />
          <Info label={props.t.requestedRole} value={props.details.requestedRole} />
        </InfoGrid>

        <Divider />

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800, mb: 1 }}>
            {props.t.automation}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button startIcon={<RefreshIcon />} onClick={props.onRefresh} disabled={props.isBusy}>
              {props.state.caseId ? props.t.checkNow : props.t.refreshStatus}
            </Button>
            {props.canRetryCredentials && (
              <Button color="inherit" onClick={props.onRetryCredentialSetup} disabled={props.isBusy}>
                {props.t.retryCredentialSetup}
              </Button>
            )}
            {props.state.onboarded && (
              <Button href="/" startIcon={<LoginIcon />} variant="contained">
                {props.t.openPortal}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  )
}
