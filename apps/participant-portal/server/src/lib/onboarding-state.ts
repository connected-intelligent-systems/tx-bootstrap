export function preserveCredentialRequestState(localState: string, operatorState: string): string {
  if (localState === 'CREDENTIALS_REQUESTED' && operatorState === 'READY_FOR_PARTICIPANT') {
    return localState
  }
  return operatorState || localState || 'REQUESTED'
}
