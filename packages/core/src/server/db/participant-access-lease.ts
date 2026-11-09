export class ParticipantLeaseLostError extends Error {
  constructor() {
    super("Participant access lease was lost; retry the operation");
    this.name = "ParticipantLeaseLostError";
  }
}

export interface ParticipantAccessLease {
  token: string;
  signal: AbortSignal;
  assertActive(): void;
}
