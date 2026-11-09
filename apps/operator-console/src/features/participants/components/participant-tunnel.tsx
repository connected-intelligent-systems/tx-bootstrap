import { useState } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNetworkEnrollment,
  formatDuration,
  listNetworkEnrollments,
  revokeNetworkEnrollment,
  tunnelSetupText,
  useNetworkStatus,
  type IssuedNetworkEnrollment,
  type NetworkConnection,
  type NetworkEnrollmentStatus,
} from "../api/network-api";
import type { Participant } from "../types";
import type { ChipColor } from "./participant-formatters";
import { ErrorAlert, Info, InfoGrid, StatusChip } from "./participant-ui";

const activeStates = new Set(["CREATING", "ISSUED", "REVOKING"]);

/** A read-only, copyable block for a secret that is shown only once. */
export function SecretTextBlock({
  label,
  value,
  helperText,
}: {
  label: string;
  value: string;
  helperText: string;
}) {
  const [copy, setCopy] = useState<"copied" | "failed" | null>(null);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <Stack spacing={1}>
      <TextField
        label={label}
        value={value}
        multiline
        minRows={4}
        fullWidth
        slotProps={{
          input: {
            readOnly: true,
            sx: {
              fontFamily: "monospace",
              fontSize: 13,
              whiteSpace: "pre",
              overflowX: "auto",
            },
          },
        }}
        helperText={
          copy === "failed"
            ? "Clipboard access failed. Select and copy the text manually."
            : copy === "copied"
              ? "Copied to clipboard."
              : helperText
        }
      />
      <Box>
        <Button startIcon={<ContentCopyIcon />} onClick={copyValue}>
          {copy === "copied" ? "Copied" : "Copy"}
        </Button>
      </Box>
    </Stack>
  );
}

