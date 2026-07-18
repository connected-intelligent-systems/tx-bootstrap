import type { ThemeMode } from "./types";

const themeStorageKey = "RaStore.theme";

export function initialThemeMode(): ThemeMode {
  const stored = readJsonStorage(themeStorageKey);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function persistThemeMode(themeMode: ThemeMode) {
  writeJsonStorage(themeStorageKey, themeMode);
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJsonStorage(key: string) {
  const value = readStorage(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function writeJsonStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private-mode and locked-down browser storage failures.
  }
}
