import { resolveBrowserLocale } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import raEnglishMessages from 'ra-language-english';
import raFrenchMessages from 'ra-language-french';
import { frenchMessages as authFrenchMessages, englishMessages as authEnglishMessages } from '@semapps/auth-provider';
import frAppMessages from './messages/fr';
import enAppMessages from './messages/en';
import * as resources from '../resources';

const getMessages = lang => {
  if (lang === 'en') {
    return {
      ...raEnglishMessages,
      ...authEnglishMessages,
      ...enAppMessages,
      resources: Object.fromEntries(
        Object.entries(resources).map(([k, v]) => [k, v.translations ? v.translations[lang] : {}])
      )
    };
  } else if (lang === 'fr') {
    return {
      ...raFrenchMessages,
      ...authFrenchMessages,
      ...frAppMessages,
      resources: Object.fromEntries(
        Object.entries(resources).map(([k, v]) => [k, v.translations ? v.translations[lang] : {}])
      )
    };
  } else {
    throw new Error('Language not handled: ' + lang);
  }
};

export const locales = [
  { locale: 'en', name: 'English' },
  { locale: 'fr', name: 'Français' }
];

// Filter locales based on the Pod provider settings
export const availableLocales = locales.filter(e => CONFIG.AVAILABLE_LOCALES.includes(e.locale));

const i18nProvider = polyglotI18nProvider(getMessages, resolveBrowserLocale(CONFIG.DEFAULT_LOCALE), availableLocales);

export default i18nProvider;
