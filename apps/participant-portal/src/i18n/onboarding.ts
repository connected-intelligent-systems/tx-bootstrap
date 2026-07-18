import type { Language } from '../types/onboarding'
import { deCopy } from './onboarding/de'
import { enCopy } from './onboarding/en'
import { localizedStates } from './onboarding/states'

export type UiCopy = { [Key in keyof typeof enCopy]: string }

export const copy: Record<Language, UiCopy> = {
  en: enCopy,
  de: deCopy,
}

export const languageOptions: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]

export function displayState(value: string | undefined, language: Language) {
  const stateValue = value?.trim()
  if (!stateValue) return '-'
  const key = stateValue.toUpperCase()
  return (
    localizedStates[language][key] ??
    stateValue
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

export function formatTimestamp(value: string | undefined, language: Language) {
  if (!value) return '-'
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return '-'
  return timestamp.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')
}
