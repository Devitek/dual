import { Platform } from 'react-native';
import {
  VisionCamera,
  type CameraController,
  type CameraDevice,
  type CameraPhotoOutput,
  type CameraPreviewOutput,
  type CameraSession,
  type CameraSessionConnection,
  type CameraVideoOutput,
  type FlashMode,
  type TorchMode,
} from 'react-native-vision-camera';
// SDK 57 : `saveToLibraryAsync` du package racine est déprécié et THROW à
// l'exécution. On importe l'API legacy (voie officielle recommandée).
import { saveToLibraryAsync } from 'expo-media-library/legacy';
import * as MediaLibrary from 'expo-media-library';

import { getFileSize, toFileUri } from '../utils/fileSystem';
import { recordError } from '../utils/crashJournal';
import type {
  CompositionLayout,
  OutputRatio,
  PhotoComposeOptions,
  PipCorner,
  PipInset,
  VideoComposeOptions,
} from '../services/pipComposer';
import { writeGpsToJpeg, type GpsCoords } from '../services/exifGps';
import i18n from '../i18n';

import { INITIAL } from './types';
import type {
  CameraSlot,
  CapturedMedia,
  CaptureQuality,
  CaptureSpeed,
  MultiCamMode,
  MultiCamSnapshot,
  SaveMode,
  VideoFps,
} from './types';
import type { ActiveRecorders, CaptureContext, RecordingAggregate } from './capture/context';
import { QUALITY, photoOptions } from './capture/quality';
import { capturePhoto as capturePhotoImpl } from './capture/photoCapture';
import { captureSequentialPhoto as captureSequentialPhotoImpl } from './capture/sequentialCapture';
import { startRecording as startRecordingImpl, stopRecording as stopRecordingImpl } from './capture/recording';

// Types partagés : définis dans ./types (issue #148, étape C) et ré-exportés
// ici pour ne pas casser les imports existants (composants, hooks, services).
export type {
  CameraSlot,
  CaptureQuality,
  CaptureSpeed,
  CapturedMedia,
  MediaKind,
  MultiCamDiagnostics,
  MultiCamMode,
  MultiCamSnapshot,
  MultiCamStatus,
  Notice,
  SaveMode,
  VideoFps,
} from './types';
// Idem : la config qualité vit dans ./capture/quality, ré-export de compatibilité.
export { pipCanvasForQuality } from './capture/quality';

// ⚠️ DEV UNIQUEMENT — SIMULATEUR « appareil sans concurrent-camera ».
// Mets `true` pour FORCER le mode séquentiel sur un téléphone qui, lui, supporte
// le multi-cam : permet de tester le repli (photo séquentielle + vidéo bloquée +
// bulle d'info) en local, comme sur un Oppo Reno12 5G.
// ⚠️ REPASSER À `false` AVANT MERGE. Sans effet en production (gardé par __DEV__).
const DEV_FORCE_SEQUENTIAL = false;

/**
 * Gère une session VisionCamera v5 multi-caméra (front + back simultanés) avec
 * repli automatique en mono-caméra si le matériel ne supporte pas le multi-cam.
 *
 * Toute la logique native/impérative (Nitro) est isolée ici, hors de React.
 * Un unique {@link MultiCamSnapshot} immuable est publié aux abonnés
 * (consommé via `useSyncExternalStore`).
 *
 * Les pipelines de capture (photo simultanée, photo séquentielle, sauvegarde,
 * enregistrement vidéo) vivent dans `src/vision/capture/*` : les méthodes
 * publiques correspondantes délèguent via un {@link CaptureContext}.
 */
export class MultiCamController {
  private snapshot: MultiCamSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();

  private session: CameraSession | null = null;
  private backController: CameraController | null = null;
  private frontController: CameraController | null = null;
  private backPhoto: CameraPhotoOutput | null = null;
  private frontPhoto: CameraPhotoOutput | null = null;
  private backVideo: CameraVideoOutput | null = null;
  private frontVideo: CameraVideoOutput | null = null;

