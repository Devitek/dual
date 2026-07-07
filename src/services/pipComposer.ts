/**
 * (a) Composition Picture-in-Picture — post-traitement.
 *
 * PHOTO : fusion RÉELLE on-device via react-native-view-shot (cf. PipReviewModal) :
 *   on rend la composition (photo principale + vignette) dans une <ViewShot> et
 *   on la capture en un unique JPEG sauvegardé dans la galerie.
 *
 * VIDÉO : ré-encoder 2 flux en 1 fichier n'est pas réalisable de façon fiable en
 *   pur JS sur mobile. On conserve donc les 2 fichiers distincts (déjà en galerie)
 *   et on fournit ci-dessous la commande FFmpeg + les stratégies pour un module
 *   natif ou un worker serveur. (Rappel : `ffmpeg-kit-react-native` est déprécié.)
 */

export type PipCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface PipLayout {
  /** largeur de la vignette en fraction de la largeur du rendu (0..1). */
  insetWidthRatio: number;
  /** marge autour de la vignette en fraction de la largeur du rendu. */
  marginRatio: number;
  corner: PipCorner;
}

export const DEFAULT_PIP_LAYOUT: PipLayout = {
  insetWidthRatio: 0.3,
  marginRatio: 0.04,
  corner: 'top-right',
};

/** Expression de position `overlay=x:y` pour FFmpeg selon le coin voulu. */
function ffmpegOverlayExpr(corner: PipCorner, marginExpr: string): string {
  switch (corner) {
    case 'top-left':
      return `${marginExpr}:${marginExpr}`;
    case 'top-right':
      return `main_w-overlay_w-${marginExpr}:${marginExpr}`;
    case 'bottom-left':
      return `${marginExpr}:main_h-overlay_h-${marginExpr}`;
    case 'bottom-right':
      return `main_w-overlay_w-${marginExpr}:main_h-overlay_h-${marginExpr}`;
  }
}

export interface FfmpegPipParams {
  mainVideoPath: string;
  insetVideoPath: string;
  outputPath: string;
  layout?: PipLayout;
}

/**
 * Construit la commande FFmpeg d'incrustation PiP. À exécuter par un module
 * natif FFmpeg (maintenu) ou un worker serveur — PAS par cette app JS.
 */
export function buildFfmpegPipCommand(params: FfmpegPipParams): string {
  const layout = params.layout ?? DEFAULT_PIP_LAYOUT;
  const scale = layout.insetWidthRatio.toFixed(3);
  const marginExpr = `main_w*${layout.marginRatio.toFixed(3)}`;
  const overlay = ffmpegOverlayExpr(layout.corner, marginExpr);

  return [
    'ffmpeg -y',
    `-i "${params.mainVideoPath}"`,
    `-i "${params.insetVideoPath}"`,
    `-filter_complex "[1:v]scale=iw*${scale}:-1[pip];[0:v][pip]overlay=${overlay}[out]"`,
    '-map "[out]" -map 0:a? -c:v h264 -c:a aac -movflags +faststart',
    `"${params.outputPath}"`,
  ].join(' ');
}

/** Stratégies possibles pour la fusion vidéo (affichées dans l'UI de revue). */
export const PIP_VIDEO_STRATEGIES = [
  '1. Module natif device (iOS AVMutableComposition + AVMutableVideoComposition, ' +
    'Android MediaMuxer/OpenGL) exposé en Expo Module — offline, contrôle total.',
  '2. @shopify/react-native-skia (Video + Canvas) pour incruster puis ré-encoder.',
  '3. Worker FFmpeg côté serveur : upload des 2 fichiers, réception du rendu PiP.',
] as const;
