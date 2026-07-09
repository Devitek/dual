# AGENTS.md — Règles impératives pour agents IA (repo `dual` / app **TwinLens**)

> Ce fichier fait autorité pour tout agent IA (Claude Code, Cursor, Copilot, etc.)
> qui travaille sur ce dépôt. **Respecte-le sans exception.** En cas de doute,
> demande avant d'agir.

## 0. TL;DR — les 6 règles d'or
1. **Conventional Commits obligatoires** (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`…). C'est ce qui pilote la version.
2. **Jamais de push direct sur `main`** → passe par une **branche + PR**. La CI (`Typecheck · Doctor · Bundle`) doit être verte.
3. **Jamais** créer un tag/release à la main, ni bumper une version à la main. **release-please** possède `package.json`, `app.json` (`$.expo.version`), `CHANGELOG.md` et `.release-please-manifest.json`.
4. **Média = écriture seule.** Ne **JAMAIS** réintroduire `READ_MEDIA_IMAGES/VIDEO/AUDIO` ni `ACCESS_MEDIA_LOCATION`.
5. **`android/` et `ios/` sont générés** (CNG, gitignorés). Ne les édite pas : modifie `app.json` / config plugins / le module natif local.
6. **Avant de livrer** : `npm run lint` (tsc) vert, `npx expo-doctor` OK, et si tu touches aux permissions → `expo prebuild` + vérif du manifest.

---

## 1. Contexte projet (rapide)
- **TwinLens** : app **Android uniquement** (`platforms: ['android']`), package `fr.devitek.twinlens`, slug `dual`.
- Expo **CNG / Dev Build** (SDK 57, RN 0.86), **VisionCamera v5** (multi-cam front+back simultané).
- Module natif local **`modules/video-pip-composer`** : composition PiP + sauvegarde via un **Foreground Service** (`PipComposerService`, type `dataSync`).
- Repo : **Devitek/dual** (public). Site : https://devitek.github.io/dual/ .

---

## 2. Workflow Git & Release (IMPÉRATIF)

### 2.1 Conventional Commits
Le type du commit détermine le bump de version via release-please :
- `feat:` → **minor** (1.2.0 → 1.3.0)
- `fix:` → **patch** (1.2.0 → 1.2.1)
- `feat!:` / `BREAKING CHANGE:` → **major**
- `ci:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:` → **pas** de bump (mais apparaissent au changelog selon config).

Messages en anglais, scope utile : `fix(android): …`, `ci(release): …`.

### 2.2 Branches & PR
- Travaille sur une **branche dédiée** (`feat/…`, `fix/…`), jamais sur `main`.
- Ouvre une **PR** vers `main`. `main` est **protégé** : PR obligatoire + check **`Typecheck · Doctor · Bundle`** vert + branche à jour.
- Ne merge que si la CI est verte.

### 2.3 Release = 100 % automatisée (ne pas court-circuiter)
```
push/merge sur main → release-please met à jour la "release PR" (version + CHANGELOG)
   merge de la "release PR" → tag vX.Y.Z + GitHub Release
        → build AAB signé (workflow release-android.yml, chaîné)
        → AAB attaché à la Release + upload auto sur Play (canal INTERNE, draft)
```
- **Pour livrer une version : il suffit de merger la "release PR".** Rien d'autre.
- **N'appelle pas** `gh release create`, `git tag`, et ne modifie pas les versions à la main.
- Le workflow manuel `release-android.yml` (`workflow_dispatch`) existe pour un rebuild/upload ponctuel — usage exceptionnel.

### 2.4 versionCode
- **Auto** : `versionCode = git rev-list --count HEAD` (monotone, indépendant du workflow). **Ne jamais** le fixer à la main. Ne réécris pas l'historique de `main` (casserait la monotonie).
- `versionName` = tag sans le `v` (aligné sur `app.json` `$.expo.version`, géré par release-please).
- **GOTCHA** : le versionCode/versionName doivent être écrits dans `app.json` (`$.expo.android.versionCode`, `$.expo.version`) **AVANT** `expo prebuild` (qui les fige dans `android/app/build.gradle`). Le flag Gradle `-Pandroid.injected.version.code` est **IGNORÉ** par le build RN/Expo → l'AAB repartirait sur `versionCode 1` et Play le rejette (« Version code 1 has already been used »). Voir l'étape `Set versionCode / versionName in app.json` de `release-android.yml`.

---

## 3. Permissions Android — sensibles côté Play (attention max)

Toute permission « sensible » déclenche une **déclaration obligatoire** dans la Play Console (bloque « Envoyer pour examen »). Règle : **n'ajoute une permission que si elle est réellement utilisée**, et privilégie les APIs scoped.

### 3.1 Média = ÉCRITURE SEULE — ne pas régresser
- L'app **n'a jamais besoin de LIRE** la pellicule : elle **enregistre** ses propres captures (MediaStore scoped natif + `saveToLibraryAsync`) et supprime ses médias de session.
- `app.json` → plugin `expo-media-library` **DOIT** rester :
  ```json
  { "savePhotosPermission": "…", "isAccessMediaLocationEnabled": false, "granularPermissions": [] }
  ```
- JS → `MediaLibrary.usePermissions({ writeOnly: true })`, et la galerie est **best-effort** (hors du gate bloquant : `allGranted = caméra && micro`).
- **INTERDIT** : `granularPermissions` non vide, `isAccessMediaLocationEnabled: true`, ou tout ajout de `READ_MEDIA_IMAGES/VIDEO/AUDIO`. Ça ferait réapparaître la déclaration « accès photos/vidéos ».

### 3.2 Foreground Service
- `PipComposerService` utilise `FOREGROUND_SERVICE_DATA_SYNC`. Côté Play, il se déclare comme **« Transcodage multimédia »** (traitement local). Légitime — le garder.

### 3.3 Règle générale
- Avant d'ajouter une dépendance, vérifie les permissions qu'elle injecte (`AndroidManifest.xml` des libs + module local). Si une lib ajoute une permission inutile, **retire-la** (option du config plugin, ou config plugin `withAndroidManifest` + `tools:node="remove"`).

---

## 4. Expo CNG / prebuild
- `android/` et `ios/` sont **régénérés** par `expo prebuild` (gitignorés). **Ne commit jamais** de modif dedans.
- Pour changer le natif : édite `app.json`, un **config plugin**, ou le manifest **du module local** (`modules/video-pip-composer/android/src/main/AndroidManifest.xml`, lui **versionné**).
- Vérif d'une modif de permissions :
  ```bash
  npx expo prebuild --platform android --no-install --clean
  grep -o 'android:name="android.permission.[^"]*"' android/app/src/main/AndroidManifest.xml | sort -u
  ```

---

## 5. Vérifications avant de livrer
```bash
npm run lint        # tsc --noEmit — DOIT être vert
npx expo-doctor     # DOIT être OK
# si tu as touché aux permissions / config native :
npx expo prebuild --platform android --no-install --clean   # + grep du manifest
```
La CI rejoue Typecheck + Doctor + `expo export` (bundle Metro). Ne pousse pas de code qui casse `tsc`.

---

## 6. Secrets & CI (ne jamais logguer/committer)
- Signature : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Play : `PLAY_SERVICE_ACCOUNT_JSON` (SA `gh-release-twinlens@twinlens-501821…`, doit avoir le rôle IAM **Service Usage Consumer**).
- Release-please : `RELEASE_PLEASE_TOKEN` (PAT fine-grained / GitHub App ; Contents + PR en read/write).
- Fiche store poussée via l'API brute (`store/upload_listing.py`, workflow `store-metadata.yml`), **pas** via fastlane supply.

---

## 7. Play Console — rappels
- Compte **personnel** → **test fermé ≥ 12 testeurs / 14 jours** avant Production.
- Après chaque nouvel AAB : compléter les **déclarations d'autorisations sensibles** (au minimum FGS → « Transcodage multimédia »).
- L'upload auto se fait en **draft** sur le canal interne : la mise en ligne reste une action humaine dans la console.

---

## 8. Fichiers à tenir à jour quand tu changes le comportement
- `AGENTS.md` (ce fichier), `RELEASE.md` (procédures/gotchas Play), `TODO.md` (état d'avancement), `CHANGELOG.md` (**auto** via release-please — ne pas éditer à la main).
