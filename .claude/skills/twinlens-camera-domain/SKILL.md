---
name: twinlens-camera-domain
description: Utiliser avant de toucher au cœur métier de TwinLens — modes caméra (multi/sequential/single), pipeline de capture/composition PiP, persistance des réglages, module natif. La carte du domaine et ses invariants.
---

# Domaine TwinLens (carte + invariants)

## Les 4 modes runtime (détection dans `MultiCamController.buildSession`)

| Mode | Condition (déclarative OEM) | Capacités |
|---|---|---|
| `multi` | `FEATURE_CAMERA_CONCURRENT` + combo front+back dans `getConcurrentCameraIds` | tout (photo+vidéo duales simultanées) |
| `sequential` | 2 capteurs mais PAS de combo concurrent (~77 % du parc) | photo double **en deux temps** ; vidéo/boomerang **bloqués** (ADR 0005) |
| `single` | 1 seul capteur exploitable | mono uniquement |
| `none` | aucune caméra | écran d'erreur |

**Aucune app tierce ne peut contourner** cette détection (c'est le HAL). Le
diagnostic utilisateur (`MultiCamDiagnostics` + `buildDeviceReport`) est le
canal support — il a résolu le cas Oppo Reno12.

## Pipeline de capture (invariants)

1. **L'obturateur n'attend jamais le post-traitement** : capture brute →
   `update({isBusy:false})` → composition/sauvegarde via `enqueue()` (file
   sérialisée) dans le **Foreground Service** natif (`PipComposerService`,
   survit au kill).
2. `capturePhoto` **délègue** au séquentiel quand `mode==='sequential'`
   (aperçu arrière → bascule session avant → compose) ; l'aperçu arrière est
   TOUJOURS restauré (`try/finally`).
3. Échec d'ouverture caméra : 1 auto-retry (1,5 s) + rebuild au retour
   foreground + journalisation `camera-open` — ne pas casser cette chaîne.
4. Sauvegarde = **MediaStore natif** (`MediaStoreSaver`, `content://`) ; le
   géotag EXIF force le chemin JS (piexifjs) car le natif ne peut pas injecter
   le GPS.

## Persistance (AGENTS.md §8 — le contrat le plus violé historiquement)

- `settings.ts` = source unique ; toute clé → `SETTINGS_KEYS` +
  `PersistedSettings` + validation + application au montage + `saveSetting`.
- **Sémantique changée ⇒ `SETTINGS_SCHEMA_VERSION`++ + migration + test** (le
  cadre PiP fantôme 1.19→1.22 est né de l'oubli de cette règle).
- Non persistés VOLONTAIREMENT : torche (sécurité), hint PiP (one-shot),
  géotag (permission), `primarySlot` (risque en mono).
- Un deep-link de mode (widget/tuile) **prime** sur le mode persisté
  (`deepLinkMode` ref — course corrigée en 1.22.1).

## Module natif (`modules/video-pip-composer`)

Composition PiP photo/vidéo (GL), boomerang (+GIF), MediaStore, tuile QS,
widget, touches volume, partage direct (MIME exact + ClipData). Tout changement
= rebuild dev (`expo run:android`) + smoke composition (le natif le plus
sensible à R8).

## Fichiers de tête

`vision/MultiCamController.ts` (session+capture) · `screens/MultiCameraScreen.tsx`
(câblage) · `services/settings.ts` · `services/pipComposer.ts` (types+helpers) ·
`components/{CaptureControls,SettingsSheet,MediaViewer,UnsupportedBanner}.tsx`
