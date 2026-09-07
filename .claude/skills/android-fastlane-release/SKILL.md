---
name: android-fastlane-release
description: Utiliser pour tout ce qui touche à la release Android de TwinLens — build AAB signé, upload Play via Fastlane supply, tracks, versionCode, rollback, secrets. Remplace toute skill EAS Build/Submit (le projet n'utilise PAS EAS).
---

# Release Android (Fastlane + GitHub Actions)

> Autorité : `AGENTS.md` §2 et §6, `RELEASE.md`, ADR 0001/0002/0006. En cas de
> conflit avec cette skill, ces documents gagnent.

## Modèle mental (chemin nominal — AUCUNE étape manuelle)

```
merge PR (conventional commit) → release-please ouvre/actualise la release PR
merge release PR → tag vX.Y.Z + GitHub Release (via PAT)
event release → release-android.yml (environment: play-internal)
  versionName = tag ; versionCode = git rev-list --count HEAD → app.json AVANT prebuild
  expo prebuild → gradlew bundleRelease (upload key, secrets via env)
  → AAB attaché à la Release + artifact
  → bundle exec fastlane android internal (track interne, completed → testeurs servis)
Promotion fermé/production : HUMAINE via le workflow « Play Promote »
(`fastlane android promote`, sans rebuild ; production = rollout progressif).
Prérequis compte personnel : 12 testeurs/14 j en fermé avant la production.
```

## Ce qu'un agent PEUT faire

- Modifier `fastlane/Fastfile` (lanes), `release-android.yml`, `RELEASE.md` — via PR.
- Déclencher un build de validation : `gh workflow run release-android.yml --ref main`
  (défauts sûrs : pas d'upload Play, statut draft).
- Vérifier un run : `gh run view <id> --json jobs`.
- Mettre à jour Fastlane : PR dédiée `bundle update fastlane` (jamais unpinned).

## Ce qu'un agent NE FAIT JAMAIS

- `git tag`, `gh release create`, éditer versions/`CHANGELOG.md` (release-please possède tout).
- Merger une **release PR** sans instruction explicite de l'humain (= livraison).
- Toucher aux secrets (SOPS côté mainteneur ; environment `play-internal` côté GitHub).
- Réécrire l'historique de `main` (casserait la monotonie du versionCode — ADR 0002).
- Proposer EAS ou expo-updates comme solution (ADR 0001).

## Gotchas connus (vécus)

- `-Pandroid.injected.version.code` est **ignoré** par le build RN/Expo → le
  versionCode DOIT être dans `app.json` avant prebuild.
- Rebuild d'un vieux tag → versionCode inférieur → rejet Play (normal, sûr).
- Permission « santé » Play : `expo-sensors` déclare ACTIVITY_RECOGNITION →
  retirée par `plugins/withRemoveActivityRecognition.js`. Ne pas la laisser revenir.
- Fiche store : `store/upload_listing.py` (workflow Store Metadata, manuel) —
  PAS `fastlane supply` (casse sur les notes de version).

## Rollback (pas d'OTA — ADR 0001)

1. Play Console → Production → « Arrêter le déploiement » (halte du rollout).
2. Release patch : PR `fix:` → merge → merge release PR → nouvelle version interne.
3. Issue 🚨 « Incident de release » remplie (cause racine en clôture).

## DoD d'une intervention release

- CI verte ; aucun secret dans les logs ; YAML validé.
- Changement de comportement → `RELEASE.md`/`AGENTS.md` mis à jour.
- Toute validation réelle = run `workflow_dispatch` SANS upload d'abord.
