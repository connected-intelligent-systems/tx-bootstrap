import type { Language } from '../../types/onboarding'

export const localizedStates: Record<Language, Record<string, string>> = {
  en: {
    CREDENTIALS_REQUESTED: 'Credentials requested',
    CONFIGURATION_REQUIRED: 'Configuration required',
    FAILED: 'Failed',
    NOT_STARTED: 'Not started',
    ONBOARDED: 'Onboarded',
    READY_FOR_PARTICIPANT: 'Ready for participant',
    REQUESTED: 'Requested',
    REVOKED: 'Revoked by the operator',
  },
  de: {
    CREDENTIALS_REQUESTED: 'Credentials angefragt',
    CONFIGURATION_REQUIRED: 'Konfiguration erforderlich',
    FAILED: 'Fehlgeschlagen',
    NOT_STARTED: 'Nicht gestartet',
    ONBOARDED: 'Onboarded',
    READY_FOR_PARTICIPANT: 'Bereit für Teilnehmer',
    REQUESTED: 'Angefragt',
    REVOKED: 'Vom Betreiber widerrufen',
  },
} satisfies Record<Language, Record<string, string>>
