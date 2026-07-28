import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CaptureQuality, CaptureSpeed, SaveMode, VideoFps } from '../vision/MultiCamController';
import type { CompositionLayout, OutputRatio, PipCorner, PipInset } from './pipComposer';
import type { PhotoFlashMode } from '../components/CameraTopBar';
import type { CaptureMode } from '../components/ModeSwitch';
import type { VolumeKeyAction } from '../native/volumeKeys';

/** Valeurs possibles du retardateur (secondes). */
export const TIMER_VALUES = [0, 3, 10] as const;
export type TimerSeconds = (typeof TIMER_VALUES)[number];

/** Nombre de photos par rafale (1 = rafale désactivée). */
export const BURST_VALUES = [1, 3, 5, 10] as const;
export type BurstCount = (typeof BURST_VALUES)[number];

/**
 * SOURCE DE VÉRITÉ UNIQUE des réglages utilisateur persistés (AsyncStorage).
 *
 * ⚠️ RÈGLE (voir AGENTS.md §Persistance) : tout réglage utilisateur DOIT figurer
 * ici (clé + champ de {@link PersistedSettings} + validation dans
 * {@link loadPersistedSettings}) ET être appliqué au montage (cf.
 * `applyPersistedSettings` dans MultiCameraScreen). Ne JAMAIS écrire un réglage
 * « à la main » ailleurs — sinon il repart au défaut à chaque mort du process
 * (fréquent sur les surcouches agressives type Samsung One UI).
 *
 * Volontairement NON persistés : la **torche** (sécurité — pas de lampe rallumée
 * au lancement), le **hint PiP** (one-shot, `tl_seen_pip_hint`), le **géotag**
 * (géré par `useGeotag`, conditionné à la permission).
 */
export const SETTINGS_KEYS = {
  stabilization: 'tl_stabilization',
  captureSpeed: 'tl_capture_speed',
  timerSeconds: 'tl_timer',
  shutterSound: 'tl_shutter_sound',
  layout: 'tl_layout',
  pipInset: 'tl_pip_inset',
  watermark: 'tl_watermark',
  volumeKeyAction: 'tl_volume_key_action',
  photoSaveMode: 'tl_photo_save_mode',
  videoSaveMode: 'tl_video_save_mode',
  pipCorner: 'tl_pip_corner',
  captureQuality: 'tl_capture_quality',
  showSecondaryPreview: 'tl_secondary_preview',
  photoFlash: 'tl_photo_flash',
  mode: 'tl_mode',
  grid: 'tl_grid',
  level: 'tl_level',
  burstCount: 'tl_burst',
  outputRatio: 'tl_output_ratio',
  videoFps: 'tl_video_fps',
  boomerangGif: 'tl_boomerang_gif',
  mirrorFront: 'tl_mirror_front',
} as const;

export interface PersistedSettings {
  stabilization: boolean;
  captureSpeed: CaptureSpeed;
  timerSeconds: TimerSeconds;
  shutterSound: boolean;
  layout: CompositionLayout;
  /** `null` = revenir au coin (`pipCorner`). */
  pipInset: PipInset | null;
  watermark: boolean;
  volumeKeyAction: VolumeKeyAction;
  photoSaveMode: SaveMode;
  videoSaveMode: SaveMode;
  pipCorner: PipCorner;
  captureQuality: CaptureQuality;
  showSecondaryPreview: boolean;
  photoFlash: PhotoFlashMode;
  mode: CaptureMode;
  /** Grille règle des tiers sur le viseur. */
  grid: boolean;
  /** Niveau (horizon) sur le viseur. */
  level: boolean;
  /** Nombre de photos par rafale (1 = désactivée). */
  burstCount: BurstCount;
  /** Ratio du cadre de sortie pour la disposition `pip`. */
  outputRatio: OutputRatio;
  /** Cadence vidéo cible (30 / 60 ips). */
  videoFps: VideoFps;
  /** Boomerang exporté en GIF animé plutôt qu'en MP4. */
  boomerangGif: boolean;
  /** Miroir de la caméra avant à la sauvegarde (selfie comme l'aperçu). */
  mirrorFront: boolean;
}

export type SettingKey = keyof PersistedSettings;

/** Parse la position/taille libre de la vignette (JSON validé), sinon `null`. */
export function parsePipInset(raw: string | null | undefined): PipInset | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw) as Partial<PipInset>;
    if (
      typeof v?.x === 'number' &&
      typeof v?.y === 'number' &&
      typeof v?.w === 'number' &&
      v.x >= 0 &&
      v.x <= 1 &&
      v.y >= 0 &&
      v.y <= 1 &&
      v.w > 0 &&
      v.w <= 1
    ) {
      return { x: v.x, y: v.y, w: v.w };
    }
  } catch {
    /* JSON invalide -> ignoré */
  }
  return null;
}

