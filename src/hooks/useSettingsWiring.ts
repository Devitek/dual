import { useCallback, useEffect, useState } from 'react';

import type {
  CaptureQuality,
  CaptureSpeed,
  MultiCamController,
  SaveMode,
  VideoFps,
} from '../vision/MultiCamController';
import type { CaptureMode } from '../components/ModeSwitch';
import type { PhotoFlashMode } from '../components/CameraTopBar';
import type { CompositionLayout, OutputRatio, PipInset } from '../services/pipComposer';
import type { VolumeKeyAction } from '../native/volumeKeys';
import { haptics } from '../utils/haptics';
import {
  loadPersistedSettings,
  saveSetting,
  type BurstCount,
  type PersistedSettings,
  type TimerSeconds,
} from '../services/settings';

interface SettingsWiringParams {
  controller: MultiCamController;
  /** État live nécessaire au toggle de l'aperçu 2ᵉ caméra. */
  showSecondaryPreview: boolean;
  /** Restauration des réglages portés par l'écran (photoFlash, mode). Le mode
   *  passe par l'écran : il applique la préséance du deep-link (widget/tuile). */
  onRestorePhotoFlash: (m: PhotoFlashMode) => void;
  onRestoreMode: (m: CaptureMode) => void;
}

export interface SettingsWiring {
  // Réglages à état local (persistés, appliqués au montage).
  volumeKeyAction: VolumeKeyAction;
  stabilization: boolean;
  timerSeconds: TimerSeconds;
  grid: boolean;
  level: boolean;
  burstCount: BurstCount;
  setVolumeKeyAction: (a: VolumeKeyAction) => void;
  setStabilization: (v: boolean) => void;
  setTimerSeconds: (s: TimerSeconds) => void;
  setGrid: (v: boolean) => void;
  setLevel: (v: boolean) => void;
  setBurstCount: (v: BurstCount) => void;
  // Réglages portés par le contrôleur (le snapshot `cam` reflète la valeur).
  setPhotoSaveMode: (m: SaveMode) => void;
  setVideoSaveMode: (m: SaveMode) => void;
  setLayout: (l: CompositionLayout) => void;
  onMovePip: (inset: PipInset) => void;
  setWatermark: (v: boolean) => void;
  setOutputRatio: (r: OutputRatio) => void;
  setQuality: (q: CaptureQuality) => void;
  setVideoFps: (fps: VideoFps) => void;
  setBoomerangGif: (v: boolean) => void;
  setMirrorFront: (v: boolean) => void;
  setCaptureSpeed: (s: CaptureSpeed) => void;
  setShutterSound: (v: boolean) => void;
  toggleSecondaryPreview: () => void;
}

/**
 * Câblage des réglages persistés (#148) : source unique services/settings.
 *
 * - chaque setter applique la valeur (state local ou contrôleur) ET la persiste
 *   via `saveSetting` (règle §8 : jamais de persistance « à la main ») ;
 * - au montage, `loadPersistedSettings()` relit TOUTES les clés et les applique.
 *   Corrige le « reset au démarrage » : sur Samsung le process est tué souvent,
 *   donc CHAQUE réglage doit être persisté + restauré ici.
 */