  private primarySlot: CameraSlot = 'back';
  private disposed = false;
  /** Un (seul) réessai automatique par épisode d'échec d'ouverture caméra. */
  private autoRetryDone = false;
  /** Devices mémorisés pour la capture PHOTO séquentielle (mode `sequential`). */
  private sequentialBack: CameraDevice | undefined;
  private sequentialFront: CameraDevice | undefined;
  /** Mode boomerang : le prochain enregistrement sera post-traité en boomerang. */
  private boomerangMode = false;
  /** Dernier point de mise au point (normalisé) — sert d'ancrage au verrou AE/AF. */
  private lastFocus = { x: 0.5, y: 0.5 };

  /** Fonction de composition PiP (photo) injectée depuis React (view-shot). */
  private pipComposer: ((primaryUri: string, secondaryUri: string) => Promise<string>) | null = null;
  /** Fonction de composition PiP VIDÉO injectée depuis React (Foreground Service). */
  private videoComposer:
    ((primaryUri: string, secondaryUri: string, opts: VideoComposeOptions) => Promise<string>) | null = null;
  /** Composeur PiP PHOTO natif (Foreground Service). Prioritaire sur pipComposer (view-shot). */
  private photoComposer:
    ((primaryUri: string, secondaryUri: string, opts: PhotoComposeOptions) => Promise<string>) | null = null;
  /** File sérialisant les traitements de fond (composition/sauvegarde). */
  private queue: Promise<void> = Promise.resolve();
  /** Fournisseur de position (cache) injecté depuis React (géotag opt-in). */
  private locationProvider: (() => GpsCoords | null) | null = null;

  private readonly recorders: ActiveRecorders = { back: null, front: null };
  private recAgg: RecordingAggregate = { expected: 0, settled: 0, backPath: null, frontPath: null };
  /** Horodatage de début d'enregistrement (pour estimer la durée). */
  private recStartedAt = 0;

  /**
   * Contexte passé aux modules de capture (src/vision/capture/*) : expose les
   * accès nécessaires (snapshot, mutations, sorties caméra, composeurs) sans
   * rendre publics les champs privés du contrôleur.
   */
  private readonly ctx: CaptureContext = {
    getSnapshot: () => this.snapshot,
    update: (patch) => this.update(patch),
    notify: (kind, text) => this.notify(kind, text),
    pushCapture: (capture) => this.pushCapture(capture),
    enqueue: (job) => this.enqueue(job),
    persist: (filePath) => this.persist(filePath),
    stampGps: (fileUri, coords) => this.stampGps(fileUri, coords),
    getQuality: () => QUALITY[this.snapshot.captureQuality],
    getPrimarySlot: () => this.primarySlot,
    isDisposed: () => this.disposed,
    getBoomerangMode: () => this.boomerangMode,
    getSequentialFront: () => this.sequentialFront,
    getBackPhoto: () => this.backPhoto,
    getFrontPhoto: () => this.frontPhoto,
    setFrontPhoto: (output) => {
      this.frontPhoto = output;
    },
    getBackVideo: () => this.backVideo,
    getFrontVideo: () => this.frontVideo,
    setSession: (session) => {
      this.session = session;
    },
    setFrontController: (controller) => {
      this.frontController = controller;
    },
    teardownSession: () => this.teardownSession(),
    buildSession: () => this.buildSession(),
    getPipComposer: () => this.pipComposer,
    getPhotoComposer: () => this.photoComposer,
    getVideoComposer: () => this.videoComposer,
    getLocationProvider: () => this.locationProvider,
    getRecorders: () => this.recorders,
    getRecAgg: () => this.recAgg,
    setRecAgg: (agg) => {
      this.recAgg = agg;
    },
    getRecStartedAt: () => this.recStartedAt,
    setRecStartedAt: (timestamp) => {
      this.recStartedAt = timestamp;
    },
  };

  // ---------------------------------------------------------------- store ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MultiCamSnapshot => this.snapshot;

