// Configuration de qualité de capture (résolutions, bitrates, canvas PiP).
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import type { PhotoOutputOptions, Size } from 'react-native-vision-camera';

import type { CaptureQuality, CaptureSpeed } from '../types';

export interface QualityConfig {
  photoRes: Size;
  videoRes: Size;
  /** bitrate de ré-encodage de la vidéo PiP composée (bits/s). */
  videoBitrate: number;
  /** largeur du canvas de composition PiP photo (px). */
  pipCanvas: number;
}

// NB : en multi-cam la bande passante ISP est partagée ; les vidéos restent ≤ 1080p.
export const QUALITY: Record<CaptureQuality, QualityConfig> = {
  standard: {
    photoRes: { width: 1920, height: 1080 },
    videoRes: { width: 1280, height: 720 },
    videoBitrate: 10_000_000,
    pipCanvas: 1080,
  },
  high: {
    photoRes: { width: 1920, height: 1080 },
    videoRes: { width: 1920, height: 1080 },
    videoBitrate: 20_000_000,
    pipCanvas: 1440,
  },
  max: {
    photoRes: { width: 3840, height: 2160 },
    videoRes: { width: 1920, height: 1080 },
    videoBitrate: 30_000_000,
    pipCanvas: 1920,
  },
};

export function photoOptions(res: Size, speed: CaptureSpeed): PhotoOutputOptions {
  return {
    targetResolution: res,
    containerFormat: 'jpeg',
    quality: 0.95,
    // `speed` réduit le temps d'exposition/traitement -> obturateur plus réactif
    // et moins de flou de bougé ; `balanced` est le meilleur compromis par défaut.
    qualityPrioritization: speed,
  };
}

/** Largeur du canvas de composition PiP photo (view-shot) selon la qualité. */
export function pipCanvasForQuality(quality: CaptureQuality): number {
  return QUALITY[quality].pipCanvas;
}
