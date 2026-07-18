import { useState, type FormEvent } from 'react'
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import type { UiCopy } from '../../i18n/onboarding'
import type { InviteInput } from '../../utils/onboarding-lib/onboarding-view'

export function AttachInvitePanel(props: { isBusy: boolean; t: UiCopy; onAttach: (input: InviteInput) => void }) {
  const [registrationToken, setRegistrationToken] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    props.onAttach({ registrationToken })
  }

  return (
    <Paper component="form" variant="outlined" onSubmit={handleSubmit} sx={{ p: 1.5 }}>
      <Stack spacing={1.4}>
        <Box>
          <Typography sx={{ fontWeight: 800 }}>{props.t.attachInvite}</Typography>
          <Typography variant="body2" color="text.secondary">
            {props.t.attachInviteDescription}
          </Typography>
        </Box>
        <TextField
          label={props.t.attachInviteToken}
          value={registrationToken}
          onChange={(event) => setRegistrationToken(event.target.value)}
          helperText={props.t.attachInviteTokenHelp}
          minRows={3}
          multiline
          fullWidth
        />
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Button type="submit" variant="contained" disabled={props.isBusy}>
            {props.t.attachInviteAction}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}
