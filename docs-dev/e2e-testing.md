# Tests e2e / pilotage device (TwinLens)

Runbook pour piloter l'app sur un device Android sans intervention humaine :
install fraiche, octroi des permissions, fermeture de l'onboarding, puis flows
photo et video. Voir issue #218 pour l'historique.

## Principe : cibler par `resource-id`, jamais par coordonnees

React Native expose le prop `testID` comme `resource-id` dans la hierarchie
uiautomator (verifie sur device, Pixel 8 Pro, dev build). On pilote donc ainsi :

1. `adb shell uiautomator dump` de la hierarchie,
2. lecture des `bounds` du noeud dont le `resource-id` vaut le `testID` cible,
3. tap du centre de ces `bounds`.

Le driver `scripts/e2e/ui.mjs` encapsule tout ca (`dump`, `exists`, `wait`,
`tap`, `grant`, `launch`, `onboard`).

### Pourquoi pas les coordonnees fixes

En dev build, une banniere/overlay du debugger se superpose en haut : un tap par
coordonnees devinees atterrit dessus au lieu de la cible (typiquement le CTA
d'onboarding). Le ciblage par `resource-id` lit la position reelle a l'instant t,
il est immunise contre ce decalage.

### Correction d'un piege repandu

Contrairement a une croyance courante, le dump uiautomator n'est **pas** vide sur
l'ecran camera : les overlays RN (Pressables des controles) se rendent par-dessus
la SurfaceView/GL et apparaissent dans la hierarchie. Le ciblage par `testID`
marche donc aussi sur le viseur (`camera-shutter`, `mode-video`, etc.).

## Driver : `scripts/e2e/ui.mjs`

```bash
# Flow install fraiche complet (accorde permissions + lance + ferme l'onboarding)
node scripts/e2e/ui.mjs onboard

# Briques unitaires
node scripts/e2e/ui.mjs grant               # camera + micro + notifications
node scripts/e2e/ui.mjs launch              # (re)lance l'activite
node scripts/e2e/ui.mjs dump                # liste les resource-id visibles
node scripts/e2e/ui.mjs exists mode-video   # exit 0 si present
node scripts/e2e/ui.mjs wait camera-shutter # attend l'apparition
node scripts/e2e/ui.mjs tap mode-video      # attend puis tape le centre
```

Device multiple : `ADB_SERIAL=<serial> node scripts/e2e/ui.mjs ...`.

## Catalogue des testID stables

Ecran permissions (`PermissionGate`)
- `permission-grant`, `permission-open-settings`

Onboarding / Nouveautes (`IntroSheet`)
- `onboarding-cta` (premiere ouverture), `whatsnew-cta` (apres mise a jour)

Barre de capture (`CaptureControls`)
- `camera-shutter`, `camera-flip`, `camera-settings-open`
- `camera-gallery-open` (session vide), `camera-gallery-thumbnail` (apres capture)

Barre du haut (`CameraTopBar`)
- `camera-ae-lock`, `camera-flash-toggle`

Modes (`ModeSwitch`) et zoom (`ZoomControl`)
- `mode-photo`, `mode-video`, `mode-boomerang`
- `zoom-preset-0.5`, `zoom-preset-1`, `zoom-preset-2`, `zoom-preset-5`, ...

Reglages rapides (`SettingsSheet`)
- `settings-more`, `settings-tab-general`, `settings-tab-pro`
- bascules : `setting-torch`, `setting-preview`
- selecteurs (chaque option = `${id}-${valeur}`, ex. `setting-layout-pip`) :
  `setting-layout`, `setting-timer`, `setting-burst`, `setting-quality`,
  `setting-ratio`, `setting-fps`, `setting-save`, `setting-speed`,
  `setting-boomformat`

Reglages avances (`MoreSettingsModal`)
- `more-close`, `more-rate`, `more-volumekey`
- bascules : `more-shuttersound`, `more-geotag`, `more-grid`, `more-level`,
  `more-mirror`, `more-watermark`, `more-stabilization`, `more-ots-enable`
- Sur le fait : `more-ots-perday-min`, `more-ots-perday-max`, `more-ots-start`,
  `more-ots-end`
- diagnostics : `more-copy-report`, `more-copy-journal`, `more-clear-journal`

Galerie de session (`SessionGallery`) et visionneuse (`MediaViewer`)
- `gallery-close`, `gallery-tab-${valeur}`, `gallery-cell-${index}`
- `viewer-close`, `viewer-share`, `viewer-play`, `viewer-prev`, `viewer-info`,
  `viewer-next`

Bandeau non supporte (`UnsupportedBanner`)
- `unsupported-banner`, `unsupported-copy`

## Flows de reference

### Install fraiche (critere d'acceptation #218)

```bash
adb install -r <app-debug.apk>      # ou: npx expo run:android --no-bundler
node scripts/e2e/ui.mjs onboard     # grant + launch + ferme l'onboarding
```

Le flow doit arriver sur un ecran camera (presence de `camera-shutter`) sans
aucune intervention.

Assertion fiable : une capture reussie fait apparaitre `camera-gallery-thumbnail`
(la vignette de session), puis une cellule `gallery-cell-N` dans la galerie. On
s'appuie sur ces signaux **in-app** plutot que sur un chemin fichier : l'ecriture
dans la pellicule publique (`/sdcard/Pictures/TwinLens`, `/sdcard/DCIM`) depend du
reglage « enregistrement » (apres un `pm clear`, le defaut est session seule).

### Smoke photo

```bash
node scripts/e2e/ui.mjs tap mode-photo
node scripts/e2e/ui.mjs tap camera-shutter
sleep 4
node scripts/e2e/ui.mjs exists camera-gallery-thumbnail && echo "photo capturee (session)"
```

### Smoke video

```bash
node scripts/e2e/ui.mjs tap mode-video
node scripts/e2e/ui.mjs tap camera-shutter   # demarre
sleep 3
node scripts/e2e/ui.mjs tap camera-shutter   # arrete
sleep 10                                      # laisser la composition PiP finir
# verifier dans la galerie de session (cellule presente)
node scripts/e2e/ui.mjs tap camera-gallery-thumbnail
node scripts/e2e/ui.mjs exists gallery-cell-0 && echo "capture presente en session"
node scripts/e2e/ui.mjs tap gallery-close
```

Pour verifier l'ecriture dans la pellicule, regler au prealable l'enregistrement
sur « galerie » (`setting-save-*` dans l'onglet Pro du sheet), puis chercher le
fichier (`Dual_PiP*.jpg` sous `Pictures/TwinLens`, `Dual_PiP*.mp4` sous `DCIM`).

## Pieges device connus

- **Ecran qui se verrouille** pendant un test long (voir #214, garder l'ecran
  allume quand le viseur est actif). Contournement : `adb shell input keyevent
  KEYCODE_WAKEUP` avant un flow.
- **versionCode downgrade** : un build debug est en versionCode 1, alors que le
  build Play installe est bien plus haut. `INSTALL_FAILED_VERSION_DOWNGRADE` =>
  desinstaller d'abord (`adb uninstall fr.devitek.twinlens`) puis reinstaller.
- **dump transitoire vide** pendant une transition d'ecran : le driver retente
  automatiquement (`waitFor`).
- **Permissions** : `onboard`/`grant` accordent camera + micro + notifications.
  La galerie (ecriture scoped MediaStore) et le geotag (localisation) ne sont pas
  requis pour le gate bloquant.

## Et Maestro

Les flows Maestro doivent cibler par `testID` (ids ci-dessus) plutot que par
coordonnees, et pre-accorder les permissions via `adb` au lieu de cliquer les
dialogues systeme. Le catalogue ci-dessus est la source commune driver + Maestro.
