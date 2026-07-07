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
  type PhotoOutputOptions,
  type Recorder,
  type Size,
  type TorchMode,
} from 'react-native-vision-camera';
// SDK 57 : `saveToLibraryAsync` du package racine est déprécié et THROW à
// l'exécution. On importe l'API legacy (voie officielle recommandée).
import { saveToLibraryAsync } from 'expo-media-library/legacy';

import { getFileSize, toFileUri } from '../utils/fileSystem';
import type { PipCorner } from '../services/pipComposer';

export type CameraSlot = 'back' | 'front';
export type MultiCamMode = 'multi' | 'single' | 'none';
export type MultiCamStatus = 'idle' | 'starting' | 'running' | 'error';
export type MediaKind = 'photo' | 'video';
/** Que sauvegarder après une capture. */
export type SaveMode = 'pip' | 'pip_plus_originals' | 'originals';
/** Niveau de qualité (résolutions capture + bitrate ré-encodage). */
export type CaptureQuality = 'standard' | 'high' | 'max';

export interface CapturedMedia {
  kind: MediaKind;
  /** URI (file://) du média de la caméra PRINCIPALE (plein écran). */
  primaryUri: string;
  /** URI du média de la caméra SECONDAIRE (vignette), ou null en mono. */
  secondaryUri: string | null;
  createdAt: number;
}

export interface Notice {
  /** identifiant unique (timestamp) pour re-déclencher l'affichage. */
  id: number;
  kind: 'success' | 'error';
  text: string;
}

export interface MultiCamSnapshot {
  status: MultiCamStatus;
  mode: MultiCamMode;
  isRecording: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  backPreview: CameraPreviewOutput | null;
  frontPreview: CameraPreviewOutput | null;
  hasTorch: boolean;
  lastCapture: CapturedMedia | null;
  /** Message transitoire (Snackbar) : confirmation ou erreur de capture/sauvegarde. */
  notice: Notice | null;
  photoSaveMode: SaveMode;
  videoSaveMode: SaveMode;
  /** Coin où placer la vignette (live + composition PiP). */
  pipCorner: PipCorner;
  /** Toutes les captures de la session courante (pour la galerie). */
  sessionCaptures: CapturedMedia[];
  /** Nombre de traitements (composition/sauvegarde) en cours en arrière-plan. */
  processingCount: number;
  captureQuality: CaptureQuality;
}

interface QualityConfig {
  photoRes: Size;
  videoRes: Size;
  /** bitrate de ré-encodage de la vidéo PiP composée (bits/s). */
  videoBitrate: number;
  /** largeur du canvas de composition PiP photo (px). */
  pipCanvas: number;
}

// NB : en multi-cam la bande passante ISP est partagée ; les vidéos restent ≤ 1080p.
const QUALITY: Record<CaptureQuality, QualityConfig> = {
  standard: { photoRes: { width: 1920, height: 1080 }, videoRes: { width: 1280, height: 720 }, videoBitrate: 10_000_000, pipCanvas: 1080 },
  high: { photoRes: { width: 1920, height: 1080 }, videoRes: { width: 1920, height: 1080 }, videoBitrate: 20_000_000, pipCanvas: 1440 },
  max: { photoRes: { width: 3840, height: 2160 }, videoRes: { width: 1920, height: 1080 }, videoBitrate: 30_000_000, pipCanvas: 1920 },
};

function photoOptions(res: Size): PhotoOutputOptions {
  return {
    targetResolution: res,
    containerFormat: 'jpeg',
    quality: 0.95,
    qualityPrioritization: 'quality',
  };
}

/** Largeur du canvas de composition PiP photo (view-shot) selon la qualité. */
export function pipCanvasForQuality(quality: CaptureQuality): number {
  return QUALITY[quality].pipCanvas;
}

const INITIAL: MultiCamSnapshot = {
  status: 'idle',
  mode: 'none',
  isRecording: false,
  isBusy: false,
  errorMessage: null,
  backPreview: null,
  frontPreview: null,
  hasTorch: false,
  lastCapture: null,
  notice: null,
  // PiP par défaut pour photo ET vidéo (composition on-device).
  // Repli automatique sur les originaux si le composeur n'est pas dispo.
  photoSaveMode: 'pip',
  videoSaveMode: 'pip',
  pipCorner: 'top-right',
  sessionCaptures: [],
  processingCount: 0,
  captureQuality: 'high',
};

