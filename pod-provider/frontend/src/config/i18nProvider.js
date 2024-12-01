import { resolveBrowserLocale } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import raEnglishMessages from 'ra-language-english';
import raFrenchMessages from 'ra-language-french';
import { frenchMessages as authFrenchMessages, englishMessages as authEnglishMessages } from '@semapps/auth-provider';
import frAppMessages from './messages/fr';
import enAppMessages from './messages/en';
import * as resources from '../resources';

const messages = {
  fr: {
    ...raFrenchMessages,
    ...authFrenchMessages,
    ...frAppMessages
  },
  en: {
    ...raEnglishMessages,
    ...authEnglishMessages,
    ...enAppMessages
  }
};

export const locales = [
  { locale: 'en', name: 'English' },
  { locale: 'fr', name: 'Français' }
];

// Filter locales based on the Pod provider settings
export const availableLocales = locales.filter(e => CONFIG.AVAILABLE_LOCALES.includes(e.locale));

const getResourcesMessages = lang =>
  Object.fromEntries(Object.entries(resources).map(([k, v]) => [k, v.translations ? v.translations[lang] : {}]));

const getMessages = lang => {
  if (Object.keys(availableLocales).includes(lang)) {
    return {
      ...messages[lang],
      resources: getResourcesMessages(lang)
    };
  } else {
    return {
      ...messages[CONFIG.DEFAULT_LOCALE],
      resources: getResourcesMessages(CONFIG.DEFAULT_LOCALE)
    };
  }
};

const i18nProvider = polyglotI18nProvider(getMessages, resolveBrowserLocale(CONFIG.DEFAULT_LOCALE), availableLocales);

export default i18nProvider;