const inSet = <T extends string>(v: string | null | undefined, allowed: readonly T[]): T | undefined =>
  v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const SAVE_MODES = ['pip', 'pip_plus_originals', 'originals'] as const;

/**
 * Lit et VALIDE tous les réglages persistés en un seul passage (clés dérivées de
 * {@link SETTINGS_KEYS}, donc impossible d'oublier de relire un réglage écrit).
 * Ne renvoie que les valeurs valides présentes.
 */
export async function loadPersistedSettings(): Promise<Partial<PersistedSettings>> {
  let map: Record<string, string | null> = {};
  try {
    map = Object.fromEntries(await AsyncStorage.multiGet(Object.values(SETTINGS_KEYS)));
  } catch {
    return {};
  }
  const g = (k: SettingKey): string | null => map[SETTINGS_KEYS[k]] ?? null;
  const out: Partial<PersistedSettings> = {};

  if (g('stabilization') != null) out.stabilization = g('stabilization') === '1';
  const speed = inSet(g('captureSpeed'), ['speed', 'balanced', 'quality'] as const);
  if (speed) out.captureSpeed = speed;
  const timer = Number(g('timerSeconds'));
  if (timer === 0 || timer === 3 || timer === 10) out.timerSeconds = timer;
  if (g('shutterSound') != null) out.shutterSound = g('shutterSound') === '1';
  const layout = inSet(g('layout'), ['pip', 'sideBySide', 'topBottom'] as const);
  if (layout) out.layout = layout;
  const inset = parsePipInset(g('pipInset'));
  if (inset != null) out.pipInset = inset;
  if (g('watermark') != null) out.watermark = g('watermark') === '1';
  const vka = inSet(g('volumeKeyAction'), ['volume', 'shutter', 'zoom'] as const);
  if (vka) out.volumeKeyAction = vka;
  const psm = inSet(g('photoSaveMode'), SAVE_MODES);
  if (psm) out.photoSaveMode = psm;
  const vsm = inSet(g('videoSaveMode'), SAVE_MODES);
  if (vsm) out.videoSaveMode = vsm;
  const corner = inSet(g('pipCorner'), ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const);
  if (corner) out.pipCorner = corner;
  const q = inSet(g('captureQuality'), ['standard', 'high', 'max'] as const);
  if (q) out.captureQuality = q;
  if (g('showSecondaryPreview') != null) out.showSecondaryPreview = g('showSecondaryPreview') === '1';
  const flash = inSet(g('photoFlash'), ['off', 'auto', 'on'] as const);
  if (flash) out.photoFlash = flash;
  const m = inSet(g('mode'), ['photo', 'video', 'boomerang'] as const);
  if (m) out.mode = m;
  if (g('grid') != null) out.grid = g('grid') === '1';
  if (g('level') != null) out.level = g('level') === '1';
  const burst = Number(g('burstCount'));
  if (BURST_VALUES.includes(burst as BurstCount)) out.burstCount = burst as BurstCount;
  const ratio = inSet(g('outputRatio'), ['full', 'square', 'tall'] as const);
  if (ratio) out.outputRatio = ratio;
  const fps = Number(g('videoFps'));
  if (fps === 30 || fps === 60) out.videoFps = fps;
  if (g('boomerangGif') != null) out.boomerangGif = g('boomerangGif') === '1';
  if (g('mirrorFront') != null) out.mirrorFront = g('mirrorFront') === '1';

  return out;
}

/**
 * Sérialise + écrit un réglage (best-effort). `pipInset: null` supprime la clé
 * (= retour au coin). Booléens -> '1'/'0', nombres -> décimal, objets -> JSON.
 */
export function saveSetting<K extends SettingKey>(key: K, value: PersistedSettings[K]): void {
  const storageKey = SETTINGS_KEYS[key];
  if (value == null) {
    void AsyncStorage.removeItem(storageKey).catch(() => {});
    return;
  }
  let raw: string;
  if (typeof value === 'boolean') raw = value ? '1' : '0';
  else if (typeof value === 'number') raw = String(value);
  else if (typeof value === 'object') raw = JSON.stringify(value);
  else raw = String(value);
  void AsyncStorage.setItem(storageKey, raw).catch(() => {});
}
