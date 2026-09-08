/**
 * GARDE i18n (ticket 2.6) — trois invariants :
 *  1. les 6 locales déclarent EXACTEMENT les mêmes clés (pas de trad oubliée) ;
 *  2. aucune clé orpheline (déclarée mais jamais référencée dans src/) ;
 *  3. aucune clé fantôme (référencée dans src/ mais absente d'en.json — typo).
 *
 * Détection : littéraux `namespace.xxx` dans les sources. Les clés pluralisées
 * (`_one`/`_other`) sont ramenées à leur base. Une clé légitimement dynamique
 * (construite à l'exécution) doit être ajoutée à DYNAMIC_ALLOWLIST avec un
 * commentaire.
 */
import * as fs from 'fs';
import * as path from 'path';

const LOCALES = ['en', 'fr', 'it', 'es', 'de', 'pt'] as const;
const SRC = path.join(__dirname, '..', '..');
const LOCALES_DIR = path.join(SRC, 'i18n', 'locales');

/** Clés construites dynamiquement (jamais en littéral complet) — justifier ! */
const DYNAMIC_ALLOWLIST: string[] = [];

type Json = { [k: string]: string | Json };

const flatten = (obj: Json, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const readLocale = (lang: string): Json =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf8')) as Json;

/** Tous les littéraux `a.b[.c]` des sources (hors locales et tests). */
function collectSourceLiterals(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!p.includes('locales') && !p.includes('__tests__')) walk(p);
      } else if (/\.tsx?$/.test(entry.name)) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"`]/g)) {
          found.add(m[1] as string);
        }
      }
    }
  };
  walk(SRC);
  return found;
}

const en = readLocale('en');
const declared = flatten(en);
const literals = collectSourceLiterals();
const pluralBase = (key: string): string => key.replace(/_(one|other)$/, '');

describe('parité des locales', () => {
  it.each(LOCALES.filter((l) => l !== 'en'))("%s déclare exactement les clés d'en.json", (lang) => {
    const keys = flatten(readLocale(lang)).sort();
    expect(keys).toEqual([...declared].sort());
  });
});

describe('clés orphelines (déclarées mais jamais utilisées)', () => {
  it('chaque clé déclarée est référencée dans src/ (ou allowlistée)', () => {
    const orphans = declared.filter(
      (key) =>
        !literals.has(key) &&
        !literals.has(pluralBase(key)) &&
        !DYNAMIC_ALLOWLIST.includes(key) &&
        !DYNAMIC_ALLOWLIST.includes(pluralBase(key)),
    );
    expect(orphans).toEqual([]);
  });
});

describe('clés fantômes (utilisées mais non déclarées — typos)', () => {
  it("tout littéral d'un namespace i18n existe dans en.json", () => {
    const namespaces = new Set(declared.map((k) => k.split('.')[0]));
    const declaredSet = new Set(declared);
    const ghosts = [...literals].filter((lit) => {
      const ns = lit.split('.')[0] as string;
      if (!namespaces.has(ns)) return false; // littéral hors i18n (chemins, ids…)
      return !declaredSet.has(lit) && !declaredSet.has(`${lit}_one`) && !declaredSet.has(`${lit}_other`);
    });
    expect(ghosts).toEqual([]);
  });
});
