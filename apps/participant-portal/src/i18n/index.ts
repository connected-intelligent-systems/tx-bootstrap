import polyglotI18nProvider from 'ra-i18n-polyglot'
import englishMessages from 'ra-language-english'
import germanMessages from 'ra-language-german'
import englishMessagesCustom from './en'
import germanMessagesCustom from './de'
import { dataProductUxEnglish, dataProductUxGerman } from './dataProductUx'
import { portalUxEnglish, portalUxGerman } from './portalUx'
import { technicalResourcesEnglish, technicalResourcesGerman } from './technicalResources'
import merge from 'lodash/merge'

const messages: { [key: string]: any } = {
  en: merge(
    {},
    englishMessages,
    englishMessagesCustom,
    portalUxEnglish,
    dataProductUxEnglish,
    technicalResourcesEnglish,
  ),
  de: merge({}, germanMessages, germanMessagesCustom, portalUxGerman, dataProductUxGerman, technicalResourcesGerman),
}

const detectBrowserLanguage = (): string => {
  if (typeof navigator === 'undefined') return 'en'
  const storedLang = localStorage.getItem('locale')
  if (storedLang && (storedLang === 'en' || storedLang === 'de')) return storedLang
  const browserLang = navigator.language || (navigator as any).userLanguage
  return browserLang?.split('-')[0] === 'de' ? 'de' : 'en'
}

export const i18nProvider = polyglotI18nProvider(
  (locale) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('locale', locale)
    return messages[locale] || messages.en
  },
  detectBrowserLanguage(),
  [
    { locale: 'en', name: 'English' },
    { locale: 'de', name: 'Deutsch' },
  ],
)
