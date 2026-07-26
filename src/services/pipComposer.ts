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

/**
 * Disposition de la fusion des deux caméras.
 *  - `pip`        : principale plein cadre + vignette (incrustation).
 *  - `sideBySide` : deux moitiés côte à côte (rendu paysage 3:2).
 *  - `topBottom`  : deux moitiés empilées (rendu portrait 2:3).
 */
export type CompositionLayout = 'pip' | 'sideBySide' | 'topBottom';

/**
 * Ratio du cadre de sortie pour la disposition `pip` (caméra principale plein
 * cadre) : `full` = capteur (~3:4), `square` = 1:1, `tall` = 9:16 (vertical).
 * Sans effet sur `sideBySide`/`topBottom` (ratio intrinsèque à la disposition).
 */
export type OutputRatio = 'full' | 'square' | 'tall';

/** Facteur hauteur/largeur du canvas `pip` selon le ratio de sortie. */
export function pipRatioFactor(r: OutputRatio): number {
  switch (r) {
    case 'square':
      return 1; // 1:1
    case 'tall':
      return 16 / 9; // 9:16 vertical
    case 'full':
    default:
      return 4 / 3; // ~3:4 (capteur portrait)
  }
}

/**
 * Position/taille LIBRE de la vignette PiP, en fractions du cadre (0..1) :
 * `x`/`y` = coin haut-gauche, `w` = largeur. `null` ⇒ on utilise le coin (`PipCorner`).
 * La hauteur est dérivée d'un ratio portrait fixe à l'affichage/composition.
 */
export interface PipInset {
  x: number;
  y: number;
  w: number;
}

/** Options de composition PiP PHOTO (passées au compositeur natif). */
export interface PhotoComposeOptions {
  layout: CompositionLayout;
  corner: PipCorner;
  /** Vignette libre, ou `null` pour utiliser le coin. */
  inset: PipInset | null;
  watermark: boolean;
  /** Largeur du canvas de composition (px). */
  canvasWidth: number;
  /** Ratio du cadre `pip` (ignoré pour les autres dispositions). */
  outputRatio: OutputRatio;
  saveOriginals: boolean;
}

/** Options de composition PiP VIDÉO (passées au compositeur natif GL). */
export interface VideoComposeOptions {
  layout: CompositionLayout;
  corner: PipCorner;
  /** Vignette libre, ou `null` pour utiliser le coin. */
  inset: PipInset | null;
  watermark: boolean;
  /** Bitrate de ré-encodage (bits/s). */
  bitRate: number;
  /** Ratio du cadre `pip` (ignoré pour les autres dispositions). */
  outputRatio: OutputRatio;
  /** Post-traiter en boomerang (avant + arrière bouclé, muet). */
  boomerang: boolean;
  saveOriginals: boolean;
}

/** Ratio hauteur/largeur de la vignette (portrait), partagé preview ↔ composition. */
export const PIP_INSET_ASPECT = 172 / 120;
/** Bornes de largeur de la vignette (fraction du cadre) pour le redimensionnement. */
export const PIP_INSET_MIN_W = 0.18;
export const PIP_INSET_MAX_W = 0.42;

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
