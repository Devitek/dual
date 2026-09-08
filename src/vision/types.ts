// Types partagés du sous-système multi-caméra + snapshot initial.
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification. MultiCamController.ts ré-exporte ces types pour ne pas
// casser les imports existants (composants, hooks, services).
import type { CameraPreviewOutput } from 'react-native-vision-camera';

import type { CompositionLayout, OutputRatio, PipCorner, PipInset } from '../services/pipComposer';

export type CameraSlot = 'back' | 'front';
/**
 * - `multi`      : capture avant+arrière SIMULTANÉE (concurrent-camera OK).
 * - `sequential` : les deux capteurs existent mais pas de session concurrente →
 *   photo prise en DEUX temps (arrière puis avant) puis composée ; vidéo
 *   simultanée impossible (bloquée).
 * - `single`     : un seul capteur exploitable (pas de dual possible).
 * - `none`       : aucune caméra.
 */
export type MultiCamMode = 'multi' | 'sequential' | 'single' | 'none';
export type MultiCamStatus = 'idle' | 'starting' | 'running' | 'error';
export type MediaKind = 'photo' | 'video';
/** Que sauvegarder après une capture. */
export type SaveMode = 'pip' | 'pip_plus_originals' | 'originals';
/** Niveau de qualité (résolutions capture + bitrate ré-encodage). */
export type CaptureQuality = 'standard' | 'high' | 'max';
/** Compromis vitesse/qualité du pipeline photo (anti-latence / anti-flou). */
export type CaptureSpeed = 'speed' | 'balanced' | 'quality';
/** Cadence vidéo cible (ips). 60 non garanti en multi-cam -> repli sur 30. */
export type VideoFps = 30 | 60;

export interface CapturedMedia {
  kind: MediaKind;
  /** URI (file://) du média de la caméra PRINCIPALE (plein écran). */
  primaryUri: string;
  /** URI du média de la caméra SECONDAIRE (vignette), ou null en mono. */
  secondaryUri: string | null;
  createdAt: number;
  /** Durée de la vidéo en millisecondes (approx.), pour l'affichage galerie. */
  durationMs?: number;
  /** Vidéo boomerang (pour un nom de partage explicite). */
  boomerang?: boolean;
}

export interface Notice {
  /** identifiant unique (timestamp) pour re-déclencher l'affichage. */
  id: number;
  kind: 'success' | 'error';
  text: string;
}

/**
 * Diagnostic de détection multi-caméra, exposé à l'UI (bandeau « mode caméra
 * unique »). Les deux premières portes sont purement DÉCLARATIVES côté
 * constructeur : `concurrentFeature` = `FEATURE_CAMERA_CONCURRENT`, `comboCount`
 * = nombre de combinaisons renvoyées par `getConcurrentCameraIds()` (via
 * CameraX). Une app tierce ne peut RIEN forcer si l'OEM ne les expose pas.
 */
export interface MultiCamDiagnostics {
  /** L'OS déclare la capacité concurrent-camera (FEATURE_CAMERA_CONCURRENT). */
  concurrentFeature: boolean;
  /** Nombre de combinaisons multi-caméra exposées par le HAL (getConcurrentCameraIds). */
  comboCount: number;
  /** Une combinaison avant+arrière exploitable a été trouvée. */
  frontBackCombo: boolean;
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
  /** Disposition de la fusion PHOTO (pip / côte-à-côte / haut-bas). La vidéo
   *  reste en PiP (composeur natif) pour l'instant. */
  layout: CompositionLayout;
  /** Position/taille LIBRE de la vignette (drag/pinch). `null` ⇒ coin (`pipCorner`). */
  pipInset: PipInset | null;
  /** Ajouter un discret filigrane « TwinLens » à la composition. Opt-in (OFF). */
  watermark: boolean;
  /** Ratio du cadre de sortie pour la disposition `pip` (full / 1:1 / 9:16). */
  outputRatio: OutputRatio;
  /** Boomerang exporté en GIF animé plutôt qu'en MP4. */
  boomerangGif: boolean;
  /** Miroir de la caméra avant à la SAUVEGARDE (selfie comme dans l'aperçu). */
  mirrorFront: boolean;
  /** Cadence vidéo cible (30 / 60 ips). */
  videoFps: VideoFps;
  /** Compensation d'exposition (EV) courante. Transitoire (non persisté). */
  exposureBias: number;
  /** Verrou AE/AF actif (exposition + mise au point figées). Transitoire. */
  aeLocked: boolean;
  /** Toutes les captures de la session courante (pour la galerie). */
  sessionCaptures: CapturedMedia[];
  /** Nombre de traitements (composition/sauvegarde) en cours en arrière-plan. */
  processingCount: number;
  captureQuality: CaptureQuality;
  /** Compromis vitesse/qualité de la capture photo. `speed` = obturateur le
   *  plus rapide + fusion multi-frames coupée (anti-flou de bougé). */
  captureSpeed: CaptureSpeed;
  /** Son d'obturateur système à la prise photo. Le SYSTÈME peut le forcer dans
   *  certaines régions (Japon/Corée) — le réglage est alors sans effet. */
  shutterSound: boolean;
  /** Aperçu LIVE de la 2e caméra (vignette). `false` = « mode surprise ».
   *  N'affecte NI la capture NI la fusion PiP — seulement l'affichage live. */
  showSecondaryPreview: boolean;
  /** Inscrire la localisation (GPS EXIF) dans les photos. Opt-in, on-device. */
  geotag: boolean;
  /** Diagnostic de détection multi-caméra (null tant que la session n'est pas construite). */
  diagnostics: MultiCamDiagnostics | null;
  /** Étape de la capture photo séquentielle : 0 = repos, 1 = arrière, 2 = avant.
   *  Transitoire (pilote l'overlay « gardez la pose »). */
  sequentialStep: number;
}

/** Snapshot publié tant que la session n'est pas construite (valeurs par défaut). */
export const INITIAL: MultiCamSnapshot = {
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
  layout: 'pip',
  pipInset: null,
  watermark: false,
  outputRatio: 'full',
  boomerangGif: false,
  mirrorFront: true,
  videoFps: 30,
  exposureBias: 0,
  aeLocked: false,
  sessionCaptures: [],
  processingCount: 0,
  captureQuality: 'high',
  // Compromis par défaut : obturateur réactif sans sacrifier la qualité.
  captureSpeed: 'balanced',
  // Son d'obturateur activé par défaut (comportement système habituel).
  shutterSound: true,
  // Aperçu de la 2e caméra activé par défaut ; désactivable pour la surprise.
  showSecondaryPreview: true,
  // Géotag désactivé par défaut (permission sensible, strictement opt-in).
  geotag: false,
  // Renseigné à la première construction de session (buildSession).
  diagnostics: null,
  sequentialStep: 0,
};
