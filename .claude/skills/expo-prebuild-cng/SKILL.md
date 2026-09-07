---
name: expo-prebuild-cng
description: Utiliser dès qu'un changement touche le natif Android de TwinLens — dépendance avec code natif, permissions, config plugin, module local video-pip-composer, ou erreur de build Gradle. Le projet est en CNG pur (android/ généré, jamais commité).
---

# CNG / prebuild (android/ est GÉNÉRÉ)

> Autorité : `AGENTS.md` §3 et §4. Le manifest final = fusion (Expo + libs +
> module local + plugins). `android/` et `ios/` sont **gitignorés**.

## Règles absolues

1. **Jamais** committer ni éditer `android/` — toute modif y sera perdue au
   prochain prebuild. Le natif custom va dans :
   - `modules/video-pip-composer/` (module Expo local, versionné — services,
     manifest, Kotlin) ;
   - `plugins/*.js` (config plugins, ex. retrait d'une permission via
     `tools:node="remove"`) ;
   - `app.json` (permissions, plugins, adaptive icon…).
2. **Média = écriture seule** : ne JAMAIS réintroduire
   `READ_MEDIA_IMAGES/VIDEO/AUDIO` ni `ACCESS_MEDIA_LOCATION` (AGENTS.md §3.1
   — sinon déclaration Play « accès photos/vidéos » réactivée).
3. Toute dépendance ajoutée : inspecter le manifest qu'elle injecte
   (`node_modules/<pkg>/android/**/AndroidManifest.xml`). Permission inutile →
   la retirer via config plugin.

## Procédure de vérification (obligatoire si natif/permissions touchés)

```bash
npx expo prebuild --platform android --no-install --clean
grep -o 'android:name="android.permission.[^"]*"' android/app/src/main/AndroidManifest.xml | sort -u
# → coller la sortie dans la PR (template DoD)
rm -rf android   # optionnel : ne jamais le committer de toute façon
```

Attendu (état sain) : CAMERA, RECORD_AUDIO, FOREGROUND_SERVICE(+_DATA_SYNC),
POST_NOTIFICATIONS, WRITE_EXTERNAL_STORAGE(maxSdk 28), ACCESS_(COARSE|FINE)_LOCATION
(géotag opt-in), VIBRATE, WAKE_LOCK & co. Toute permission NOUVELLE = à justifier
dans la PR + impact Play évalué (AGENTS.md §3.3).

## Quand rebuilder le dev build ?

- Changement **JS pur** → reload Metro suffit.
- Dépendance native / plugin / module local / permissions → `npx expo run:android`.
- Dérive patches SDK Expo (doctor rouge) → `npx expo install --fix` puis PR
  `chore(deps): realign Expo SDK patches` (cron `expo-drift.yml` la détecte le lundi).

## Gotchas connus

- Dev build et build Play partagent l'`applicationId` → désinstaller l'un pour
  installer l'autre (downgrade + signatures différentes).
- `versionCode`/`versionName` figés par prebuild — d'où l'écriture dans
  `app.json` AVANT prebuild en release (ADR 0002).
- NixOS : `nix-shell` fournit SDK/NDK/JDK + contournement aapt2 (`shell.nix`).
