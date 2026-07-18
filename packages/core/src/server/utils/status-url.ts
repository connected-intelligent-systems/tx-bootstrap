/**
 * Build the status URL for a participant's onboarding case
 */
export function buildStatusUrl(
  publicUrl: string,
  registrationToken: string,
): string {
  const url = new URL("/status", publicUrl);
  url.searchParams.set("registrationToken", registrationToken);
  return url.toString();
}
