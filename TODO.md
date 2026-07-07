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
- [ ] `react-native-safe-area-context` pour les offsets (edge-to-edge SDK 57).
