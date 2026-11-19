/**
 * GARDE i18n À L'EXÉCUTION : complète keys.test.ts (analyse statique des clés)
 * en faisant réellement tourner l'instance i18next de l'app, langue par langue.
 * Sert de filet aux montées de version d'i18next / react-i18next (changements de
 * défauts : fallbackLng, returnEmptyString, interpolation, pluriels...).
 *
 * Invariants :
 *  1. chaque clé se résout dans chaque langue (jamais la clé brute, jamais vide) ;
 *  2. les variables `{{x}}` sont toutes interpolées (aucun `{{` résiduel) ;
 *  3. les pluriels choisissent la bonne forme selon `count` ;
 *  4. une langue non supportée retombe sur l'anglais ;
 *  5. pas de double échappement (escapeValue: false) : `/` et `&` passent tels quels.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

// eslint-disable-next-line import/first -- le mock doit précéder le chargement de l'instance
import i18n, { SUPPORTED_LANGUAGES } from '../index';

type Json = { [k: string]: string | Json };

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const readLocale = (lang: string): Json =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf8')) as Json;

const flattenEntries = (obj: Json, prefix = ''): [string, string][] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? flattenEntries(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, string]],
  );

const en = flattenEntries(readLocale('en'));
const pluralBase = (key: string): string => key.replace(/_(one|other)$/, '');
/** Clés à résoudre : les pluriels ramenés à leur base (une seule fois). */
const baseKeys = [...new Set(en.map(([k]) => pluralBase(k)))];

/** Variables `{{x}}` attendues par une clé (union des formes plurielles en anglais). */
function variablesOf(base: string): Record<string, string | number> {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of en) {
    if (pluralBase(k) !== base) continue;
    for (const m of v.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      const name = m[1] as string;
      vars[name] = name === 'count' ? 5 : `«${name}»`;
    }
  }
  if (en.some(([k]) => k === `${base}_other`)) vars.count = 5;
  return vars;
}

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe.each(SUPPORTED_LANGUAGES)('langue %s', (lang) => {
  beforeAll(async () => {
    await i18n.changeLanguage(lang);
  });

  it('résout chaque clé (ni clé brute, ni chaîne vide)', () => {
    const unresolved = baseKeys.filter((key) => {
      const out = i18n.t(key, variablesOf(key));
      return typeof out !== 'string' || out === '' || out === key;
    });
    expect(unresolved).toEqual([]);
  });

  it('interpole toutes les variables', () => {
    const leftovers = baseKeys.filter((key) => i18n.t(key, variablesOf(key)).includes('{{'));
    expect(leftovers).toEqual([]);
  });

  it('choisit la forme plurielle selon count', () => {
    const locale = new Map(flattenEntries(readLocale(lang)));
    for (const base of baseKeys.filter((k) => locale.has(`${k}_other`))) {
      const vars = variablesOf(base);
      const other = (locale.get(`${base}_other`) as string).replace(/\{\{\s*count\s*\}\}/g, '5');
      expect(i18n.t(base, { ...vars, count: 5 })).toBe(
        other.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => String(vars[name])),
      );
      // count = 1 : forme « one » dans toutes nos langues.
      expect(i18n.t(base, { ...vars, count: 1 })).toContain('1');
    }
  });
});

it("retombe sur l'anglais pour une langue non supportée", async () => {
  await i18n.changeLanguage('xx');
  const [key, value] = en.find(([, v]) => !v.includes('{{')) as [string, string];
  expect(i18n.t(key)).toBe(value);
});

it('ne double-échappe pas les valeurs interpolées', async () => {
  await i18n.changeLanguage('en');
  const key = baseKeys.find((k) => Object.keys(variablesOf(k)).some((n) => n !== 'count')) as string;
  const vars = Object.fromEntries(Object.keys(variablesOf(key)).map((n) => [n, n === 'count' ? 5 : 'a/b & <c>']));
  const out = i18n.t(key, vars);
  expect(out).toContain('a/b & <c>');
  expect(out).not.toMatch(/&amp;|&#x2F;|&lt;/);
});