export function useSettingsWiring({
  controller,
  showSecondaryPreview,
  onRestorePhotoFlash,
  onRestoreMode,
}: SettingsWiringParams): SettingsWiring {
  const [volumeKeyAction, setVolumeKeyActionState] = useState<VolumeKeyAction>('volume');
  const [stabilization, setStabilizationState] = useState(true);
  const [timerSeconds, setTimerSecondsState] = useState<TimerSeconds>(0);
  const [grid, setGridState] = useState(false);
  const [level, setLevelState] = useState(false);
  const [burstCount, setBurstCountState] = useState<BurstCount>(1);

  const applyPersisted = useCallback(
    (s: Partial<PersistedSettings>) => {
      const c = controller;
      if (s.stabilization != null) setStabilizationState(s.stabilization);
      if (s.captureSpeed != null) void c.setCaptureSpeed(s.captureSpeed);
      if (s.timerSeconds != null) setTimerSecondsState(s.timerSeconds);
      if (s.shutterSound != null) c.setShutterSound(s.shutterSound);
      if (s.layout != null) c.setLayout(s.layout);
      if (s.watermark != null) c.setWatermark(s.watermark);
      if (s.outputRatio != null) c.setOutputRatio(s.outputRatio);
      if (s.volumeKeyAction != null) setVolumeKeyActionState(s.volumeKeyAction);
      if (s.photoSaveMode != null) c.setPhotoSaveMode(s.photoSaveMode);
      if (s.videoSaveMode != null) c.setVideoSaveMode(s.videoSaveMode);
      if (s.pipCorner != null) c.setPipCorner(s.pipCorner); // remet aussi pipInset à null
      if (s.pipInset != null) c.setPipInset(s.pipInset); // -> restauré APRÈS le coin
      if (s.captureQuality != null) void c.setQuality(s.captureQuality);
      if (s.videoFps != null) void c.setVideoFps(s.videoFps);
      if (s.boomerangGif != null) c.setBoomerangGif(s.boomerangGif);
      if (s.mirrorFront != null) void c.setMirrorFront(s.mirrorFront);
      if (s.showSecondaryPreview != null) c.setShowSecondaryPreview(s.showSecondaryPreview);
      if (s.photoFlash != null) onRestorePhotoFlash(s.photoFlash);
      if (s.mode != null) onRestoreMode(s.mode);
      if (s.grid != null) setGridState(s.grid);
      if (s.level != null) setLevelState(s.level);
      if (s.burstCount != null) setBurstCountState(s.burstCount);
    },
    [controller, onRestorePhotoFlash, onRestoreMode],
  );

  useEffect(() => {
    let cancelled = false;
    void loadPersistedSettings().then((s) => {
      if (!cancelled) applyPersisted(s);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPersisted]);

  const setVolumeKeyAction = useCallback((a: VolumeKeyAction) => {
    setVolumeKeyActionState(a);
    saveSetting('volumeKeyAction', a);
  }, []);
  const setStabilization = useCallback((value: boolean) => {
    setStabilizationState(value);
    saveSetting('stabilization', value);
  }, []);
  const setTimerSeconds = useCallback((s: TimerSeconds) => {
    setTimerSecondsState(s);
    saveSetting('timerSeconds', s);
  }, []);
  const setGrid = useCallback((v: boolean) => {
    setGridState(v);
    saveSetting('grid', v);
  }, []);
  const setLevel = useCallback((v: boolean) => {
    setLevelState(v);
    saveSetting('level', v);
  }, []);
  const setBurstCount = useCallback((v: BurstCount) => {
    setBurstCountState(v);
    saveSetting('burstCount', v);
  }, []);

  const setPhotoSaveMode = useCallback(
    (m: SaveMode) => {
      controller.setPhotoSaveMode(m);
      saveSetting('photoSaveMode', m);
    },
    [controller],
  );
  const setVideoSaveMode = useCallback(
    (m: SaveMode) => {
      controller.setVideoSaveMode(m);
      saveSetting('videoSaveMode', m);
    },
    [controller],
  );
  const setLayout = useCallback(
    (l: CompositionLayout) => {
      controller.setLayout(l);
      saveSetting('layout', l);
    },
    [controller],
  );
  const onMovePip = useCallback(
    (inset: PipInset) => {
      controller.setPipInset(inset);
      saveSetting('pipInset', inset);
    },
    [controller],
  );
  const setWatermark = useCallback(
    (value: boolean) => {
      controller.setWatermark(value);
      saveSetting('watermark', value);
    },
    [controller],
  );
  const setOutputRatio = useCallback(
    (r: OutputRatio) => {
      controller.setOutputRatio(r);
      saveSetting('outputRatio', r);
    },
    [controller],
  );
  const setQuality = useCallback(
    (q: CaptureQuality) => {
      void controller.setQuality(q);
      saveSetting('captureQuality', q);
    },
    [controller],
  );
  const setVideoFps = useCallback(
    (fps: VideoFps) => {
      void controller.setVideoFps(fps);
      saveSetting('videoFps', fps);
    },
    [controller],
  );
  const setBoomerangGif = useCallback(
    (v: boolean) => {
      controller.setBoomerangGif(v);
      saveSetting('boomerangGif', v);
    },
    [controller],
  );
  const setMirrorFront = useCallback(
    (v: boolean) => {
      void controller.setMirrorFront(v);
      saveSetting('mirrorFront', v);
    },
    [controller],
  );
  const setCaptureSpeed = useCallback(
    (s: CaptureSpeed) => {
      void controller.setCaptureSpeed(s);
      saveSetting('captureSpeed', s);
    },
    [controller],
  );
  const setShutterSound = useCallback(
    (value: boolean) => {
      controller.setShutterSound(value);
      saveSetting('shutterSound', value);
    },
    [controller],
  );
  const toggleSecondaryPreview = useCallback(() => {
    haptics.selection();
    const next = !showSecondaryPreview;
    controller.setShowSecondaryPreview(next);
    saveSetting('showSecondaryPreview', next);
  }, [controller, showSecondaryPreview]);

  return {
    volumeKeyAction,
    stabilization,
    timerSeconds,
    grid,
    level,
    burstCount,
    setVolumeKeyAction,
    setStabilization,
    setTimerSeconds,
    setGrid,
    setLevel,
    setBurstCount,
    setPhotoSaveMode,
    setVideoSaveMode,
    setLayout,
    onMovePip,
    setWatermark,
    setOutputRatio,
    setQuality,
    setVideoFps,
    setBoomerangGif,
    setMirrorFront,
    setCaptureSpeed,
    setShutterSound,
    toggleSecondaryPreview,
  };
}
