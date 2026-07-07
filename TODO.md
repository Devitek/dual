# Dual — TODO

## Évolutions demandées (roadmap fonctionnelle)

- [ ] **(a) Module de fusion PiP** — composer les 2 fichiers (avant + arrière) en
      une seule vidéo/photo Picture-in-Picture, en post-traitement.
      Pistes, par ordre de préférence :
      1. Module natif device (iOS `AVMutableComposition` + `AVMutableVideoComposition`,
         Android `MediaMuxer` / OpenGL) exposé via un Expo Module — offline, contrôle total.
      2. `@shopify/react-native-skia` (Video + Canvas) pour incruster la vignette et ré-encoder.
      3. Fusion serveur (worker FFmpeg backend) — le plus simple à maintenir.
      NB : `ffmpeg-kit-react-native` est **déprécié/retiré**, ne pas l'utiliser.
      L'état `primaryPosition` (screen) porte déjà le layout (quel flux est incrusté).

- [ ] **(b) Sélecteur de format** — exposer résolution / FPS / HDR via
      `useCameraFormat(device, [...])` de react-native-vision-camera, avec un
      sélecteur UI (ex. 1080p60 / 4K30 / HDR si supporté par le format).

- [ ] **(c) Contrôles caméra principale** — flash toggle (`torch`/`flash`),
      tap-to-focus (`camera.focus({x, y})`) et pinch-to-zoom
      (`zoom` animé + `minZoom`/`maxZoom` du device).

## Dette technique / suivi SDK 57

- [ ] **Edge-to-edge (Android, obligatoire en SDK 57)** — remplacer les offsets
      absolus codés en dur (PiP `top:64`, bannière `top:60`, contrôles
      `paddingBottom:42`) par `react-native-safe-area-context` (insets réels).
- [ ] **`expo-system-ui`** — requis si on garde `userInterfaceStyle` dans app.json.
- [ ] Migrer la détection multi-cam vers l'API déterministe quand VisionCamera v5
      (Nitro, `supportedMultiCamDeviceCombinations`) sera stable.
