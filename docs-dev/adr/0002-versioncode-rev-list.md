# ADR 0002 — `versionCode` = `git rev-list --count HEAD`

**Statut** : ✅ Accepté (2026-08, formalisé 2026-09)

## Contexte

Play exige un `versionCode` entier **strictement croissant**. Premières
tentatives : compteur de run CI (réinitialisable, non monotone entre
workflows) et flag Gradle `-Pandroid.injected.version.code` (**ignoré** par le
build RN/Expo → AAB en versionCode 1, rejeté par Play).

## Décision

`versionCode = git rev-list --count HEAD`, calculé dans `release-android.yml`
(`fetch-depth: 0`) et écrit dans `app.json` **avant** `expo prebuild` (qui le
fige dans `android/app/build.gradle`). `versionName` = tag sans le `v`
(release-please).

## Justification

- Monotone par construction (main n'avance que par merges) et **indépendant du
  système de CI** (reproductible depuis n'importe quel checkout complet).
- Zéro état externe à entretenir (pas de compteur à stocker).

## Conséquences

- **Interdiction absolue de réécrire l'historique de `main`** (le count
  reculerait) — verrouillé par la branch protection ; règle dans AGENTS.md §2.4.
- Rebuild d'un vieux tag → versionCode plus petit → Play **refuse** (échec sûr
  et explicite, jamais de corruption).
- Merge squash = +1 par PR ; un merge-commit en ajouterait davantage — sans
  danger (toujours croissant).
- Garde-fou futur possible : comparer à `versionCode` publié via l'API Play en
  dry-run (backlog vague 2).
