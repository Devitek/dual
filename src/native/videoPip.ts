import { requireOptionalNativeModule } from 'expo-modules-core';

import type { PhotoComposeOptions, VideoComposeOptions } from '../services/pipComposer';

/** Params bruts (primitifs) attendus par le Record natif `PhotoParams`. */
interface NativePhotoParams {
  layout: string;
  corner: string;
  insetX: number;
  insetY: number;
  insetW: number;
  watermark: boolean;
  canvasWidth: number;
  outputRatio: string;
  saveOriginals: boolean;
}

/** Params bruts (primitifs) attendus par le Record natif `VideoParams`. */
interface NativeVideoParams {
  layout: string;
  corner: string;
  insetX: number;
  insetY: number;
  insetW: number;
  watermark: boolean;
  bitRate: number;
  outputRatio: string;
  boomerang: boolean;
  boomerangGif: boolean;
  saveOriginals: boolean;
}

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
  composePip: (primaryPath: string, secondaryPath: string, params: NativeVideoParams) => Promise<string>;
  composePipPhoto: (primaryPath: string, secondaryPath: string, params: NativePhotoParams) => Promise<string>;
  shareToApp: (uri: string, mimeType: string, packages: string[]) => Promise<boolean>;
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

/**
 * Partage DIRECT du média vers la 1ʳᵉ app installée parmi `packages` (ACTION_SEND
 * ciblé, natif). Renvoie `false` si aucune n'est installée (ou module absent) →
 * l'appelant retombe sur le partage système.
 */
export async function shareToApp(uri: string, mimeType: string, packages: string[]): Promise<boolean> {
  if (Native?.shareToApp == null) return false;
  try {
    return await Native.shareToApp(uri, mimeType, packages);
  } catch {
    return false;
  }
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
  opts: VideoComposeOptions,
): Promise<string> {
  if (Native == null) {
    throw new Error('Module natif VideoPipComposer indisponible (rebuild requis).');
  }
  const primaryPath = primaryUri.replace(/^file:\/\//, '');
  const secondaryPath = secondaryUri.replace(/^file:\/\//, '');
  const inset = opts.inset;
  return Native.composePip(primaryPath, secondaryPath, {
    layout: opts.layout,
    corner: opts.corner,
    // insetW <= 0 -> le natif utilise le coin.
    insetX: inset != null ? inset.x : -1,
    insetY: inset != null ? inset.y : -1,
    insetW: inset != null ? inset.w : -1,
    watermark: opts.watermark,
    bitRate: opts.bitRate,
    outputRatio: opts.outputRatio,
    boomerang: opts.boomerang,
    boomerangGif: opts.boomerangGif,
    saveOriginals: opts.saveOriginals,
  });
}

/**
 * Compose la PHOTO PiP on-device (Canvas natif) via le même Foreground Service.
 * Gère les dispositions (pip / côte-à-côte / haut-bas), la vignette libre et le
 * filigrane. Sauvegarde native (galerie DCIM) -> survit au kill. Renvoie l'URI galerie.
 */
export async function composePipPhoto(
  primaryUri: string,
  secondaryUri: string,
  opts: PhotoComposeOptions,
): Promise<string> {
  if (Native == null) {
    throw new Error('Module natif VideoPipComposer indisponible (rebuild requis).');
  }
  const primaryPath = primaryUri.replace(/^file:\/\//, '');
  const secondaryPath = secondaryUri.replace(/^file:\/\//, '');
  const inset = opts.inset;
  return Native.composePipPhoto(primaryPath, secondaryPath, {
    layout: opts.layout,
    corner: opts.corner,
    // insetW <= 0 -> le natif utilise le coin.
    insetX: inset != null ? inset.x : -1,
    insetY: inset != null ? inset.y : -1,
    insetW: inset != null ? inset.w : -1,
    watermark: opts.watermark,
    canvasWidth: opts.canvasWidth,
    outputRatio: opts.outputRatio,
    saveOriginals: opts.saveOriginals,
  });
}
