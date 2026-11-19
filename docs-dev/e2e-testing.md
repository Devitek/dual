# Tests e2e / pilotage device (TwinLens)

Runbook pour piloter l'app sur un device Android sans intervention humaine :
install fraiche, octroi des permissions, fermeture de l'onboarding, puis flows
photo et video. Voir issue #218 pour l'historique.

**Suites automatisees** : `node scripts/e2e/run.mjs` (issue #263), cas identifies
comme dans le **cahier de test** [`test-plan.md`](test-plan.md), qui couvre toute
l'app et la campagne de recette avant release.

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

Le dump uiautomator n'est **pas** vide sur l'ecran camera **au repos** : les
overlays RN (Pressables des controles) se rendent par-dessus la SurfaceView/GL et
apparaissent dans la hierarchie. Le ciblage par `testID` marche donc sur le
viseur (`camera-shutter`, `mode-video`, etc.).

**Mais pendant un enregistrement, le dump echoue a 100 %** (`ERROR: could not get
idle state` : le compteur REC et le point pulse emettent des evenements
d'accessibilite en continu ; animations systeme a 0, 1 reussite sur 3 seulement).
Et l'ancien driver relisait alors **en silence le dump precedent** (fichier non
reecrit) : etat perime, obturateur lu « Demarrer » alors qu'il enregistrait.
Corrige (#263) : dump frais ou erreur `UiNotIdleError`, jamais de lecture perimee,
et etat lu via des **temoins systeme** (ci-dessous).

## Driver : `scripts/e2e/lib/device.mjs` + CLI `scripts/e2e/ui.mjs`

```bash
# Flow install fraiche complet (accorde permissions + viseur pret)
node scripts/e2e/ui.mjs onboard

# Briques unitaires
node scripts/e2e/ui.mjs grant               # camera + micro + notifications
node scripts/e2e/ui.mjs launch              # (re)lance l'activite
node scripts/e2e/ui.mjs dump                # resource-id visibles (dump FRAIS)
node scripts/e2e/ui.mjs exists mode-video   # exit 0 present, 1 absent, 3 UI pas au repos
node scripts/e2e/ui.mjs wait camera-shutter # attend l'apparition
node scripts/e2e/ui.mjs tap mode-video      # attend puis tape le centre
node scripts/e2e/ui.mjs status              # temoins systeme (JSON)
```

Device multiple : `ADB_SERIAL=<serial> node scripts/e2e/ui.mjs ...`.

### Temoins systeme (independants de l'UI)

| Etat | Source | Fonction |
|---|---|---|
| Enregistrement en cours | `dumpsys audio` (RecordActivityMonitor : `active? true`, `CAMCORDER`, `pack:`) | `isRecording()` |
| Cameras reellement ouvertes (0 = session morte, cf. #222) | `dumpsys media.camera` (Active Camera Clients) | `openCameraClients()` |
| Composition en cours | `dumpsys activity services` (PipComposerService) | `isComposing()` |
| Ecran maintenu allume (#214) | `dumpsys window windows` (`KEEP_SCREEN_ON`) | `keepsScreenOn()` |
| Ecran / verrouillage | `dumpsys power` / `dumpsys window` | `isScreenOn()`, `isKeyguardShowing()` |
| Activite au premier plan | `dumpsys activity activities` | `topActivity()` |
| Medias de l'app | MediaStore `files`, `owner_package_name` ou `Dual_%`, `is_pending=0` | `mediaAddedSince()`, `waitMedia()` |
| Crash | `logcat -b crash` | `crashesSince()` |

### Runner : `scripts/e2e/run.mjs`

```bash
node scripts/e2e/run.mjs --list                  # suites et cas
node scripts/e2e/run.mjs                         # tout sauf les cas destructifs
node scripts/e2e/run.mjs --suite interruption    # une suite
node scripts/e2e/run.mjs --case INT-01,LCK-01    # des cas
node scripts/e2e/run.mjs --interactive           # cas avec action humaine (detectee, pas de touche)
node scripts/e2e/run.mjs --allow-destructive     # pm clear (vide AUSSI le cache de l'app)
```

Rapport (`report.md`, `report.json`, logcat filtre par cas, capture d'ecran des
cas non PASS) dans `/tmp/twinlens-e2e/<horodatage>/` (option `--report`). Les
medias crees par chaque cas sont supprimes apres coup (attente de la fin des
compositions). `--suite` et `--case` se combinent en ET.

## Catalogue des testID stables

Ecran permissions (`PermissionGate`)
- `permission-grant`, `permission-open-settings`

Onboarding / Nouveautes (`IntroSheet`)
- `onboarding-cta` (premiere ouverture), `whatsnew-cta` (apres mise a jour)

Barre de capture (`CaptureControls`)
- `camera-shutter`, `camera-flip`, `camera-settings-open`
- `camera-gallery-open` (session vide), `camera-gallery-thumbnail` (apres capture)
- `camera-rec-timer` (compteur, present seulement pendant un enregistrement video ;
  illisible tant que l'UI n'est pas au repos : preferer `isRecording()`)

Etats du viseur (#263)
- `camera-starting` (spinner de demarrage de session, `MultiCamPreview`)
- `camera-error`, `camera-error-retry`, `camera-error-settings` (`CameraErrorView`)
- `processing-indicator` (traitement en tache de fond, `ProcessingIndicator`)
- `snackbar-success` / `snackbar-error` + `snackbar-text` (message, `Snackbar`)

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

## Verifier un media compose (LE piege majeur, vecu sur #174)

Apres le stop d'une video, la composition PiP tourne **10 a 20 s** dans le
Foreground Service avant que le fichier n'arrive dans MediaStore. Consequence :
`sleep N` puis « prendre la video la plus recente » recupere la sortie du test
**PRECEDENT** (verifie 4 fois sur 4 lors de l'audit #174 : chaque pull etait en
retard d'un test, ce qui a fabrique des bugs fantomes).

Protocole fiable :

```bash
STOP_MS=$(( $(adb shell date +%s) * 1000 ))   # heure DEVICE du stop, AVANT le tap stop
node scripts/e2e/ui.mjs tap camera-shutter    # stop
node scripts/e2e/ui.mjs media-since $STOP_MS  # bloque jusqu'au NOUVEAU media de l'app, imprime son chemin
```

Dans le runner, c'est `stopRecording()` (heure prise avant le tap) puis
`waitMedia(stop)`. Une composition dure environ la duree du clip (4 min de video =
plus de 4 min de composition) : prevoir des timeouts en consequence.

Controles d'identite complementaires :
- le nom `Dual_PiP_<epochMillis>.mp4` encode l'heure de DEBUT de la composition :
  le decoder et le comparer a l'heure du test ;
- une horloge visible dans le champ (ecran connecte...) est un excellent temoin.

### Demarrage d'enregistrement : warm-up

Le premier tap sur l'obturateur apres ouverture d'app ou bascule de mode peut ne
pas declencher (camera pas prete). Verifier l'etat reel plutot que supposer :

Ne **pas** se fier au `desc` de l'obturateur (l'UI n'est plus dumpable des que
l'enregistrement tourne) : prouver l'etat par le temoin systeme. C'est ce que fait
`startRecording()` (tap, puis `isRecording()` jusqu'a 5 s, 3 tentatives) ; pour
arreter, `stopRecording()` tape a la **position memorisee** de l'obturateur
(`tapCached`), puisque le dump echoue pendant l'enregistrement.

### Orientation video : convention de signes ffprobe

`MediaMuxer.setOrientationHint(x)` s'affiche dans ffprobe comme une rotation de
displaymatrix **anti-horaire** : hint 270 -> `rotation=90` ; hint 90 ->
`rotation=-90`. Ne jamais comparer le hint au champ ffprobe sans cette table.
L'extraction de frame fidele au rendu lecteur = `ffmpeg` SANS `-noautorotate`.

## Pieges device connus

- **Ecran qui se verrouille** pendant un test long (voir #214, garder l'ecran
  allume quand le viseur est actif). Contournement : `adb shell input keyevent
  KEYCODE_WAKEUP` avant un flow.
- **versionCode downgrade** : un build debug est en versionCode 1, alors que le
  build Play installe est bien plus haut. `INSTALL_FAILED_VERSION_DOWNGRADE` =>
  desinstaller d'abord (`adb uninstall fr.devitek.twinlens`) puis reinstaller.
- **dump transitoire vide** pendant une transition d'ecran : le driver retente
  automatiquement (`waitFor`).
- **Relancer une activite deja au premier plan** (`am start`, singleTask) peut la
  mettre en pause/reprise et fermer les cameras : `ensureViewfinder()` ne lance
  que si l'app n'est pas deja au premier plan (vecu #263, CAP-02).
- **`adb shell` dans une boucle `while read`** consomme le stdin de la boucle (seule
  la 1re ligne est traitee) : toujours `adb ... </dev/null`. La lib passe par
  `execFileSync` (stdin ignore), sans shell local.
- **Refus d'Android reproductible** (astuce de @the40n8, #244) : forcer le delai de
  grace a 0 rend systematique le refus de demarrer un Foreground Service depuis
  l'arriere-plan. `adb shell device_config put activity_manager
  fg_to_bg_fgs_grace_duration 0`, puis **toujours** remettre le defaut :
  `adb shell device_config delete activity_manager fg_to_bg_fgs_grace_duration`
  (INT-06 le fait dans un `finally`).
- **Animations systeme** : si on les modifie pour un test, sauvegarder puis
  restaurer explicitement les trois cles (`window_animation_scale`,
  `transition_animation_scale`, `animator_duration_scale`).
- **Permissions** : `onboard`/`grant` accordent camera + micro + notifications.
  La galerie (ecriture scoped MediaStore) et le geotag (localisation) ne sont pas
  requis pour le gate bloquant.

## Et Maestro

Les flows Maestro doivent cibler par `testID` (ids ci-dessus) plutot que par
coordonnees, et pre-accorder les permissions via `adb` au lieu de cliquer les
dialogues systeme. Le catalogue ci-dessus est la source commune driver + Maestro.
