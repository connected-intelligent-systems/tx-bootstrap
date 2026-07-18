import type { ParticipantStage } from "../types";

export type ChipColor =
  | "default"
  | "primary"
  | "secondary"
  | "error"
  | "info"
  | "success"
  | "warning";

export function stageLabel(stage: ParticipantStage) {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function sourceLabel(source: string) {
  if (source === "LOCAL") return "Generated locally";
  if (source === "EXTERNAL") return "Existing BPN";
  if (source === "IMPORTED") return "Imported";
  return source;
}

export function stageColor(stage: ParticipantStage): ChipColor {
  if (stage === "CREDENTIALS") return "success";
  if (stage === "FAILED" || stage === "REJECTED") return "error";
  if (stage === "CONNECTOR_SETUP") return "info";
  return "warning";
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
