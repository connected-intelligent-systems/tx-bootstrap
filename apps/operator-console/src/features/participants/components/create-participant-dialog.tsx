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
import type { ParticipantCreateInput, ParticipantOrganization } from "../types";
import { ErrorAlert, FieldGrid } from "./participant-ui";

const emptyOrganizationDraft: ParticipantOrganization = {
  legalName: "",
  legalForm: "",
  registeredAddress: "",
  country: "",
  taxId: "",
  commercialRegisterNumber: "",
  website: "",
  contactEmail: "",
};

const emptyCreateDraft: ParticipantCreateInput = {
  ...emptyOrganizationDraft,
  bpn: "",
  verificationNotes: "",
};

const bpnFormat = /^BPN[LSA][A-Z0-9]{12}$/;

export function CreateParticipantDialog({
  error,
  open,
  saving,
  onClose,
  onCreate,
}: {
  error?: unknown;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (body: ParticipantCreateInput) => void;
}) {
  const [draft, setDraft] = useState<ParticipantCreateInput>(emptyCreateDraft);

  function update(field: keyof ParticipantCreateInput, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>New participant</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? (
            <ErrorAlert title="Could not create participant" error={error} />
          ) : null}
          <FieldGrid>
            <TextField
              label="Legal name"
              value={draft.legalName}
              onChange={(event) => update("legalName", event.target.value)}
              required
              helperText="Official registered company name"
            />
            <TextField
              label="Contact email"
              value={draft.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
              required
              helperText="Primary contact for onboarding notifications"
            />
            <TextField
              label="Business Partner Number"
              value={draft.bpn ?? ""}
              onChange={(event) =>
                update("bpn", event.target.value.toUpperCase())
              }
              error={Boolean(draft.bpn && !bpnFormat.test(draft.bpn))}
              helperText={
                draft.bpn
                  ? "Use an existing BPN in BPNL, BPNS, or BPNA format."
                  : "Leave empty to generate a local BPN when the participant is created."
              }
            />
            <TextField
              label="Country"
              value={draft.country}
              onChange={(event) => update("country", event.target.value)}
              helperText="Country of registration (e.g., DE, FR, US)"
            />
            <TextField
              label="Legal form"
              value={draft.legalForm}
              onChange={(event) => update("legalForm", event.target.value)}
              helperText="Legal entity type (e.g., GmbH, Ltd, Inc)"
            />
            <TextField
              label="Website"
              value={draft.website}
              onChange={(event) => update("website", event.target.value)}
              helperText="Company website URL"
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
            helperText="Full legal address as registered with authorities"
          />
          <TextField
            label="Initial notes"
            value={draft.verificationNotes}
            onChange={(event) =>
              update("verificationNotes", event.target.value)
            }
            multiline
            minRows={2}
            helperText="Optional internal notes about the participant or BPN"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => onCreate(draft)}
          disabled={
            saving ||
            !draft.legalName ||
            !draft.contactEmail ||
            Boolean(draft.bpn && !bpnFormat.test(draft.bpn))
          }
        >
          Create participant
        </Button>
      </DialogActions>
    </Dialog>
  );
}
