# Dual — TODO

## Migration VisionCamera v5 (multi-cam simultané réel) — Android / Material 3

- [x] **Multi-cam simultané** via l'API session v5 (`createCameraSession(true)` +
      `session.configure([back, front])` + 2 `NativePreviewView`). Les deux flux
      proviennent d'UNE seule session -> plus d'éviction (le bug v4 est résolu).
      Repli automatique en mono-caméra si `supportsMultiCamSessions` = false ou pas
      de combinaison front+back. Voir `src/vision/MultiCamController.ts`.
- [x] **Permissions v5** (`useCameraPermission`/`useMicrophonePermission`, plus de
      config plugin Expo) + galerie. `src/hooks/useMultiCamPermissions.ts`.
- [x] **Contrôles** : torch, flash photo, tap-to-focus (`createNormalizedMeteringPoint`
      + `controller.focusTo`), pinch-zoom (`controller.setZoom`).
- [x] **UI Material 3** (thème dark M3, chips, FAB obturateur, bandeau).
- [x] **Android-only** (`platforms: ['android']`, bloc iOS retiré).
- [x] Fusion PiP conservée : photo réelle (view-shot) + service vidéo FFmpeg documenté.

## ⚠️ À VALIDER SUR DEVICE (non testable hors device)

Cette couche v5 est écrite d'après les types Nitro réels et passe tsc + bundle +
doctor, mais n'a pas encore tourné sur un appareil. Points à vérifier/ajuster :

- [ ] `session.configure(...)` réussit sur le Pixel 8 Pro (combinaison front+back
      réellement dans `supportedMultiCamDeviceCombinations`).
- [ ] `mirrorMode` de la frontale (preview + capture) — ajuster si l'image est
      inversée dans le mauvais sens.
- [ ] Enregistrement vidéo double (`createRecorder` par caméra) + finalisation.
- [ ] Zoom pinch : sensibilité (`zoomBase * scale`) et bornes par slot.
- [ ] Cycle de vie `setActive` (start/stop) au passage arrière-plan.

## Réactivité capture (fait)

- [x] **Photo réactive** : capture des 2 photos en parallèle (`Promise.all`),
      **obturateur libéré immédiatement**, composition PiP + sauvegarde en
      **tâche de fond sérialisée** (`enqueue`), + **flash d'obturateur** instantané
      et **indicateur de traitement** sur la miniature. (`MultiCamController` / screen)
- [x] **Vidéo non bloquante** : l'arrêt rend la main tout de suite, traitement en
      tâche de fond via la même file, avec un **composeur vidéo injectable**
      (`setVideoComposer`).

## Fusion PiP vidéo on-device — module natif (v1, À VALIDER SUR DEVICE)

- [~] **`modules/video-pip-composer`** — module Expo Android (Kotlin) : MediaCodec
      (2 décodeurs) + OpenGL ES (compositing arrière plein cadre + avant vignette)
      + encodeur H.264 + MediaMuxer (+ copie audio de la principale). Tourne en
      `AsyncFunction` (thread de fond). Branché via `setVideoComposer` si présent
      dans le build (`requireOptionalNativeModule`, repli gracieux sinon).
      ⚠️ **Non compilable/testable hors device.** À vérifier après `prebuild --clean` :
      - le module autolink bien (`expo-module.config.json`) et compile ;
      - orientation/`getTransformMatrix` de la frontale (miroir/rotation) ;
      - synchro avant/arrière (lockstep 1:1 -> passer à une sync par PTS si dérive) ;
      - audio muxé correctement ; codecs HDR/10-bit éventuels.
- [ ] Option Phase 2 : composition **photo** hors thread JS via `@shopify/react-native-skia`
      si la latence résiduelle gêne.

## Reste / dette

- [ ] Sélecteur de format v5 via `constraints` (`{ fps }`, HDR) — retiré pendant la
      migration (l'API v4 `useCameraFormat` n'existe plus).
- [~] `react-native-safe-area-context` : `SafeAreaProvider` en place + insets
      appliqués (avec plancher anti-régression sous statusbar masquée) à la barre
      haute, au bandeau mono-cam et à l'en-tête galerie. Reste à propager aux
      offsets couplés PiP/PipHint (top 96 / bottom 150) si besoin.
- [x] **Material You** (couleur dynamique système, Android 12+) via
      `@pchmn/expo-material3-theme` : `ThemeProvider` + `useColors()` /
      `useThemedStyles(makeStyles)` (`src/theme/theme.tsx`). Tous les composants
      migrés en styles thémés ; repli sur la couleur de marque hors Android 12+.
      Reste optionnel : **icône thématisée** (adaptiveIcon `monochromeImage`).

