import type { ReactNode } from "react";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { Participant, ParticipantStage } from "../types";
import {
  stageColor,
  stageLabel,
  type ChipColor,
} from "./participant-formatters";

export function SetupChecks({
  checks,
}: {
  checks: Participant["technical"]["setupChecks"];
}) {
  if (!checks.length)
    return (
      <Typography color="text.secondary">
        No setup checks have run yet.
      </Typography>
    );
  return (
    <Table size="small" aria-label="Setup checks">
      <TableHead>
        <TableRow>
          <TableCell>Check</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Message</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {checks.map((check) => (
          <TableRow key={check.name}>
            <TableCell>{check.name}</TableCell>
            <TableCell>
              <StatusChip
                label={check.status}
                color={
                  check.status === "failed"
                    ? "error"
                    : check.status === "ok"
                      ? "success"
                      : "warning"
                }
              />
            </TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                {check.message}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
        {title}
      </Typography>
      <Box
        component="pre"
        sx={(theme) => ({
          bgcolor: alpha(theme.palette.text.primary, 0.06),
          m: 0,
          maxHeight: 280,
          overflow: "auto",
          p: 1.5,
          whiteSpace: "pre-wrap",
        })}
      >
        {JSON.stringify(value ?? {}, null, 2)}
      </Box>
    </Box>
  );
}

export function ErrorAlert({
  title,
  error,
}: {
  title: string;
  error: unknown;
}) {
  return (
    <Alert severity="error" icon={<ErrorOutlineIcon />}>
      <AlertTitle>{title}</AlertTitle>
      {error instanceof Error ? error.message : String(error)}
    </Alert>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.4,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
      }}
    >
      {children}
    </Box>
  );
}

export function InfoGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
      }}
    >
      {children}
    </Box>
  );
}

export function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 800 }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 750,
          overflowWrap: "anywhere",
          fontFamily: mono ? "monospace" : undefined,
        }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}

export function MonoLine({ label, value }: { label: string; value: string }) {
  return (
    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
      <Box component="span" sx={{ fontWeight: 800 }}>
        {label}:{" "}
      </Box>
      <Box component="span" sx={{ fontFamily: "monospace" }}>
        {value}
      </Box>
    </Typography>
  );
}

export function MonoText({ value }: { value: string }) {
  return (
    <Typography
      variant="caption"
      sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
    >
      {value}
    </Typography>
  );
}

export function StageChip({ stage }: { stage: ParticipantStage }) {
  const Icon =
    stage === "CREDENTIALS"
      ? AssignmentTurnedInOutlinedIcon
      : stage === "CONNECTOR_SETUP"
        ? HubOutlinedIcon
        : stage === "BPN_DECISION"
          ? BadgeOutlinedIcon
          : FactCheckOutlinedIcon;
  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={stageLabel(stage)}
      color={stageColor(stage)}
      variant="outlined"
    />
  );
}

export function StatusChip({
  label,
  color,
}: {
  label: string;
  color: ChipColor;
}) {
  return (
    <Chip
      size="small"
      label={label.replace(/_/g, " ")}
      color={color}
      variant="outlined"
    />
  );
}
