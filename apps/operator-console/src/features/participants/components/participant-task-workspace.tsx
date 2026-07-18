import { useState } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ReplayIcon from "@mui/icons-material/Replay";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  isConnectorSetupApprovable,
  type ParticipantTask,
} from "../participant-tasks";
import type { Participant, TechnicalMetadataUpdate } from "../types";
import {
  ErrorAlert,
  FieldGrid,
  Info,
  SetupChecks,
  StageChip,
} from "./participant-ui";

export function ParticipantTaskWorkspace({
  busy,
  participant,
  task,
  onBack,
  onRetry,
  onSaveTechnical,
  onTaskResult,
}: {
  busy: boolean;
  participant: Participant;
  task: ParticipantTask;
  onBack: () => void;
  onRetry: () => Promise<Participant>;
  onSaveTechnical: (body: TechnicalMetadataUpdate) => Promise<Participant>;
  onTaskResult: (participant: Participant) => void;
}) {
  const [actionError, setActionError] = useState<unknown>();

  async function resolveTask(action: () => Promise<Participant>) {
    setActionError(undefined);
    try {
      onTaskResult(await action());
    } catch (error) {
      setActionError(error);
    }
  }

  async function saveTechnical(body: TechnicalMetadataUpdate) {
    setActionError(undefined);
    try {
      onTaskResult(await onSaveTechnical(body));
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Button
        color="inherit"
        startIcon={<ArrowBackIcon />}
        onClick={onBack}
        sx={{ alignSelf: "flex-start" }}
      >
        Back to work queue
      </Button>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" } }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">
            Operator task
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 850 }}>
            {task.title}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            {task.description}
          </Typography>
        </Box>
        <StageChip stage={participant.stage} />
      </Stack>

      {actionError ? (
        <ErrorAlert title="Could not complete the task" error={actionError} />
      ) : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 2fr) minmax(280px, 1fr)",
          },
          alignItems: "start",
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          {task.taskKind ? (
            <ConnectorTask
              key={`${participant.id}-${participant.updatedAt}-${task.taskKind}`}
              busy={busy}
              participant={participant}
              task={task}
              onPrimaryAction={() => resolveTask(onRetry)}
              onSave={saveTechnical}
            />
          ) : (
            <Alert severity="info">
              This participant no longer has an executable operator task.
            </Alert>
          )}
        </Paper>

        <ParticipantContext participant={participant} />
      </Box>
    </Stack>
  );
}

function ConnectorTask({
  busy,
  participant,
  task,
  onPrimaryAction,
  onSave,
}: {
  busy: boolean;
  participant: Participant;
  task: ParticipantTask;
  onPrimaryAction: () => void;
  onSave: (body: TechnicalMetadataUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TechnicalMetadataUpdate>({
    did: participant.technical.did,
    dspEndpoint: participant.technical.dspEndpoint,
    identityHubCredentialServiceEndpoint:
      participant.technical.credentialServiceEndpoint,
  });

  const canRun = isConnectorSetupApprovable(participant, draft);
  const hasUnsavedChanges =
    draft.did !== participant.technical.did ||
    draft.dspEndpoint !== participant.technical.dspEndpoint ||
    draft.identityHubCredentialServiceEndpoint !==
      participant.technical.credentialServiceEndpoint;

  function update(field: keyof TechnicalMetadataUpdate, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 850 }}>
          Connector configuration
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Save corrected endpoints to restart setup automatically, or retry the
          existing metadata unchanged.
        </Typography>
      </Box>

      <FieldGrid>
        <TextField
          label="DID"
          value={draft.did}
          onChange={(event) => update("did", event.target.value)}
        />
        <TextField
          label="DSP endpoint"
          value={draft.dspEndpoint}
          onChange={(event) => update("dspEndpoint", event.target.value)}
        />
      </FieldGrid>
      <TextField
        label="Credential service endpoint"
        value={draft.identityHubCredentialServiceEndpoint}
        onChange={(event) =>
          update("identityHubCredentialServiceEndpoint", event.target.value)
        }
      />
      <Button
        variant="outlined"
        startIcon={<SaveIcon />}
        onClick={() => onSave(draft)}
        disabled={busy || !canRun || !hasUnsavedChanges}
        sx={{ alignSelf: "flex-start" }}
      >
        Save metadata
      </Button>

      <Divider />
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Setup checks
        </Typography>
        <SetupChecks checks={participant.technical.setupChecks} />
      </Stack>

      <Divider />
      <Alert severity="error">
        <AlertTitle>Setup needs another attempt</AlertTitle>
        {task.description}
      </Alert>
      <Stack spacing={0.75} sx={{ alignItems: "flex-start" }}>
        <Button
          variant="contained"
          color="error"
          startIcon={<ReplayIcon />}
          onClick={onPrimaryAction}
          disabled={busy || !canRun || hasUnsavedChanges}
        >
          Retry automatic setup
        </Button>
        {hasUnsavedChanges ? (
          <Typography variant="caption" color="text.secondary">
            Save connector metadata changes before running setup.
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  );
}

function ParticipantContext({ participant }: { participant: Participant }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Participant context
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 850 }}>
            {participant.organization.legalName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
          >
            {participant.id}
          </Typography>
        </Box>
        <Divider />
        <Stack spacing={1.5}>
          <Info label="Contact" value={participant.organization.contactEmail} />
          <Info label="Country" value={participant.organization.country} />
          <Info
            label="Requested BPN"
            value={participant.bpn.requestedBpn || "Not provided"}
            mono
          />
          <Info
            label="Assigned BPN"
            value={participant.bpn.assignedBpn || "Not assigned"}
            mono
          />
        </Stack>
      </Stack>
    </Paper>
  );
}
