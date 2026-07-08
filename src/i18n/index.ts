import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';

/**
 * Ressources i18n embarquées (bundle) — init SYNCHRONE, aucune requête réseau.
 * `en` sert de langue de repli. Ajouter une langue = 1 fichier JSON + 1 entrée ici.
 */
export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
} as const;

export const SUPPORTED_LANGUAGES = Object.keys(resources) as (keyof typeof resources)[];

/** Langue de l'appareil (2 lettres) si supportée, sinon `en`. Jamais bloquant. */
function detectDeviceLanguage(): keyof typeof resources {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return (code in resources ? code : 'en') as keyof typeof resources;
  } catch {
    return 'en';
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  // Les valeurs sont déjà échappées par React ; pas de double-échappement.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
