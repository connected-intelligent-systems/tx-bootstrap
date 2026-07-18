import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { Participant } from "../types";
import { formatDate, sourceLabel } from "./participant-formatters";
import {
  Info,
  InfoGrid,
  JsonBlock,
  SetupChecks,
  StatusChip,
} from "./participant-ui";

export function OrganizationTab({
  participant,
  onEdit,
}: {
  participant: Participant;
  onEdit: () => void;
}) {
  return (
    <Stack spacing={2.5}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <SectionTitle
          title="Organization information"
          description="Registered participant identity and contact information."
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditOutlinedIcon />}
          onClick={onEdit}
        >
          Edit
        </Button>
      </Stack>
      <InfoGrid>
        <Info label="Legal name" value={participant.organization.legalName} />
        <Info label="Legal form" value={participant.organization.legalForm} />
        <Info label="Country" value={participant.organization.country} />
        <Info label="Tax ID" value={participant.organization.taxId} mono />
        <Info
          label="Register number"
          value={participant.organization.commercialRegisterNumber}
          mono
        />
        <Info label="Website" value={participant.organization.website} />
        <Info
          label="Contact email"
          value={participant.organization.contactEmail}
        />
        <Info
          label="Registered address"
          value={participant.organization.registeredAddress}
        />
      </InfoGrid>
    </Stack>
  );
}

export function BpnTab({ participant }: { participant: Participant }) {
  return (
    <Stack spacing={2.5}>
      <SectionTitle
        title="Business Partner Number"
        description="Assigned BPN, source, and verification details."
      />
      <InfoGrid>
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
        <Info label="Source" value={sourceLabel(participant.bpn.source)} />
        <Info label="Verification" value={participant.bpn.verificationStatus} />
        <Info
          label="External authority"
          value={participant.bpn.externalAuthority}
        />
        <Info
          label="Verified at"
          value={formatDate(participant.bpn.verifiedAt)}
        />
        {participant.bpn.verificationNotes ? (
          <Info label="Notes" value={participant.bpn.verificationNotes} />
        ) : null}
      </InfoGrid>
    </Stack>
  );
}

export function ConnectorTab({
  canEdit,
  participant,
  onEdit,
}: {
  canEdit: boolean;
  participant: Participant;
  onEdit: () => void;
}) {
  return (
    <Stack spacing={2.5}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <SectionTitle
          title="Connector information"
          description="Reported identity and dataspace service endpoints."
        />
        {canEdit ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            onClick={onEdit}
          >
            Edit metadata
          </Button>
        ) : null}
      </Stack>
      <InfoGrid>
        <Info label="DID" value={participant.technical.did} mono />
        <Info label="DSP endpoint" value={participant.technical.dspEndpoint} />
        <Info
          label="Credential service endpoint"
          value={participant.technical.credentialServiceEndpoint}
        />
        <Info
          label="Metadata"
          value={
            participant.technical.metadataComplete ? "Complete" : "Incomplete"
          }
        />
      </InfoGrid>
      <Divider />
      <Stack spacing={1.2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          Setup checks
        </Typography>
        <SetupChecks checks={participant.technical.setupChecks} />
      </Stack>
    </Stack>
  );
}

export function CredentialsTab({ participant }: { participant: Participant }) {
  return (
    <Stack spacing={2}>
      <SectionTitle
        title="Credentials"
        description="Credential request state and participant receipts."
      />
      <InfoGrid>
        <Info label="Credential state" value={participant.credentials.state} />
        <Info
          label="Receipts"
          value={String(participant.credentials.receipts.length)}
        />
      </InfoGrid>
      <JsonBlock
        title="Credential request"
        value={participant.credentials.request}
      />
      <Stack spacing={1.2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          Participant receipts
        </Typography>
        {participant.credentials.receipts.map((receipt) => (
          <Paper
            key={receipt.id}
            elevation={0}
            sx={(theme) => ({
              border: `1px solid ${alpha(theme.palette.text.primary, 0.12)}`,
              p: 1.4,
            })}
          >
            <Stack spacing={0.5}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <StatusChip
                  label={receipt.status}
                  color={
                    receipt.status === "failed"
                      ? "error"
                      : receipt.status === "issued"
                        ? "success"
                        : "info"
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  {formatDate(receipt.receivedAt)}
                </Typography>
              </Stack>
              {receipt.message ? (
                <Typography variant="body2">{receipt.message}</Typography>
              ) : null}
              <Typography variant="caption" color="text.secondary">
                {receipt.credentials.length} credential records
              </Typography>
            </Stack>
          </Paper>
        ))}
        {!participant.credentials.receipts.length ? (
          <Typography color="text.secondary">
            No credential receipts yet.
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  );
}

export function AuditTab({ participant }: { participant: Participant }) {
  return (
    <Stack spacing={2}>
      <SectionTitle
        title="Activity"
        description="Recorded participant and operator events."
      />
      <Stack spacing={1} divider={<Divider flexItem />}>
        {participant.audit.map((event) => (
          <Box key={event.id} sx={{ py: 0.75 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ justifyContent: "space-between", gap: 2 }}
            >
              <Typography sx={{ fontWeight: 800 }}>
                {event.action.replace(/^participant\./, "").replace(/_/g, " ")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDate(event.createdAt)}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {event.actor}
            </Typography>
            {event.message ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {event.message}
              </Typography>
            ) : null}
          </Box>
        ))}
        {!participant.audit.length ? (
          <Typography color="text.secondary">No audit events yet.</Typography>
        ) : null}
      </Stack>
    </Stack>
  );
}

function SectionTitle({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        {description}
      </Typography>
    </Box>
  );
}
