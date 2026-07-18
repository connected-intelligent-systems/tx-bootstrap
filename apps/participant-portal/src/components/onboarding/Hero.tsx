import { Box, Stack, Typography } from '@mui/material'
import type { UiCopy } from '../../i18n/onboarding'
import { heroTitle, statusDescription, type PageState } from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, Language } from '../../types/onboarding'
import { StatusChip } from './StatusChip'

export function Hero(props: { language: Language; pageState: PageState; state: GatewayState; t: UiCopy }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', md: 'center' } }}>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
          {props.t.participantAccess}
        </Typography>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, letterSpacing: 0 }}>
          {heroTitle(props.pageState, props.t)}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 690 }}>
          {statusDescription(props.state, props.t)}
        </Typography>
      </Box>
      <StatusChip language={props.language} pageState={props.pageState} state={props.state} />
    </Stack>
  )
}
