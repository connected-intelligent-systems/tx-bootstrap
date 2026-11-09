import { useQuery } from "@tanstack/react-query";
import { request } from "./participants-api";

export type NetworkStatus =
  | { enabled: false }
  | {
      enabled: true;
      provider: "headscale";
      controlUrl: string;
      participantTag: string;
      participantDomain: string;
      enrollmentTtlSeconds: number;
      invitationTtlSeconds: number;
      reachable: boolean;
    };

export type NetworkEnrollmentState =
  "CREATING" | "ISSUED" | "FAILED" | "REVOKING" | "REVOKED";

export type NetworkConnection =
  "AWAITING_JOIN" | "EXPIRED" | "ONLINE" | "OFFLINE" | "AMBIGUOUS" | "UNKNOWN";

export interface NetworkEnrollment {
  deploymentId: string;
  controlUrl: string;
  hostname: string;
  publicHost: string;
  tag: string;
  state: NetworkEnrollmentState;
  enrollmentExpiresAt: string;
  createdAt: string;
}

export interface NetworkEnrollmentStatus extends NetworkEnrollment {
  connection: NetworkConnection;
  node: {
    id: string;
    name: string;
    routable: boolean;
    ipAddresses: string[];
    online: boolean;
    expiresAt: string | null;
  } | null;
}

/** Returned once on creation; the key cannot be retrieved again. */
export interface IssuedNetworkEnrollment extends NetworkEnrollment {
  authKey: string;
  participantEnv: Record<string, string>;
}

export type EnrollmentPurpose = "deployment" | "invitation";

const participantsUrl = "/api/admin/participants";

export function getNetworkStatus(): Promise<NetworkStatus> {
  return request<NetworkStatus>("/api/admin/network");
}

export function listNetworkEnrollments(
  participantId: string,
): Promise<NetworkEnrollmentStatus[]> {
  return request<NetworkEnrollmentStatus[]>(
    `${participantsUrl}/${encodeURIComponent(participantId)}/network-enrollments`,
  );
}

export function createNetworkEnrollment(
  participantId: string,
  purpose: EnrollmentPurpose,
): Promise<IssuedNetworkEnrollment> {
  return request<IssuedNetworkEnrollment>(
    `${participantsUrl}/${encodeURIComponent(participantId)}/network-enrollments`,
    {
      method: "POST",
      body: { deploymentId: crypto.randomUUID(), purpose },
    },
  );
}

export function revokeNetworkEnrollment(
  participantId: string,
  deploymentId: string,
): Promise<NetworkEnrollment> {
  return request<NetworkEnrollment>(
    `${participantsUrl}/${encodeURIComponent(participantId)}/network-enrollments/${encodeURIComponent(deploymentId)}/revoke`,
    { method: "POST" },
  );
}

/**
 * Deployment-neutral tunnel values for the participant. How they are applied
 * (Compose environment and secret file, Helm values and Secret) is up to the
 * participant's deployment and documented there.
 */
export function tunnelSetupText(
  enrollment: IssuedNetworkEnrollment,
  header: string[] = [],
): string {
  const env = Object.entries(enrollment.participantEnv).map(
    ([key, value]) => `${key}=${value}`,
  );
  return [
    ...header,
    `# Operator tunnel for ${enrollment.publicHost}`,
    `# TAILNET_AUTHKEY is secret, single-use and valid until ${new Date(enrollment.enrollmentExpiresAt).toISOString()}.`,
    ...env,
    `TAILNET_AUTHKEY=${enrollment.authKey}`,
  ].join("\n");
}

/** Whether the optional operator tunnel is configured. */
export function useNetworkStatus() {
  return useQuery({
    queryKey: ["network-status"],
    queryFn: getNetworkStatus,
    staleTime: 60000,
    retry: false,
  });
}

export function formatDuration(seconds: number) {
  if (seconds % 86400 === 0) return plural(seconds / 86400, "day");
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  return plural(Math.round(seconds / 60), "minute");
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
