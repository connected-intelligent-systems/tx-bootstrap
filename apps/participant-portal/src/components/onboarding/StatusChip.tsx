import { Chip } from '@mui/material'
import { displayState } from '../../i18n/onboarding'
import type { PageState } from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, Language } from '../../types/onboarding'

export function StatusChip(props: { state: GatewayState; pageState: PageState; language: Language }) {
  const color =
    props.pageState === 'ready'
      ? 'success'
      : props.pageState === 'failed'
        ? 'error'
        : props.pageState === 'needsInvite'
          ? 'warning'
          : 'info'
  return (
    <Chip
      color={color}
      variant="outlined"
      label={displayState(props.state.onboarded ? 'ONBOARDED' : props.state.state || 'NOT_STARTED', props.language)}
      sx={{ minWidth: 150, fontWeight: 800 }}
    />
  )
}