/**
 * Gère une session VisionCamera v5 multi-caméra (front + back simultanés) avec
 * repli automatique en mono-caméra si le matériel ne supporte pas le multi-cam.
 *
 * Toute la logique native/impérative (Nitro) est isolée ici, hors de React.
 * Un unique {@link MultiCamSnapshot} immuable est publié aux abonnés
 * (consommé via `useSyncExternalStore`).
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

  /** Fonction de composition PiP (photo) injectée depuis React (view-shot). */
  private pipComposer: ((primaryUri: string, secondaryUri: string) => Promise<string>) | null = null;
  /** Fonction de composition PiP VIDÉO injectée depuis React (Foreground Service). */
  private videoComposer:
    | ((primaryUri: string, secondaryUri: string, corner: PipCorner, bitRate: number, saveOriginals: boolean) => Promise<string>)
    | null = null;
  /** Composeur PiP PHOTO natif (Foreground Service). Prioritaire sur pipComposer (view-shot). */
  private photoComposer:
    | ((primaryUri: string, secondaryUri: string, corner: PipCorner, canvasWidth: number, saveOriginals: boolean) => Promise<string>)
    | null = null;
  /** File sérialisant les traitements de fond (composition/sauvegarde). */
  private queue: Promise<void> = Promise.resolve();

  private readonly recorders: { back: Recorder | null; front: Recorder | null } = {
    back: null,
    front: null,
  };
  private recAgg = {
    expected: 0,
    settled: 0,
    backPath: null as string | null,
    frontPath: null as string | null,
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
    this.update({ notice: { id: Date.now(), kind, text } });
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
        this.notify('error', `Traitement échoué : ${(error as Error)?.message ?? error}`);
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

      if (VisionCamera.supportsMultiCamSessions) {
        const combo = factory.supportedMultiCamDeviceCombinations.find(
          (devices) =>
            devices.some((d) => d.position === 'back') &&
            devices.some((d) => d.position === 'front'),
        );
        if (combo != null) {
          backDevice = combo.find((d) => d.position === 'back');
          frontDevice = combo.find((d) => d.position === 'front');
          mode = 'multi';
        }
      }

      if (mode !== 'multi') {
        backDevice = factory.getDefaultCamera('back') ?? factory.getDefaultCamera('front');
        frontDevice = undefined;
        mode = backDevice != null ? 'single' : 'none';
      }

      if (backDevice == null) {
        this.update({ status: 'error', mode: 'none', errorMessage: 'Aucune caméra disponible.' });
        return;
      }

      const enableMultiCam = mode === 'multi' && frontDevice != null;
      this.session = await VisionCamera.createCameraSession(enableMultiCam);

      const backPreview = VisionCamera.createPreviewOutput();
      this.backPhoto = VisionCamera.createPhotoOutput(photoOptions(q.photoRes));
      this.backVideo = VisionCamera.createVideoOutput({ targetResolution: q.videoRes, enableAudio: true });

      const connections: CameraSessionConnection[] = [
        {
          input: backDevice,
          outputs: [
            { output: backPreview, mirrorMode: 'off' },
            { output: this.backPhoto, mirrorMode: 'off' },
            { output: this.backVideo, mirrorMode: 'off' },
          ],
          constraints: [],
        },
      ];

      let frontPreview: CameraPreviewOutput | null = null;
      if (enableMultiCam && frontDevice != null) {
        frontPreview = VisionCamera.createPreviewOutput();
        this.frontPhoto = VisionCamera.createPhotoOutput(photoOptions(q.photoRes));
        // audio désactivé sur la 2e caméra (une seule entrée micro à la fois).
        this.frontVideo = VisionCamera.createVideoOutput({ targetResolution: q.videoRes, enableAudio: false });
        connections.push({
          input: frontDevice,
          outputs: [
            { output: frontPreview, mirrorMode: 'on' },
            { output: this.frontPhoto, mirrorMode: 'off' },
            { output: this.frontVideo, mirrorMode: 'on' },
          ],
          constraints: [],
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

      this.update({
        status: 'running',
        mode: enableMultiCam ? 'multi' : 'single',
        backPreview,
        frontPreview,
        hasTorch: this.backController?.device.hasTorch ?? false,
      });
    } catch (error) {
      this.update({
        status: 'error',
        errorMessage: (error as Error)?.message ?? String(error),
      });
    }
  }

  async setActive(active: boolean): Promise<void> {
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
      this.notify('error', 'Qualité non supportée — retour au réglage précédent.');
      await this.teardownSession();
      await this.buildSession();
    }
  }

  setPrimarySlot(slot: CameraSlot): void {
    this.primarySlot = slot;
  }

  setPipComposer(fn: ((primaryUri: string, secondaryUri: string) => Promise<string>) | null): void {
    this.pipComposer = fn;
  }

  setVideoComposer(
    fn:
      | ((primaryUri: string, secondaryUri: string, corner: PipCorner, bitRate: number, saveOriginals: boolean) => Promise<string>)
      | null,
  ): void {
    this.videoComposer = fn;
  }

  setPhotoComposer(
    fn:
      | ((primaryUri: string, secondaryUri: string, corner: PipCorner, canvasWidth: number, saveOriginals: boolean) => Promise<string>)
      | null,
  ): void {
    this.photoComposer = fn;
  }

  setPhotoSaveMode(mode: SaveMode): void {
    this.update({ photoSaveMode: mode });
  }

  setVideoSaveMode(mode: SaveMode): void {
    this.update({ videoSaveMode: mode });
  }

  setPipCorner(corner: PipCorner): void {
    this.update({ pipCorner: corner });
  }

  private controllerFor(slot: CameraSlot): CameraController | null {
    return slot === 'back' ? this.backController : this.frontController;
  }

  // -------------------------------------------------------------- capture ----
  private async persist(filePath: string): Promise<string> {
    const uri = toFileUri(filePath);
    const size = getFileSize(uri);
    if (__DEV__) console.log('[multicam] saveToLibrary', uri, 'size=', size);
    // saveToLibraryAsync copie le fichier temporaire dans la pellicule (MediaStore).
    await saveToLibraryAsync(uri);
    return uri;
  }

  async capturePhoto(flash: FlashMode): Promise<void> {
    if (this.backPhoto == null || this.snapshot.isBusy || this.snapshot.isRecording) return;
    this.update({ isBusy: true });

    // 1) Capture BRUTE des deux photos EN PARALLÈLE — seule partie qui bloque
    //    l'obturateur (les capteurs doivent avoir figé l'image).
    let primaryPath: string;
    let secondaryPath: string | null = null;
    try {
      const primaryOutput = this.primarySlot === 'back' ? this.backPhoto : this.frontPhoto ?? this.backPhoto;
      const secondaryOutput = this.primarySlot === 'back' ? this.frontPhoto : this.backPhoto;
      const [primaryFile, secondaryFile] = await Promise.all([
        primaryOutput.capturePhotoToFile({ flashMode: flash }, {}),
        secondaryOutput != null
          ? secondaryOutput.capturePhotoToFile({ flashMode: 'off' }, {})
          : Promise.resolve(null),
      ]);
      primaryPath = primaryFile.filePath;
      secondaryPath = secondaryFile?.filePath ?? null;
    } catch (error) {
      this.notify('error', `Capture échouée : ${(error as Error)?.message ?? error}`);
      this.update({ isBusy: false });
      return;
    }

    // 2) Obturateur de nouveau disponible IMMÉDIATEMENT. Composition PiP +
    //    sauvegarde galerie partent en tâche de fond (UI réactive).
    this.update({ isBusy: false });

    const mode = this.snapshot.photoSaveMode;
    const corner = this.snapshot.pipCorner;
    const canvasWidth = QUALITY[this.snapshot.captureQuality].pipCanvas;
    const wantPip = mode !== 'originals';
    this.enqueue(async () => {
      // Chemin NATIF (Foreground Service, survit au kill) — prioritaire.
      if (wantPip && secondaryPath != null && this.photoComposer != null) {
        const saveOriginals = mode === 'pip_plus_originals';
        const savedUri = await this.photoComposer!(
          toFileUri(primaryPath),
          toFileUri(secondaryPath),
          corner,
          canvasWidth,
          saveOriginals,
        );
        this.pushCapture({
          kind: 'photo',
          primaryUri: savedUri,
          secondaryUri: saveOriginals ? toFileUri(secondaryPath) : null,
          createdAt: Date.now(),
        });
        this.notify('success', saveOriginals ? 'PiP + 2 photos enregistrés' : 'PiP enregistré');
        return;
      }

      // Repli view-shot (in-process) / originaux.
      const canPipJs = secondaryPath != null && this.pipComposer != null;
      const wantOriginals =
        mode === 'originals' || mode === 'pip_plus_originals' || (wantPip && !canPipJs);
      let pipUri: string | null = null;
      if (wantPip && canPipJs) {
        const composedPath = await this.pipComposer!(toFileUri(primaryPath), toFileUri(secondaryPath!));
        pipUri = await this.persist(composedPath);
      }
      let originalPrimaryUri: string | null = null;
      if (wantOriginals) {
        originalPrimaryUri = await this.persist(primaryPath);
        if (secondaryPath != null) await this.persist(secondaryPath);
      }
      const displayUri = pipUri ?? originalPrimaryUri ?? toFileUri(primaryPath);
      const secondaryUri = secondaryPath != null ? toFileUri(secondaryPath) : null;
      this.pushCapture({ kind: 'photo', primaryUri: displayUri, secondaryUri, createdAt: Date.now() });
      if (pipUri != null && wantOriginals) this.notify('success', 'PiP + 2 photos enregistrés');
      else if (pipUri != null) this.notify('success', 'PiP enregistré');
      else if (secondaryPath != null) this.notify('success', '2 photos enregistrées');
      else this.notify('success', 'Photo enregistrée');
    });
  }

  private commitRecordingIfDone(): void {
    if (this.recAgg.settled < this.recAgg.expected) return;
    // Rendre la main tout de suite (arrêt effectif) ...
    this.update({ isRecording: false, isBusy: false });
    this.recorders.back = null;
    this.recorders.front = null;

    const primaryPath = this.primarySlot === 'back' ? this.recAgg.backPath : this.recAgg.frontPath;
    const secondaryPath = this.primarySlot === 'back' ? this.recAgg.frontPath : this.recAgg.backPath;
    if (primaryPath == null) {
      this.notify('error', 'Aucune vidéo enregistrée.');
      return;
    }

    // ... puis composition (si un composeur vidéo est branché) + sauvegarde EN TÂCHE DE FOND.
    const mode = this.snapshot.videoSaveMode;
    const corner = this.snapshot.pipCorner;
    const bitRate = QUALITY[this.snapshot.captureQuality].videoBitrate;
    const wantPip = mode !== 'originals';
    const canPip = secondaryPath != null && this.videoComposer != null;
    this.enqueue(async () => {
      if (wantPip && canPip) {
        const saveOriginals = mode === 'pip_plus_originals';
        // Le composeur natif compose ET sauvegarde (Foreground Service) : URI galerie.
        const savedPipUri = await this.videoComposer!(
          toFileUri(primaryPath),
          toFileUri(secondaryPath!),
          corner,
          bitRate,
          saveOriginals,
        );
        this.pushCapture({
          kind: 'video',
          primaryUri: savedPipUri,
          secondaryUri: saveOriginals ? toFileUri(secondaryPath!) : null,
          createdAt: Date.now(),
        });
        this.notify('success', saveOriginals ? 'Vidéo PiP + 2 originaux enregistrés' : 'Vidéo PiP enregistrée');
      } else {
        // Mode originaux, ou pas de composeur natif -> sauvegarde JS des originaux.
        const primaryUri = await this.persist(primaryPath);
        const secondaryUri = secondaryPath != null ? await this.persist(secondaryPath) : null;
        this.pushCapture({ kind: 'video', primaryUri, secondaryUri, createdAt: Date.now() });
        this.notify(
          'success',
          secondaryPath != null
            ? wantPip
              ? '2 vidéos enregistrées (fusion PiP indisponible)'
              : '2 vidéos enregistrées'
            : 'Vidéo enregistrée',
        );
      }
    });
  }

  private makeRecordingCallbacks(slot: CameraSlot) {
    const onFinished = (filePath: string): void => {
      if (slot === 'back') this.recAgg.backPath = filePath;
      else this.recAgg.frontPath = filePath;
      this.recAgg.settled += 1;
      this.commitRecordingIfDone();
    };
    const onError = (error: Error): void => {
      this.recAgg.settled += 1;
      this.notify('error', `Enregistrement (${slot}) : ${error.message}`);
      this.commitRecordingIfDone();
    };
    return { onFinished, onError };
  }

  async startRecording(): Promise<void> {
    if (this.backVideo == null || this.snapshot.isRecording || this.snapshot.isBusy) return;
    this.recAgg = { expected: this.frontVideo != null ? 2 : 1, settled: 0, backPath: null, frontPath: null };
    this.update({ isRecording: true });
    try {
      this.recorders.back = await this.backVideo.createRecorder({});
      const back = this.makeRecordingCallbacks('back');
      await this.recorders.back.startRecording(back.onFinished, back.onError);

      if (this.frontVideo != null) {
        this.recorders.front = await this.frontVideo.createRecorder({});
        const front = this.makeRecordingCallbacks('front');
        await this.recorders.front.startRecording(front.onFinished, front.onError);
      }
    } catch (error) {
      this.update({ isRecording: false, errorMessage: (error as Error)?.message ?? 'Démarrage vidéo échoué' });
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.snapshot.isRecording) return;
    this.update({ isBusy: true });
    try {
      await this.recorders.back?.stopRecording();
      await this.recorders.front?.stopRecording();
    } catch {
      /* les callbacks onFinished finaliseront */
    }
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

  async focusAt(slot: CameraSlot, normalizedX: number, normalizedY: number): Promise<void> {
    try {
      const point = VisionCamera.createNormalizedMeteringPoint(normalizedX, normalizedY);
      await this.controllerFor(slot)?.focusTo(point, {});
    } catch {
      /* zone non focusable */
    }
  }
}

/** VisionCamera v5 est New-Arch / Nitro only — garde-fou. */
export const IS_MULTICAM_PLATFORM_SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';