## Redesign TwinLens (UI only — couche caméra native intacte)

- [x] §0 Branding : app `TwinLens` (slug/package inchangés), icône + adaptive icon,
      textes de permission. Pill viseur `Dual`/`Simple` conservé (= mode de capture).
- [x] §1 Viseur : obturateur unique adaptatif + `ModeSwitch` Photo|Vidéo + `ZoomBar`
      (paliers), bouton d'inversion, flash blanc + bounce miniature, hint PiP 1er
      lancement (AsyncStorage `tl_seen_pip_hint`).
- [x] §2 Flash photo cyclable (off/auto/on) dans la barre supérieure.
- [x] §3 Paramètres : segmented M3 (coche), descriptions des modes, légendes de
      résolution, sélecteur de coin en mini-téléphones, bouton « Fermer » retiré.
- [x] §4 Galerie : poster vidéo (`expo-video-thumbnails`), lecture in-app
      (`expo-video`), sélection (appui long) + Partager/Ouvrir/Supprimer, puce
      « déjà enregistrés ». Durée vidéo trackée dans le contrôleur.
- [x] §5 Écran d'erreur actionnable (`CameraErrorView` + `controller.retry()`),
      lien « Pourquoi ? » sur le bandeau mono-cam.
- [x] §6 Finitions : safe-area (voir ci-dessus), hitSlop PiP, **Material You**
      (couleur système, voir Reste/dette). App renommée `fr.devitek.twinlens`.

## 🚚 Livraison / Store — BLOQUÉ (compte développeur non vérifié)

Tout ce qui suit est en attente d'un **compte Google Play Console vérifié**
(vérification d'identité, frais unique). Le pipeline CI/build actuel produit un
APK **debug-signé de TEST** ; rien n'est encore prêt pour une publication Store.

### Préalable — compte & accès
- [ ] Créer/vérifier le **compte Google Play Console** (identité vérifiée).
- [ ] (Si build délégué) Compte **Expo/EAS** + `EXPO_TOKEN` en secret GitHub.
- [ ] Créer l'app dans la Play Console avec le package **`fr.devitek.twinlens`**
      (déjà fixé dans `app.json`).

### Signature (App Signing)
- [ ] Générer l'**upload key** (keystore) + activer **Play App Signing**.
- [ ] Stocker keystore + mots de passe en **secrets GitHub** (base64) — jamais
      committer (`*.keystore` / `*.jks` déjà gitignorés).
- [ ] Configurer le `signingConfig release` (via config plugin `expo-build-properties`
      ou EAS credentials) — actuellement release = signature debug.

### Build de release
- [ ] Passer `android-build.yml` de `assembleDebug` → **`bundleRelease` (AAB signé)**.
- [ ] **`versionCode`** auto-incrémenté (run number CI ou EAS auto-increment) —
      actuellement fixe (défaut 1).
- [ ] (Alternative recommandée) **EAS Build** profil `production` (`eas.json`),
      credentials gérés par Expo.

### Optimisation (post-lancement)
- [ ] **R8 / minification + upload du `mapping.txt`** — répond à l'avertissement
      Play « aucun fichier de désobscurcissement associé à cet App Bundle ».
      Activer via `expo-build-properties` (`enableProguardInReleaseBuilds` +
      `enableShrinkResourcesInReleaseBuilds`), ajouter les *keep rules* pour
      VisionCamera/Nitro + le module PiP natif, puis passer le mapping à `supply`
      (`upload_to_play_store(mapping: …)` dans `release-android.yml`).
      ⚠️ **Tester sur device** avant release (R8 peut casser une app RN mal
      configurée). Non bloquant : l'avertissement est bénin tant qu'on n'obscurcit
      pas, et l'app est déjà légère (~23 Mo).

### Publication (soumission)
- [ ] **`eas submit`** OU workflow **fastlane / Google Play Publisher API**
      (service account JSON en secret) déclenché sur `release: published`.
- [ ] Rodage via piste **Internal testing** → **Closed/Open testing** → Production.

### Conformité fiche Play
- [ ] Fiche : titre, description, **captures d'écran**, icône haute-def, feature graphic.
- [ ] **Politique de confidentialité** (URL) + formulaire **Data safety**
      (caméra / micro / stockage / notifications).
- [ ] Justification des permissions sensibles (caméra, micro, `POST_NOTIFICATIONS`,
      `FOREGROUND_SERVICE_DATA_SYNC`).
- [ ] Content rating (questionnaire IARC) + `targetSdkVersion` conforme aux
      exigences Play en vigueur.
