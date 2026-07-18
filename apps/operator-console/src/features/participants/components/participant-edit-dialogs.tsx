import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type {
  Participant,
  ParticipantOrganization,
  ParticipantOrganizationUpdate,
  TechnicalMetadataUpdate,
} from "../types";
import { ErrorAlert, FieldGrid } from "./participant-ui";

export function OrganizationEditDialog({
  participant,
  saving,
  onClose,
  onSave,
}: {
  participant: Participant;
  saving: boolean;
  onClose: () => void;
  onSave: (body: ParticipantOrganizationUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ParticipantOrganization>({
    ...participant.organization,
  });
  const [error, setError] = useState<unknown>();

  function update(field: keyof ParticipantOrganization, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setError(undefined);
    try {
      await onSave(draft);
      onClose();
    } catch (saveError) {
      setError(saveError);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit organization information</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? (
            <ErrorAlert title="Could not update organization" error={error} />
          ) : null}
          <FieldGrid>
            <TextField
              label="Legal name"
              value={draft.legalName}
              onChange={(event) => update("legalName", event.target.value)}
              required
            />
            <TextField
              label="Contact email"
              value={draft.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
              required
            />
            <TextField
              label="Legal form"
              value={draft.legalForm}
              onChange={(event) => update("legalForm", event.target.value)}
            />
            <TextField
              label="Country"
              value={draft.country}
              onChange={(event) => update("country", event.target.value)}
            />
            <TextField
              label="Tax ID"
              value={draft.taxId}
              onChange={(event) => update("taxId", event.target.value)}
            />
            <TextField
              label="Register number"
              value={draft.commercialRegisterNumber}
              onChange={(event) =>
                update("commercialRegisterNumber", event.target.value)
              }
            />
            <TextField
              label="Website"
              value={draft.website}
              onChange={(event) => update("website", event.target.value)}
            />
          </FieldGrid>
          <TextField
            label="Registered address"
            value={draft.registeredAddress}
            onChange={(event) =>
              update("registeredAddress", event.target.value)
            }
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !draft.legalName || !draft.contactEmail}
        >
          Save organization
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ConnectorMetadataEditDialog({
  participant,
  saving,
  onClose,
  onSave,
}: {
  participant: Participant;
  saving: boolean;
  onClose: () => void;
  onSave: (body: TechnicalMetadataUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TechnicalMetadataUpdate>({
    did: participant.technical.did,
    dspEndpoint: participant.technical.dspEndpoint,
    identityHubCredentialServiceEndpoint:
      participant.technical.credentialServiceEndpoint,
  });
  const [error, setError] = useState<unknown>();

  function update(field: keyof TechnicalMetadataUpdate, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setError(undefined);
    try {
      await onSave(draft);
      onClose();
    } catch (saveError) {
      setError(saveError);
    }
  }

  const isComplete = Boolean(
    draft.did &&
    draft.dspEndpoint &&
    draft.identityHubCredentialServiceEndpoint,
  );

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit connector metadata</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? (
            <ErrorAlert title="Could not update connector" error={error} />
          ) : null}
          <FieldGrid>
            <TextField
              label="DID"
              value={draft.did}
              onChange={(event) => update("did", event.target.value)}
              required
            />
            <TextField
              label="DSP endpoint"
              value={draft.dspEndpoint}
              onChange={(event) => update("dspEndpoint", event.target.value)}
              required
            />
          </FieldGrid>
          <TextField
            label="Credential service endpoint"
            value={draft.identityHubCredentialServiceEndpoint}
            onChange={(event) =>
              update("identityHubCredentialServiceEndpoint", event.target.value)
            }
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !isComplete}
        >
          Save metadata
        </Button>
      </DialogActions>
    </Dialog>
  );
}
