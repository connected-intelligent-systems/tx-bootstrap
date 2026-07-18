import { Chip, Divider, Paper, Stack, Step, StepContent, StepLabel, Stepper, Typography } from '@mui/material'
import { displayState, formatTimestamp, type UiCopy } from '../../i18n/onboarding'
import { activeStepIndex } from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, Language, SetupStep } from '../../types/onboarding'
import { Info } from './Info'

export function ProgressPanel(props: {
  caseData: GatewayState['case']
  language: Language
  state: GatewayState
  steps: SetupStep[]
  t: UiCopy
}) {
  return (
    <Paper id="status" component="aside" elevation={1} sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {props.t.setupProgress}
        </Typography>
        <Stepper orientation="vertical" activeStep={activeStepIndex(props.steps)}>
          {props.steps.map((step) => (
            <Step key={step.label} expanded completed={step.state === 'done'} active={step.state === 'active'}>
              <StepLabel optional={<Chip size="small" label={step.owner} variant="outlined" sx={{ mt: 0.5 }} />}>
                <Typography sx={{ fontWeight: 800 }}>{step.label}</Typography>
              </StepLabel>
              <StepContent>
                <Stack spacing={0.6} sx={{ pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {step.detail}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                    {props.t.nextAction}: {step.nextAction}
                  </Typography>
                </Stack>
              </StepContent>
            </Step>
          ))}
        </Stepper>
        <Divider />
        <Info
          label={props.t.operatorState}
          value={displayState(props.caseData?.state || props.state.state, props.language)}
        />
        <Info
          label={props.t.assignedBpn}
          value={props.caseData?.assignedBpn || props.caseData?.bpn || props.t.pending}
          mono
        />
        <Info label={props.t.updated} value={formatTimestamp(props.state.updatedAt, props.language)} />
      </Stack>
    </Paper>
  )
}
