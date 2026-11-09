import { useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Participant, RevokeInput } from "../types";
import { formatDate } from "./participant-formatters";
import { ErrorAlert } from "./participant-ui";

const checkLabels: Record<string, string> = {
  "issuer-holder-block": "Block new credentials at the issuer",
  "issuer-credential-revocation": "Revoke issued credentials",
  "bdrs-removal": "Remove from the BPN directory (BDRS)",
  "tunnel-revocation": "Revoke tunnel keys",
  readmission: "Readmission",
};

const statusLabels: Record<string, string> = {
  ok: "Done",
  skipped: "Not applicable",
  pending: "In progress",
  failed: "Failed",
};

const modes = {
  revoke: {
    title: "Revoke",
    severity: "warning",
    notice: "Removes the participant from the dataspace",
    body: "The participant can no longer obtain credentials, its credentials are revoked, its BPN is removed from the directory and its tunnel access ends. Other connectors reject it within their status-list cache time (15 minutes by default). Revoked credentials cannot be restored; readmission issues new ones.",
    action: "Revoke participant",
    pending: "Revoking...",
    error: "Could not revoke the participant",
    color: "error",
  },
  readmit: {
    title: "Readmit",
    severity: "info",
    notice: "Lets the participant back in",
    body: "The participant can request credentials again and its BPN returns to the directory. Its participant portal removes the revoked credentials and requests new ones automatically; other setups must delete them from their Identity Hub. Issue a new tunnel key if the participant uses the operator tunnel.",
    action: "Readmit participant",
    pending: "Readmitting...",
    error: "Could not readmit the participant",
    color: "primary",
  },
} as const;

// Both actions change the participant's dataspace access, so the operator
// gives a reason and types the BPN.
export function ParticipantAccessDialog({
  mode,
  participant,
  onClose,
  onConfirm,
}: {
  mode: keyof typeof modes;
  participant: Participant;
  onClose: () => void;
  onConfirm: (body: RevokeInput) => Promise<unknown>;
}) {
  const text = modes[mode];
  const bpn = participant.bpn.assignedBpn;
  const [reason, setReason] = useState("");
  const [confirmBpn, setConfirmBpn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const ready = reason.trim().length > 0 && confirmBpn.trim() === bpn;

  async function confirm() {
    setSaving(true);
    setError(undefined);
    try {
      await onConfirm({
        reason: reason.trim(),
        confirmBpn: confirmBpn.trim(),
      });
      onClose();
    } catch (confirmError) {
      setError(confirmError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {text.title} {participant.organization.legalName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <ErrorAlert title={text.error} error={error} /> : null}
          <Alert severity={text.severity}>
            <AlertTitle>{text.notice}</AlertTitle>
            {text.body}
          </Alert>
          <TextField
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={2}
            required
            fullWidth
            helperText="Recorded in the participant's audit history."
          />
          <TextField
            label={`Type ${bpn} to confirm`}
            value={confirmBpn}
            onChange={(event) => setConfirmBpn(event.target.value)}
            autoComplete="off"
            fullWidth
            slotProps={{ htmlInput: { sx: { fontFamily: "monospace" } } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={confirm}
          disabled={!ready || saving}
          color={text.color}
          variant="contained"
        >
          {saving ? text.pending : text.action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RevocationBanner({
  participant,
  retrying,
  onRetry,
  onReadmit,
}: {
  participant: Participant;
  retrying: boolean;
  onRetry: () => void;
  onReadmit: () => void;
}) {
  const revocation = participant.revocation;
  if (!revocation) return null;
  const inProgress = !revocation.complete && !revocation.failed;
  return (
    <Alert
      severity={revocation.complete ? "error" : inProgress ? "info" : "warning"}
      action={
        revocation.complete ? (
          <Button color="inherit" size="small" onClick={onReadmit}>
            Readmit
          </Button>
        ) : inProgress ? null : (
          <Button
            color="inherit"
            size="small"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying..." : "Retry revocation"}
          </Button>
        )
      }
    >
      <AlertTitle>
        {revocation.complete
          ? "Participant revoked"
          : inProgress
            ? "Revocation in progress"
            : "Revocation incomplete"}
      </AlertTitle>
      <Typography variant="body2">
        {formatDate(revocation.revokedAt)}: {revocation.reason}
      </Typography>
      {revocation.checks.length > 0 ? (
        <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
          {revocation.checks.map((check) => (
            <li key={check.name}>
              <Typography variant="body2">
                {statusLabels[check.status] ?? check.status}:{" "}
                {checkLabels[check.name] ?? check.name}
                {check.status === "failed" || check.status === "pending"
                  ? ` (${check.message})`
                  : ""}
              </Typography>
            </li>
          ))}
        </Box>
      ) : null}
    </Alert>
  );
}