  private update(patch: Partial<MultiCamSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private notify(kind: 'success' | 'error', text: string): void {
    // Toute erreur montrée à l'utilisateur est journalisée LOCALEMENT (ADR 0007)
    // → copiable depuis Aide & diagnostic pour le support.
    if (kind === 'error') recordError(text, { context: 'notice' });
    this.update({ notice: { id: Date.now(), kind, text } });
  }

  /** Affiche un message transitoire (Snackbar) depuis React (ex. permission refusée). */
  showNotice(kind: 'success' | 'error', text: string): void {
    this.notify(kind, text);
  }

  private pushCapture(capture: CapturedMedia): void {
    this.update({
      lastCapture: capture,
      sessionCaptures: [...this.snapshot.sessionCaptures, capture],
    });
  }

  /** Sérialise un traitement de fond et suit son avancement (processingCount). */
  private enqueue(job: () => Promise<void>): void {
    this.update({ processingCount: this.snapshot.processingCount + 1 });
    this.queue = this.queue
      .then(job)
      .catch((error) => {
        this.notify('error', i18n.t('notices.processingFailed', { error: (error as Error)?.message ?? String(error) }));
      })
      .finally(() => {
        this.update({ processingCount: Math.max(0, this.snapshot.processingCount - 1) });
      });
  }

  // ----------------------------------------------------------- lifecycle ----
  async init(): Promise<void> {
    if (this.session != null || this.disposed) return;
    await this.buildSession();
  }

  /** (Re)construit la session avec la qualité courante. */
  private async buildSession(): Promise<void> {
    if (this.disposed) return;
    this.update({ status: 'starting', errorMessage: null });
    const q = QUALITY[this.snapshot.captureQuality];

    try {
      const factory = await VisionCamera.createDeviceFactory();
      let mode: MultiCamMode = 'none';
      let backDevice: CameraDevice | undefined;
      let frontDevice: CameraDevice | undefined;

      // DEV : simule un appareil sans concurrent-camera (test du repli séquentiel).
      const forceSequential = __DEV__ && DEV_FORCE_SEQUENTIAL;
      if (forceSequential) {
        console.warn('[multicam] DEV_FORCE_SEQUENTIAL actif — multi-cam simulé indisponible.');
      }

      // Détection multi-cam : les deux portes ci-dessous sont purement
      // DÉCLARATIVES côté OEM (FEATURE_CAMERA_CONCURRENT puis
      // getConcurrentCameraIds via CameraX). On mémorise le résultat pour le
      // diagnostic utilisateur ; une app tierce ne peut rien forcer.
      const concurrentFeature = !forceSequential && VisionCamera.supportsMultiCamSessions;
      let comboCount = 0;

      if (concurrentFeature) {
        const combos = factory.supportedMultiCamDeviceCombinations;
        comboCount = combos.length;
        const combo = combos.find(
          (devices) => devices.some((d) => d.position === 'back') && devices.some((d) => d.position === 'front'),
        );
        if (combo != null) {
          backDevice = combo.find((d) => d.position === 'back');
          frontDevice = combo.find((d) => d.position === 'front');
          mode = 'multi';
        }
      }

      this.update({
        diagnostics: { concurrentFeature, comboCount, frontBackCombo: mode === 'multi' },
      });

      if (mode !== 'multi') {
        // Pas de session concurrente : on garde l'ARRIÈRE comme aperçu principal.
        // Si l'AVANT existe aussi, on active le mode `sequential` (photo en deux
        // temps) ; sinon `single` (un seul capteur, pas de dual possible).
        const back = factory.getDefaultCamera('back');
        const front = factory.getDefaultCamera('front');
        this.sequentialBack = back ?? undefined;
        this.sequentialFront = front ?? undefined;
        backDevice = back ?? front;
        frontDevice = undefined;
        if (backDevice == null) {
          mode = 'none';
        } else if (back != null && front != null) {
          mode = 'sequential';
        } else {
          mode = 'single';
        }
      }

      if (backDevice == null) {
        this.update({ status: 'error', mode: 'none', errorMessage: i18n.t('notices.noCamera') });
        return;
      }

      const enableMultiCam = mode === 'multi' && frontDevice != null;
      this.session = await VisionCamera.createCameraSession(enableMultiCam);

      const backPreview = VisionCamera.createPreviewOutput();
      this.backPhoto = VisionCamera.createPhotoOutput(photoOptions(q.photoRes, this.snapshot.captureSpeed));
      this.backVideo = VisionCamera.createVideoOutput({ targetResolution: q.videoRes, enableAudio: true });

      // Cadence vidéo : 60 ips demandé via une contrainte FPS (négociée par la
      // session ; si le device/la combinaison multi-cam ne la supporte pas, le
      // repli est géré par setVideoFps).
      const fpsConstraints = this.snapshot.videoFps !== 30 ? [{ fps: this.snapshot.videoFps }] : [];

      const connections: CameraSessionConnection[] = [
        {
          input: backDevice,
          outputs: [
            { output: backPreview, mirrorMode: 'off' },
            { output: this.backPhoto, mirrorMode: 'off' },
            { output: this.backVideo, mirrorMode: 'off' },
          ],
          constraints: [...fpsConstraints],
        },
      ];

      let frontPreview: CameraPreviewOutput | null = null;
      if (enableMultiCam && frontDevice != null) {
        frontPreview = VisionCamera.createPreviewOutput();
        this.frontPhoto = VisionCamera.createPhotoOutput(photoOptions(q.photoRes, this.snapshot.captureSpeed));
        // audio désactivé sur la 2e caméra (une seule entrée micro à la fois).
        this.frontVideo = VisionCamera.createVideoOutput({ targetResolution: q.videoRes, enableAudio: false });
        connections.push({
          input: frontDevice,
          outputs: [
            // Aperçu TOUJOURS en miroir (vue selfie). La SAUVEGARDE (photo+vidéo)
            // suit le réglage : miroir (= comme l'aperçu) ou orientation réelle.
            { output: frontPreview, mirrorMode: 'on' },
            { output: this.frontPhoto, mirrorMode: this.snapshot.mirrorFront ? 'on' : 'off' },
            { output: this.frontVideo, mirrorMode: this.snapshot.mirrorFront ? 'on' : 'off' },
          ],
          constraints: [...fpsConstraints],
        });
      }

      const controllers = await this.session.configure(connections);
      this.backController = controllers[0] ?? null;
      this.frontController = controllers[1] ?? null;

      if (this.disposed) {
        await this.session.stop();
        return;
      }

      await this.session.start();

      this.autoRetryDone = false; // session OK → réarme le réessai auto
      this.update({
        status: 'running',
        // `mode` a été déterminé plus haut (multi / sequential / single).
        mode,
        backPreview,
        frontPreview,
        hasTorch: this.backController?.device.hasTorch ?? false,
      });
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      recordError(message, { context: 'camera-open' });
      this.update({ status: 'error', errorMessage: message });
      // Kill + relance ÉCLAIR de l'app : le handle caméra du process précédent
      // n'est pas toujours libéré par le HAL au moment où on rouvre (caméra
      // « in use » → aperçu noir / échec). Un unique réessai différé suffit
      // dans la grande majorité des cas ; sinon l'écran d'erreur (bouton
      // Réessayer) et la reprise au foreground (setActive) prennent le relais.
      if (!this.disposed && !this.autoRetryDone) {
        this.autoRetryDone = true;
        setTimeout(() => {
          if (!this.disposed && this.snapshot.status === 'error') void this.retry();
        }, 1500);
      }
    }
  }

  async setActive(active: boolean): Promise<void> {
    // Retour au premier plan avec une session en échec (ex. caméra volée par
    // une autre app, ou échec d'ouverture au lancement) → reconstruction
    // complète : plus besoin d'ouvrir l'app photo native pour « réveiller »
    // les caméras.
    if (active && this.snapshot.status === 'error' && !this.disposed) {
      await this.retry();
      return;
    }
    const session = this.session;
    if (session == null) return;
    try {
      if (active && !session.isRunning) await session.start();
      else if (!active && session.isRunning) await session.stop();
    } catch {
      // start/stop peut échouer pendant une transition — non bloquant
    }
  }

  private async teardownSession(): Promise<void> {
    try {
      await this.session?.stop();
    } catch {
      /* noop */
    }
    this.session = null;
    this.backController = null;
    this.frontController = null;
    this.backPhoto = null;
    this.frontPhoto = null;
    this.backVideo = null;
    this.frontVideo = null;
    // NB : on ne touche PAS à `hasTorch` ici — la capacité torche/flash ne change
    // pas entre deux qualités (même caméra). Sinon les réglages de flash clignotent.
    this.update({ backPreview: null, frontPreview: null });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.teardownSession();
  }

  /** Reconstruit la session après une erreur (bouton « Réessayer »). */
  async retry(): Promise<void> {
    if (this.disposed) return;
    await this.teardownSession();
    await this.buildSession();
  }

  /** Change la qualité : reconfigure la session (résolutions) si elle tourne. */
  async setQuality(quality: CaptureQuality): Promise<void> {
    const previous = this.snapshot.captureQuality;
    if (quality === previous) return;
    this.update({ captureQuality: quality });
    if (this.disposed || this.session == null) return;
    await this.teardownSession();
    await this.buildSession();
    // Certaines résolutions (ex. photo 4K en multi-cam) peuvent échouer à se
    // configurer -> on revient au réglage précédent qui fonctionnait.
    if (this.snapshot.status === 'error' && !this.disposed) {
      this.update({ captureQuality: previous });
      this.notify('error', i18n.t('notices.qualityUnsupported'));
      await this.teardownSession();
      await this.buildSession();
    }
  }

  /**
   * Change le compromis vitesse/qualité de la capture photo. Comme
   * `qualityPrioritization` est fixé à la création de l'output, on reconfigure
   * la session (repli sur le réglage précédent si le device refuse — ex. certains
   * capteurs ne supportent pas `'speed'`).
   */
  async setCaptureSpeed(speed: CaptureSpeed): Promise<void> {
    const previous = this.snapshot.captureSpeed;
    if (speed === previous) return;
    this.update({ captureSpeed: speed });
    if (this.disposed || this.session == null) return;
    await this.teardownSession();
    await this.buildSession();
    if (this.snapshot.status === 'error' && !this.disposed) {
      this.update({ captureSpeed: previous });
      this.notify('error', i18n.t('notices.speedUnsupported'));
      await this.teardownSession();
      await this.buildSession();
    }
  }

  /**
   * Change la cadence vidéo (30/60 ips). Reconfigure la session ; si la
   * combinaison (souvent 60 ips en multi-cam) n'est pas supportée, repli
   * automatique sur la valeur précédente.
   */
  async setVideoFps(fps: VideoFps): Promise<void> {
    const previous = this.snapshot.videoFps;
    if (fps === previous) return;
    this.update({ videoFps: fps });
    if (this.disposed || this.session == null) return;
    await this.teardownSession();
    await this.buildSession();
    if (this.snapshot.status === 'error' && !this.disposed) {
      this.update({ videoFps: previous });
      this.notify('error', i18n.t('notices.fpsUnsupported'));
      await this.teardownSession();
      await this.buildSession();
    }
  }

  /**
   * Miroir de la caméra avant à la sauvegarde. `mirrorMode` est figé à la
   * configuration des sorties -> on reconfigure la session (l'aperçu, lui, reste
   * toujours en miroir). Sans repli : un simple flag de miroir ne peut pas échouer.
   */
  async setMirrorFront(value: boolean): Promise<void> {
    if (value === this.snapshot.mirrorFront) return;
    this.update({ mirrorFront: value });
    if (this.disposed || this.session == null) return;
    await this.teardownSession();
    await this.buildSession();
  }

  /** Active/désactive le son d'obturateur système (appliqué à la prochaine prise). */
  setShutterSound(value: boolean): void {
    this.update({ shutterSound: value });
  }

  setPrimarySlot(slot: CameraSlot): void {
    this.primarySlot = slot;
  }

  setPipComposer(fn: ((primaryUri: string, secondaryUri: string) => Promise<string>) | null): void {
    this.pipComposer = fn;
  }

  setVideoComposer(
    fn: ((primaryUri: string, secondaryUri: string, opts: VideoComposeOptions) => Promise<string>) | null,
  ): void {
    this.videoComposer = fn;
  }

  setPhotoComposer(
    fn: ((primaryUri: string, secondaryUri: string, opts: PhotoComposeOptions) => Promise<string>) | null,
  ): void {
    this.photoComposer = fn;
  }

  setPhotoSaveMode(mode: SaveMode): void {
    this.update({ photoSaveMode: mode });
  }

  setVideoSaveMode(mode: SaveMode): void {
    this.update({ videoSaveMode: mode });
  }

  /** Choisir un coin réinitialise la position libre de la vignette. */
  setPipCorner(corner: PipCorner): void {
    this.update({ pipCorner: corner, pipInset: null });
  }

  /** Position/taille libre de la vignette (drag/pinch). `null` = revenir au coin. */
  setPipInset(inset: PipInset | null): void {
    this.update({ pipInset: inset });
  }

  /** Active/désactive le filigrane « TwinLens » sur la composition. */
  setWatermark(value: boolean): void {
    this.update({ watermark: value });
  }

  /** Change le ratio du cadre de sortie pour la disposition `pip`. */
  setOutputRatio(value: OutputRatio): void {
    this.update({ outputRatio: value });
  }

  /** Active le mode boomerang (le prochain enregistrement sera bouclé avant/arrière). */
  setBoomerangMode(value: boolean): void {
    this.boomerangMode = value;
  }

  /** Choix du format du boomerang : GIF animé (true) ou MP4 (false). */
  setBoomerangGif(value: boolean): void {
    this.update({ boomerangGif: value });
  }

  /** Change la disposition de fusion photo (pip / sideBySide / topBottom). */
  setLayout(layout: CompositionLayout): void {
    this.update({ layout });
  }

  /** Active/désactive l'aperçu live de la 2e caméra (« mode surprise »). */
  setShowSecondaryPreview(value: boolean): void {
    this.update({ showSecondaryPreview: value });
  }

  /** Active/désactive l'inscription de la localisation (GPS EXIF) dans les photos. */
  setGeotag(value: boolean): void {
    this.update({ geotag: value });
  }

  /** Injecte le fournisseur de position (cache) pour le géotag. */
  setLocationProvider(fn: (() => GpsCoords | null) | null): void {
    this.locationProvider = fn;
  }

  /** Inscrit la position dans l'EXIF d'un JPEG (best-effort, jamais bloquant). */
  private async stampGps(fileUri: string, coords: GpsCoords | null): Promise<void> {
    if (coords == null) return;
    try {
      await writeGpsToJpeg(fileUri, coords);
    } catch {
      /* géotag best-effort : ne jamais faire échouer la sauvegarde */
    }
  }

  /**
   * Retire une capture de la session ET tente sa suppression de la galerie
   * (best-effort : l'URI peut être un fichier temporaire non indexé).
   */
  async removeCapture(capture: CapturedMedia): Promise<void> {
    const remaining = this.snapshot.sessionCaptures.filter((c) => c !== capture);
    const lastCapture =
      this.snapshot.lastCapture === capture
        ? remaining.length > 0
          ? (remaining[remaining.length - 1] ?? null)
          : null
        : this.snapshot.lastCapture;
    this.update({ sessionCaptures: remaining, lastCapture });

    try {
      const assets: string[] = [capture.primaryUri];
      if (capture.secondaryUri != null) assets.push(capture.secondaryUri);
      await MediaLibrary.deleteAssetsAsync(assets);
    } catch {
      /* URI non indexée (fichier temporaire) — retrait de session déjà fait */
    }
  }

  private controllerFor(slot: CameraSlot): CameraController | null {
    return slot === 'back' ? this.backController : this.frontController;
  }

  // -------------------------------------------------------------- capture ----
  // Les pipelines vivent dans src/vision/capture/* : fines délégations ici.
  private async persist(filePath: string): Promise<string> {
    const uri = toFileUri(filePath);
    const size = getFileSize(uri);
    if (__DEV__) console.log('[multicam] saveToLibrary', uri, 'size=', size);
    // saveToLibraryAsync copie le fichier temporaire dans la pellicule (MediaStore).
    await saveToLibraryAsync(uri);
    return uri;
  }

  /** Capture photo (simultanée, ou séquentielle en repli). Voir capture/photoCapture. */
  async capturePhoto(flash: FlashMode): Promise<void> {
    await capturePhotoImpl(this.ctx, flash);
  }

  /** Capture photo en deux temps (sans concurrent-camera). Voir capture/sequentialCapture. */
  async captureSequentialPhoto(flash: FlashMode): Promise<void> {
    await captureSequentialPhotoImpl(this.ctx, flash);
  }

  /** Démarre l'enregistrement vidéo (double recorder). Voir capture/recording. */
  async startRecording(): Promise<void> {
    await startRecordingImpl(this.ctx);
  }

  /** Arrête l'enregistrement ; la finalisation passe par les callbacks. Voir capture/recording. */
  async stopRecording(): Promise<void> {
    await stopRecordingImpl(this.ctx);
  }

  // ------------------------------------------------------------- controls ----
  async setTorch(slot: CameraSlot, mode: TorchMode): Promise<void> {
    try {
      await this.controllerFor(slot)?.setTorchMode(mode);
    } catch {
      /* device sans torch */
    }
  }

  async setZoom(slot: CameraSlot, zoom: number): Promise<void> {
    try {
      await this.controllerFor(slot)?.setZoom(zoom);
    } catch {
      /* hors bornes */
    }
  }

  getZoomBounds(slot: CameraSlot): { min: number; max: number; current: number } {
    const c = this.controllerFor(slot);
    return { min: c?.minZoom ?? 1, max: c?.maxZoom ?? 1, current: c?.zoom ?? 1 };
  }

  /** Bornes de compensation d'exposition (EV) de la caméra principale. */
  getExposureBounds(): { min: number; max: number; supported: boolean } {
    const dev = this.backController?.device;
    if (dev == null || !dev.supportsExposureBias) return { min: 0, max: 0, supported: false };
    return { min: dev.minExposureBias, max: dev.maxExposureBias, supported: dev.maxExposureBias > dev.minExposureBias };
  }

  /**
   * Règle la compensation d'exposition (EV) sur LES DEUX caméras (rendu composé
   * homogène). Transitoire : jamais persisté (réinitialisé à 0 au lancement, comme
   * la torche). Ignore silencieusement les caméras qui ne supportent pas.
   */
  async setExposureBias(value: number): Promise<void> {
    const { min, max, supported } = this.getExposureBounds();
    if (!supported) return;
    const v = Math.min(max, Math.max(min, value));
    this.update({ exposureBias: v });
    await Promise.all([
      this.backController?.setExposureBias(v).catch(() => {}),
      this.frontController?.setExposureBias(v).catch(() => {}),
    ]);
  }

  async focusAt(slot: CameraSlot, normalizedX: number, normalizedY: number): Promise<void> {
    try {
      this.lastFocus = { x: normalizedX, y: normalizedY };
      const point = VisionCamera.createNormalizedMeteringPoint(normalizedX, normalizedY);
      await this.controllerFor(slot)?.focusTo(point, {});
      // Un nouveau point de mise au point (continu) rompt un éventuel verrou AE/AF.
      if (this.snapshot.aeLocked) this.update({ aeLocked: false });
    } catch {
      /* zone non focusable */
    }
  }

  /**
   * Verrou / déverrouillage AE/AF (exposition + mise au point figées) sur la
   * caméra principale, au dernier point de mise au point (centre par défaut).
   * Transitoire (non persisté).
   */
  async setAeLock(locked: boolean): Promise<void> {
    const c = this.controllerFor(this.primarySlot);
    if (c == null) return;
    try {
      if (locked) {
        const { x, y } = this.lastFocus;
        const point = VisionCamera.createNormalizedMeteringPoint(x, y);
        await c.focusTo(point, { adaptiveness: 'locked', autoResetAfter: null });
      } else {
        await c.resetFocus();
      }
      this.update({ aeLocked: locked });
    } catch {
      /* non supporté */
    }
  }
}

/** VisionCamera v5 est New-Arch / Nitro only — garde-fou. */
export const IS_MULTICAM_PLATFORM_SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';
