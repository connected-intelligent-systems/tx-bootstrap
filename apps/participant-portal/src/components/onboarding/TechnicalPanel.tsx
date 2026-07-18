import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { displayState, formatTimestamp, type UiCopy } from '../../i18n/onboarding'
import { buildParticipantDetails } from '../../utils/onboarding-lib/onboarding-view'
import type { GatewayState, Language } from '../../types/onboarding'
import { Info, InfoGrid } from './Info'

export function TechnicalPanel(props: {
  caseData: GatewayState['case']
  language: Language
  state: GatewayState
  t: UiCopy
  onCopyDiagnostics: () => void
}) {
  const details = buildParticipantDetails(props.state)
  return (
    <Accordion component={Paper} elevation={1} disableGutters sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography color="primary" sx={{ fontWeight: 800 }}>
          {props.t.technicalDetails}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.6}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" color="inherit" startIcon={<ContentCopyIcon />} onClick={props.onCopyDiagnostics}>
              {props.t.copyDiagnostics}
            </Button>
          </Box>
          <InfoGrid>
            <Info label={props.t.case} value={props.state.caseId || props.t.noCase} mono />
            <Info label={props.t.operatorState} value={displayState(props.state.state, props.language)} />
            <Info label={props.t.credentialRecords} value={String(props.state.credentials.length)} />
            <Info label={props.t.updated} value={formatTimestamp(props.state.updatedAt, props.language)} />
            <Info label={props.t.did} value={details.did} mono />
            <Info label={props.t.dspEndpoint} value={details.dspEndpoint} />
            <Info label={props.t.credentialService} value={details.identityHubCredentialServiceEndpoint} />
          </InfoGrid>

          {(props.caseData?.setupChecks || []).length > 0 && (
            <Stack divider={<Divider />} spacing={1}>
              {(props.caseData?.setupChecks || []).map((check) => (
                <Box key={check.name}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Typography>{check.name}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{displayState(check.status, props.language)}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {check.message}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}

          {props.state.credentials.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{props.t.type}</TableCell>
                  <TableCell>{props.t.issuer}</TableCell>
                  <TableCell>{props.t.operatorState}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {props.state.credentials.map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell>{credential.type}</TableCell>
                    <TableCell>{credential.issuer || '-'}</TableCell>
                    <TableCell>{displayState(credential.state || '-', props.language)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
