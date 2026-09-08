---
name: expo-testing
description: Utiliser pour écrire ou faire évoluer les tests de TwinLens (Jest/jest-expo) — conventions, mocks connus, pièges vécus, et quoi tester en priorité sur cette base de code.
---

# Tests (Jest + jest-expo)

> État : 63 tests (logique pure). RNTL et Maestro e2e = vague 3.

## Stack & conventions

- `jest-expo ~57` + `jest 29` + `@react-native/jest-preset` **pinné 0.86**
  (suit `react-native` ; majeur/minor gelés dans dependabot).
- Tests co-localisés : `src/**/__tests__/*.test.ts`. Français pour les intitulés.
- `tsconfig` : `types: ["jest", "node"]` (TS 6 n'auto-inclut plus les @types).
- CI : `npm test -- --ci` dans le job requis.

## Pièges vécus (ne pas re-payer)

- **`jest.mock` est hoisté** au-dessus des imports/const : toute variable
  capturée par la factory doit être préfixée `mock*` (sinon TDZ).
- Mock AsyncStorage officiel :
  `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))`.
- `expo-file-system/legacy` : mock manuel Map en mémoire (cf. crashJournal.test).
- Écritures fire-and-forget : `await new Promise((r) => setTimeout(r, 0))` avant
  d'asserter.

## Invariants sous garde (à maintenir, jamais affaiblir)

| Test | Invariant |
|---|---|
| `settings.test.ts` | §8 : toute clé de `SETTINGS_KEYS` est relue/validée ; table `VALID_RAW` casse le build si clé ajoutée sans test ; **migrations** (maj depuis version antérieure, idempotence, downgrade) |
| `keys.test.ts` (i18n) | parité stricte des 6 locales · zéro clé orpheline · zéro clé fantôme (typo) |
| `crashJournal.test.ts` | plafond 30, anti-corruption, chaînage du handler global |
| `pipComposer/shareMedia/deviceReport` | helpers purs (ratios, ffmpeg, noms, rapport) |

## Quoi tester en priorité ensuite

1. Logique extraite du controller (détection multi/sequential/single) — après le
   refactor god-files (vague 3), PAS en important `react-native-vision-camera`.
2. RNTL sur les composants à états (SettingsSheet contextuel, UnsupportedBanner,
   M3Switch) une fois le besoin avéré.
3. Maestro smoke (launch → permission gate → photo → persistance) sur émulateur
   GHA — artifacts screenshots + logcat.

## DoD test

Un bug corrigé = un test qui l'aurait attrapé (le fantôme `timerSeconds:0` et
les 37 clés i18n mortes ont été attrapés par ces suites — c'est le standard).
