import type { Language, ThemeMode } from '../types/onboarding'

const storageKeys = {
  locale: 'locale',
  raLocale: 'RaStore.locale',
  raTheme: 'RaStore.theme',
}

export function initialLanguage(): Language {
  const stored = readJsonStorage(storageKeys.raLocale) ?? readStorage(storageKeys.locale)
  if (stored === 'en' || stored === 'de') return stored
  return window.navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function initialThemeMode(): ThemeMode {
  const stored = readJsonStorage(storageKeys.raTheme)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function persistLanguage(language: Language) {
  writeStorage(storageKeys.locale, language)
  writeJsonStorage(storageKeys.raLocale, language)
}

export function persistThemeMode(themeMode: ThemeMode) {
  writeJsonStorage(storageKeys.raTheme, themeMode)
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function readJsonStorage(key: string) {
  const value = readStorage(key)
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore private-mode and locked-down browser storage failures.
  }
}

function writeJsonStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore private-mode and locked-down browser storage failures.
  }
}
