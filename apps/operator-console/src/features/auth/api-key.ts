import { useSyncExternalStore } from "react";

// Console API key for OPERATOR_CONSOLE_AUTH_MODE=api-key. Kept in
// sessionStorage: it lasts for the browser tab and is gone when it closes.
const storageKey = "txb.operatorConsole.apiKey";

type Listener = () => void;
const listeners = new Set<Listener>();

// Fallback when browser storage is blocked.
let memoryKey: string | null = null;
// Whether the server rejected the last key (as opposed to the user
// forgetting it), so the prompt can say so.
let rejected = false;

export function wasApiKeyRejected() {
  return rejected;
}

export function getApiKey(): string | null {
  try {
    return window.sessionStorage.getItem(storageKey) || null;
  } catch {
    return memoryKey;
  }
}

export function setApiKey(key: string) {
  rejected = false;
  memoryKey = key;
  try {
    window.sessionStorage.setItem(storageKey, key);
  } catch {
    // Kept in memory only.
  }
  notify();
}

export function clearApiKey() {
  rejected = false;
  forget();
}

function forget() {
  memoryKey = null;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing stored.
  }
  notify();
}

export function subscribeApiKey(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// Adds the stored key to admin requests; a rejected key is forgotten, which
// brings the key prompt back.
export function apiKeyHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { "x-api-key": key } : {};
}

export function handleUnauthorized(status: number) {
  if (status !== 401) return;
  if (getApiKey()) {
    rejected = true;
    forget();
  }
  throw new UnauthorizedError();
}

export function useApiKey() {
  return useSyncExternalStore(subscribeApiKey, getApiKey, () => null);
}