export function TunnelTab({ participant }: { participant: Participant }) {
  const queryClient = useQueryClient();
  const status = useNetworkStatus();
  const enabled = status.data?.enabled === true;
  const [issued, setIssued] = useState<IssuedNetworkEnrollment | null>(null);
  const enrollmentsKey = ["network-enrollments", participant.id];
  const enrollments = useQuery({
    queryKey: enrollmentsKey,
    queryFn: () => listNetworkEnrollments(participant.id),
    enabled,
    refetchInterval: 10000,
  });
  const issue = useMutation({
    mutationFn: () => createNetworkEnrollment(participant.id, "deployment"),
    onSuccess: (result) => {
      setIssued(result);
      queryClient.invalidateQueries({ queryKey: enrollmentsKey });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: enrollmentsKey }),
  });
  const revoke = useMutation({
    mutationFn: (deploymentId: string) =>
      revokeNetworkEnrollment(participant.id, deploymentId),
    onSuccess: (_, deploymentId) => {
      if (issued?.deploymentId === deploymentId) setIssued(null);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: enrollmentsKey }),
  });

  if (status.isPending)
    return <Typography color="text.secondary">Checking tunnel...</Typography>;
  if (status.isError)
    return (
      <ErrorAlert
        title="Tunnel control server unavailable"
        error={status.error}
      />
    );
  if (!status.data.enabled)
    return (
      <Alert severity="info">
        <AlertTitle>Operator tunnel disabled</AlertTitle>
        This console is not connected to a Headscale server. Participants
        publish their own HTTPS endpoint.
      </Alert>
    );

  const verified =
    participant.bpn.verificationStatus === "VERIFIED" &&
    Boolean(participant.bpn.assignedBpn);
  const rows = enrollments.data ?? [];
  const active = rows.find((row) => activeStates.has(row.state));
  const history = rows.filter((row) => row !== active);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
          Operator tunnel
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Publishes the participant's public endpoints through the operator's
          ingress instead of the participant's own HTTPS endpoint. Keys are
          single-use and valid for{" "}
          {formatDuration(status.data.enrollmentTtlSeconds)}.
        </Typography>
      </Box>

      {issue.error ? (
        <ErrorAlert title="Could not issue a key" error={issue.error} />
      ) : null}
      {revoke.error ? (
        <ErrorAlert
          title="Could not revoke the enrollment"
          error={revoke.error}
        />
      ) : null}
      {enrollments.error ? (
        <ErrorAlert
          title="Could not load enrollments"
          error={enrollments.error}
        />
      ) : null}

      {issued ? (
        <Stack spacing={1.5}>
          <Alert severity="warning" variant="outlined">
            Send this to the participant now. The key is shown only once and the
            operator does not store it.
          </Alert>
          <SecretTextBlock
            label="Tunnel setup"
            value={tunnelSetupText(issued)}
            helperText="Tunnel settings for the participant deployment."
          />
          <Box>
            <Button color="inherit" onClick={() => setIssued(null)}>
              Hide
            </Button>
          </Box>
        </Stack>
      ) : null}

      {active ? (
        <EnrollmentCard
          enrollment={active}
          revoking={
            revoke.isPending && revoke.variables === active.deploymentId
          }
          onRevoke={() => revoke.mutate(active.deploymentId)}
        />
      ) : enrollments.isPending ? (
        <Typography color="text.secondary">Loading enrollments...</Typography>
      ) : (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={!verified || issue.isPending}
              onClick={() => issue.mutate()}
            >
              Issue key
            </Button>
          }
        >
          {verified
            ? "No active enrollment. Issue a key to publish this participant through the tunnel."
            : "The participant needs a verified BPN before it can join the tunnel."}
        </Alert>
      )}

      {history.length ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Previous enrollments
          </Typography>
          {history.map((row) => (
            <Stack
              key={row.deploymentId}
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
            >
              <StatusChip label={row.state} color="default" />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
              >
                {row.deploymentId} · {formatDate(row.createdAt)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function EnrollmentCard({
  enrollment,
  revoking,
  onRevoke,
}: {
  enrollment: NetworkEnrollmentStatus;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const { node } = enrollment;
  const [label, color] = connectionChip(enrollment);

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <StatusChip label={label} color={color} />
          {node ? (
            <StatusChip
              label={node.routable ? "ROUTABLE" : "ROUTE PENDING"}
              color={node.routable ? "success" : "warning"}
            />
          ) : null}
        </Stack>
        <InfoGrid>
          <Info label="Public host" value={enrollment.publicHost} mono />
          <Info
            label="Tailnet node"
            value={node ? `${node.name} (${node.ipAddresses.join(", ")})` : ""}
            mono
          />
          <Info
            label={node ? "Key used" : "Key valid until"}
            value={node ? "Yes" : formatDate(enrollment.enrollmentExpiresAt)}
          />
          {node && !node.online ? (
            <Info
              label="Last seen"
              value={node.lastSeen ? formatDate(node.lastSeen) : "Never"}
            />
          ) : null}
          <Info label="Deployment ID" value={enrollment.deploymentId} mono />
        </InfoGrid>
        {connectionHint(enrollment) ? (
          <Typography variant="body2" color="text.secondary">
            {connectionHint(enrollment)}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1}>
          {confirm ? (
            <>
              <Button
                color="error"
                variant="contained"
                disabled={revoking}
                onClick={onRevoke}
              >
                Revoke and remove node
              </Button>
              <Button color="inherit" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              color="error"
              disabled={revoking}
              onClick={() => setConfirm(true)}
            >
              Revoke
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function connectionChip(
  enrollment: NetworkEnrollmentStatus,
): [string, ChipColor] {
  if (enrollment.state === "REVOKING") return ["REVOKING", "warning"];
  const colors: Record<NetworkConnection, ChipColor> = {
    AWAITING_JOIN: "info",
    EXPIRED: "error",
    ONLINE: "success",
    OFFLINE: "warning",
    STALE: "error",
    AMBIGUOUS: "error",
    UNKNOWN: "default",
  };
  return [enrollment.connection, colors[enrollment.connection]];
}

function connectionHint(enrollment: NetworkEnrollmentStatus) {
  if (enrollment.state === "REVOKING")
    return "Revocation did not finish. Revoke again to retry.";
  switch (enrollment.connection) {
    case "AWAITING_JOIN":
      return "Waiting for the participant to start its deployment with the key.";
    case "EXPIRED":
      return "The key expired before the participant joined. Revoke this enrollment and issue a new key.";
    case "AMBIGUOUS":
      return "More than one node joined with this key. Revoke the enrollment and issue a new key.";
    case "OFFLINE":
      return "The node is registered but not connected.";
    case "STALE":
      return "The node has been offline for a long time. Check with the participant, or revoke the enrollment if the deployment is gone.";
    default:
      return enrollment.node && !enrollment.node.routable
        ? "The console assigns the node's name within a few seconds; traffic is routed once it matches."
        : "";
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
