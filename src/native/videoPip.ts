import { requireOptionalNativeModule } from 'expo-modules-core';

import type { PipCorner } from '../services/pipComposer';

interface PipProgressEvent {
  jobId: string;
  progress: number; // 0..1, ou -1 si durée inconnue (indéterminé)
}

interface VideoPipComposerNative {
  /**
   * Lance la composition dans un Foreground Service. Le natif compose ET
   * sauvegarde en galerie ; la Promise se résout (à la fin du service) avec
   * l'URI galerie du fichier PiP.
   */
  composePip: (
    primaryPath: string,
    secondaryPath: string,
    corner: string,
    bitRate: number,
    saveOriginals: boolean,
  ) => Promise<string>;
  composePipPhoto: (
    primaryPath: string,
    secondaryPath: string,
    corner: string,
    canvasWidth: number,
    saveOriginals: boolean,
  ) => Promise<string>;
  requestNotificationsPermission: () => Promise<void>;
  addListener: (event: string, listener: (payload: PipProgressEvent) => void) => { remove: () => void };
}

// requireOptionalNativeModule NE throw PAS si le module n'est pas dans le build.
const Native = requireOptionalNativeModule<VideoPipComposerNative>('VideoPipComposer');

export const isVideoPipComposerAvailable = Native != null;

/** Demande la permission de notifications (Android 13+), pour la barre de progression. */
export function requestVideoPipNotificationsPermission(): void {
  Native?.requestNotificationsPermission?.().catch(() => {});
}

/** S'abonne à la progression (0..1, ou -1 pour indéterminé). */
export function subscribeVideoPipProgress(cb: (progress: number) => void): { remove: () => void } {
  if (Native == null) return { remove: () => {} };
  return Native.addListener('onProgress', (event) => cb(event.progress));
}

/**
 * Compose la vidéo PiP on-device en tâche de fond (Foreground Service).
 * Renvoie l'URI galerie (déjà sauvegardé nativement — survit au kill de l'app).
 */
export async function composePipVideo(
  primaryUri: string,
  secondaryUri: string,
  corner: PipCorner,
  bitRate: number,
  saveOriginals: boolean,
): Promise<string> {
  if (Native == null) {
    throw new Error('Module natif VideoPipComposer indisponible (rebuild requis).');
  }
  const primaryPath = primaryUri.replace(/^file:\/\//, '');
  const secondaryPath = secondaryUri.replace(/^file:\/\//, '');
  return Native.composePip(primaryPath, secondaryPath, corner, bitRate, saveOriginals);
}

/**
 * Compose la PHOTO PiP on-device (Canvas natif) via le même Foreground Service.
 * Sauvegarde native (galerie DCIM) -> survit au kill de l'app. Renvoie l'URI galerie.
 */
export async function composePipPhoto(
  primaryUri: string,
  secondaryUri: string,
  corner: PipCorner,
  canvasWidth: number,
  saveOriginals: boolean,
): Promise<string> {
  if (Native == null) {
    throw new Error('Module natif VideoPipComposer indisponible (rebuild requis).');
  }
  const primaryPath = primaryUri.replace(/^file:\/\//, '');
  const secondaryPath = secondaryUri.replace(/^file:\/\//, '');
  return Native.composePipPhoto(primaryPath, secondaryPath, corner, canvasWidth, saveOriginals);
}
