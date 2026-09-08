// Contexte partagé entre MultiCamController et les modules de capture
// (issue #148, étape C). Il expose UNIQUEMENT ce dont les modules ont besoin
// (snapshot, mutations d'état, sorties caméra, composeurs) : les champs privés
// du contrôleur restent privés, accessibles via ces accesseurs.
import type {
  CameraController,
  CameraDevice,
  CameraPhotoOutput,
  CameraSession,
  CameraVideoOutput,
  Recorder,
} from 'react-native-vision-camera';

import type { GpsCoords } from '../../services/exifGps';
import type { PhotoComposeOptions, VideoComposeOptions } from '../../services/pipComposer';
import type { CameraSlot, CapturedMedia, MultiCamSnapshot } from '../types';
import type { QualityConfig } from './quality';

/**
 * Agrégat de fin d'enregistrement : chaque recorder (back/front) « settle »
 * (onFinished ou onError) ; la finalisation part quand settled == expected.
 * Réassigné en bloc à chaque démarrage d'enregistrement.
 */
export interface RecordingAggregate {
  expected: number;
  settled: number;
  backPath: string | null;
  frontPath: string | null;
}

/** Paire de recorders actifs. Objet partagé PAR RÉFÉRENCE (jamais réassigné). */
export interface ActiveRecorders {
  back: Recorder | null;
  front: Recorder | null;
}

export interface CaptureContext {
  // ------------------------------------------- état publié / notifications ----
  getSnapshot(): MultiCamSnapshot;
  update(patch: Partial<MultiCamSnapshot>): void;
  notify(kind: 'success' | 'error', text: string): void;
  pushCapture(capture: CapturedMedia): void;
  /** Sérialise un traitement de fond et suit son avancement (processingCount). */
  enqueue(job: () => Promise<void>): void;
  /** Copie un fichier temporaire dans la pellicule (MediaStore) et renvoie son URI. */
  persist(filePath: string): Promise<string>;
  /** Inscrit la position dans l'EXIF d'un JPEG (best-effort, jamais bloquant). */
  stampGps(fileUri: string, coords: GpsCoords | null): Promise<void>;

  // ------------------------------------------------------------- config ----
  /** Config qualité COURANTE (résolutions, bitrate vidéo, canvas PiP). */
  getQuality(): QualityConfig;

  // ------------------------------------- état privé du contrôleur (lecture) ----
  getPrimarySlot(): CameraSlot;
  isDisposed(): boolean;
  /** Mode boomerang : le prochain enregistrement sera post-traité en boomerang. */
  getBoomerangMode(): boolean;
  /** Device AVANT mémorisé pour la capture photo séquentielle. */
  getSequentialFront(): CameraDevice | undefined;

  // ------------------------------------------- sorties caméra / session ----
  getBackPhoto(): CameraPhotoOutput | null;
  getFrontPhoto(): CameraPhotoOutput | null;
  /** Publie la sortie photo AVANT de la session éphémère (mode séquentiel). */
  setFrontPhoto(output: CameraPhotoOutput | null): void;
  getBackVideo(): CameraVideoOutput | null;
  getFrontVideo(): CameraVideoOutput | null;
  /** Remplace la session courante (session AVANT éphémère du mode séquentiel). */
  setSession(session: CameraSession | null): void;
  setFrontController(controller: CameraController | null): void;
  teardownSession(): Promise<void>;
  buildSession(): Promise<void>;

  // ------------------------------- composeurs / géotag (injectés de React) ----
  getPipComposer(): ((primaryUri: string, secondaryUri: string) => Promise<string>) | null;
  getPhotoComposer(): ((primaryUri: string, secondaryUri: string, opts: PhotoComposeOptions) => Promise<string>) | null;
  getVideoComposer(): ((primaryUri: string, secondaryUri: string, opts: VideoComposeOptions) => Promise<string>) | null;
  getLocationProvider(): (() => GpsCoords | null) | null;

  // ------------------------------------------------- enregistrement vidéo ----
  getRecorders(): ActiveRecorders;
  getRecAgg(): RecordingAggregate;
  setRecAgg(agg: RecordingAggregate): void;
  getRecStartedAt(): number;
  setRecStartedAt(timestamp: number): void;
}
