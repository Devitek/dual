import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { useThemedStyles, type Palette } from '../theme/theme';
import { useIsForeground } from '../hooks/useIsForeground';
import { useMultiCamPermissions } from '../hooks/useMultiCamPermissions';
import { useMultiCam } from '../hooks/useMultiCam';
import { useInAppUpdate } from '../hooks/useInAppUpdate';
import { useVolumeShutter } from '../hooks/useVolumeShutter';
import { useGeotag } from '../hooks/useGeotag';
import { PermissionGate } from '../components/PermissionGate';
import { IntroSheet } from '../components/IntroSheet';
import { useIntro } from '../hooks/useIntro';
import { MultiCamPreview } from '../components/MultiCamPreview';
import { CameraGuides } from '../components/CameraGuides';
import { RatioMask } from '../components/RatioMask';
import { ExposureControl } from '../components/ExposureControl';
import { CaptureControls } from '../components/CaptureControls';
import type { CaptureMode } from '../components/ModeSwitch';
import { CameraTopBar, type PhotoFlashMode } from '../components/CameraTopBar';
import { SettingsSheet } from '../components/SettingsSheet';
import { ZoomIndicator } from '../components/ZoomIndicator';
import { ProcessingIndicator } from '../components/ProcessingIndicator';
import { UnsupportedBanner } from '../components/UnsupportedBanner';
import { CameraErrorView } from '../components/CameraErrorView';
import { SessionGallery } from '../components/SessionGallery';
import { PipHint } from '../components/PipHint';
import { PipCompositor, type PipCompositorHandle } from '../components/PipCompositor';
import { Snackbar } from '../components/Snackbar';
import { UpdateBanner } from '../components/UpdateBanner';
import {
  composePipPhoto,
  composePipVideo,
  isVideoPipComposerAvailable,
  requestVideoPipNotificationsPermission,
  subscribeVideoPipProgress,
} from '../native/videoPip';
import { haptics } from '../utils/haptics';
import type { FocusPoint } from '../components/FocusIndicator';
import { pipCanvasForQuality } from '../vision/MultiCamController';
import type { CameraSlot, CaptureQuality, CaptureSpeed, SaveMode, VideoFps } from '../vision/MultiCamController';
import type { CompositionLayout, OutputRatio, PipCorner, PipInset } from '../services/pipComposer';
import type { VolumeKeyAction } from '../native/volumeKeys';
import {
  loadPersistedSettings,
  saveSetting,
  type PersistedSettings,
  type TimerSeconds,
  type BurstCount,
} from '../services/settings';

/** Clé du hint « touchez la vignette » (1er lancement — one-shot, hors réglages). */
const PIP_HINT_KEY = 'tl_seen_pip_hint';

/** Durée du clip source d'un boomerang (ms) avant auto-stop. */
const BOOMERANG_MS = 1600;

// Réexport pour compat (le type vit désormais dans services/settings).
export type { TimerSeconds };

/**
 * Paliers de zoom rapides « par objectif » dérivés des bornes de la caméra
 * principale : ultra grand-angle (0.5×) si dispo, principal (1×), puis les
 * téléobjectifs usuels (2× / 5× / 10×) tant que l'appareil les atteint. Sur un
 * device logique multi-objectifs, franchir ces paliers bascule physiquement de
 * capteur (grand-angle → télé).
 */
function buildZoomLevels(min: number, max: number): number[] {
  const levels: number[] = [];
  if (min <= 0.6) levels.push(0.5); // ultra grand-angle si dispo
  levels.push(1); // principal
  for (const z of [2, 5, 10]) {
    if (max + 0.05 >= z) levels.push(z); // téléobjectifs disponibles
  }
  return levels;
}

/**
 * Écran principal — VisionCamera v5 multi-caméra, UI Material 3, Android.
 */
export function MultiCameraScreen(): React.ReactElement {
  const { width, height } = useWindowDimensions();
  const permissions = useMultiCamPermissions();
  const isForeground = useIsForeground();

  const cam = useMultiCam(isForeground, permissions.allGranted);
  const { introMode, dismissIntro } = useIntro(permissions.allGranted);
  const { t } = useTranslation();
  const update = useInAppUpdate();
  const geo = useGeotag();

  const [primarySlot, setPrimarySlot] = useState<CameraSlot>('back');
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [torchOn, setTorchOn] = useState(false);
  const [photoFlash, setPhotoFlash] = useState<PhotoFlashMode>('off');
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomDisplay, setZoomDisplay] = useState<number | null>(null);
  const [zoomNonce, setZoomNonce] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [pipHintVisible, setPipHintVisible] = useState(false);
  const [volumeKeyAction, setVolumeKeyActionState] = useState<VolumeKeyAction>('volume');
  const [stabilization, setStabilizationState] = useState(true);
  const [timerSeconds, setTimerSecondsState] = useState<TimerSeconds>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [grid, setGridState] = useState(false);
  const [level, setLevelState] = useState(false);
  const [burstCount, setBurstCountState] = useState<BurstCount>(1);
  const focusNonce = useRef(0);
  const lastZoomUpdate = useRef(0);
  const pipHintChecked = useRef(false);
  const pipRef = useRef<PipCompositorHandle>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const holdStillOpacity = useRef(new Animated.Value(0)).current;
  const wasBusy = useRef(false);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const styles = useThemedStyles(makeStyles);

  // Injecte le compositeur PiP (view-shot) dans le contrôleur natif.
  useEffect(() => {
    cam.controller.setPipComposer((primary, secondary) => {
      const handle = pipRef.current;
      return handle != null
        ? handle.compose(primary, secondary)
        : Promise.reject(new Error('Compositeur PiP indisponible'));
    });
    return () => cam.controller.setPipComposer(null);
  }, [cam.controller]);

  // Branche le composeur vidéo natif (Foreground Service) s'il est dans le build.
  useEffect(() => {
    if (!isVideoPipComposerAvailable) return;
    cam.controller.setVideoComposer((primary, secondary, opts) => composePipVideo(primary, secondary, opts));
    cam.controller.setPhotoComposer((primary, secondary, opts) => composePipPhoto(primary, secondary, opts));
    const sub = subscribeVideoPipProgress((p) => setVideoProgress(p));
    return () => {
      cam.controller.setVideoComposer(null);
      cam.controller.setPhotoComposer(null);
      sub.remove();
    };
  }, [cam.controller]);

  // Notifications (barre de progression du Foreground Service) : demandées
  // SEULEMENT une fois les permissions cœur accordées, pour ne pas entrer en
  // collision avec les dialogues caméra/micro/galerie au 1er lancement (Android
  // n'affiche qu'un dialogue de permission à la fois).
  useEffect(() => {
    if (!isVideoPipComposerAvailable || !permissions.allGranted) return;
    requestVideoPipNotificationsPermission();
  }, [permissions.allGranted]);

  // Réinitialise la progression quand plus aucun traitement n'est en cours.
  useEffect(() => {
    if (cam.processingCount === 0) setVideoProgress(null);
  }, [cam.processingCount]);

  // Géotag : reflète l'état actif dans le contrôleur et lui fournit la position.
  useEffect(() => {
    cam.controller.setGeotag(geo.enabled);
    cam.controller.setLocationProvider(geo.getCoords);
    return () => cam.controller.setLocationProvider(null);
  }, [cam.controller, geo.enabled, geo.getCoords]);

  const onToggleGeotag = useCallback(() => {
    void geo.requestToggle().then((res) => {
      if (res === 'denied') cam.controller.showNotice('error', t('notices.locationDenied'));
    });
  }, [geo, cam.controller, t]);

  const dismissPipHint = useCallback(() => {
    setPipHintVisible((visible) => {
      if (visible) void AsyncStorage.setItem(PIP_HINT_KEY, '1').catch(() => {});
      return false;
    });
  }, []);

  // Hint d'inversion PiP : affiché une seule fois, au 1er lancement en multi-cam.
  useEffect(() => {
    if (cam.mode !== 'multi' || pipHintChecked.current) return;
    pipHintChecked.current = true;
    let cancelled = false;
    void AsyncStorage.getItem(PIP_HINT_KEY)
      .then((seen) => {
        if (!cancelled && seen == null) setPipHintVisible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cam.mode]);

  // Auto-masquage après 4 s.
  useEffect(() => {
    if (!pipHintVisible) return;
    const id = setTimeout(dismissPipHint, 4000);
    return () => clearTimeout(id);
  }, [pipHintVisible, dismissPipHint]);

  const swap = useCallback(() => {
    haptics.selection();
    dismissPipHint();
    setPrimarySlot((prev) => {
      const next: CameraSlot = prev === 'back' ? 'front' : 'back';
      cam.controller.setPrimarySlot(next);
      setCurrentZoom(cam.controller.getZoomBounds(next).current);
      return next;
    });
  }, [cam.controller, dismissPipHint]);

  const toggleTorch = useCallback(() => {
    haptics.selection();
    setTorchOn((prev) => {
      const next = !prev;
      void cam.controller.setTorch('back', next ? 'on' : 'off');
      return next;
    });
  }, [cam.controller]);

  const onSetPhotoFlash = useCallback((m: PhotoFlashMode) => {
    setPhotoFlash(m);
    saveSetting('photoFlash', m);
  }, []);

  const cyclePhotoFlash = useCallback(() => {
    haptics.selection();
    const next: PhotoFlashMode = photoFlash === 'off' ? 'auto' : photoFlash === 'auto' ? 'on' : 'off';
    onSetPhotoFlash(next);
  }, [photoFlash, onSetPhotoFlash]);

  const onSetMode = useCallback((m: CaptureMode) => {
    setMode(m);
    saveSetting('mode', m);
  }, []);

  // Synchronise le mode boomerang côté contrôleur (lu à la fin de l'enregistrement).
  useEffect(() => {
    cam.controller.setBoomerangMode(mode === 'boomerang');
  }, [mode, cam.controller]);

  // Capture réelle : flash blanc instantané puis capture async (l'overlay
  // « Ne bougez pas » est piloté séparément par l'état isBusy du contrôleur).
  // En rafale (burstCount > 1), N captures séquentielles : chaque capturePhoto
  // libère l'obturateur juste après la capture brute (la composition part en
  // tâche de fond), la suivante peut donc s'enchaîner naturellement.
  const burstingRef = useRef(false);
  const doCapture = useCallback(() => {
    const flash = (dur: number) => {
      haptics.medium();
      flashOpacity.setValue(0.9);
      Animated.timing(flashOpacity, { toValue: 0, duration: dur, useNativeDriver: true }).start();
    };
    if (burstCount <= 1) {
      flash(200);
      void cam.controller.capturePhoto(photoFlash);
      return;
    }
    if (burstingRef.current) return; // évite deux rafales qui se chevauchent
    burstingRef.current = true;
    void (async () => {
      try {
        for (let i = 0; i < burstCount; i++) {
          flash(150);
          await cam.controller.capturePhoto(photoFlash);
          if (i < burstCount - 1) await new Promise((r) => setTimeout(r, 140));
        }
      } finally {
        burstingRef.current = false;
      }
    })();
  }, [cam.controller, photoFlash, flashOpacity, burstCount]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current != null) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    setCountdown(null);
  }, []);

  // Obturateur photo : capture immédiate, ou décompte du retardateur. Un second
  // appui pendant le décompte l'annule. Le décompte ne fait QUE décrémenter un
  // état (updater pur) ; le tick haptique et la capture à 0 sont gérés par l'effet
  // ci-dessous (évite tout effet de bord dans un updater — safe en StrictMode).
  const onPhoto = useCallback(() => {
    if (countdownTimer.current != null) {
      cancelCountdown();
      return;
    }
    if (timerSeconds <= 0) {
      doCapture();
      return;
    }
    setCountdown(timerSeconds);
    countdownTimer.current = setInterval(() => {
      setCountdown((prev) => (prev == null ? null : prev - 1));
    }, 1000);
  }, [timerSeconds, doCapture, cancelCountdown]);

  // Pilote le décompte : bip à chaque seconde, capture quand il atteint 0.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      if (countdownTimer.current != null) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = null;
      }
      setCountdown(null);
      doCapture();
    } else {
      haptics.selection();
    }
  }, [countdown, doCapture]);

  const onSelectZoom = useCallback(
    (level: number) => {
      const { min, max } = cam.controller.getZoomBounds(primarySlot);
      const z = Math.min(max, Math.max(min, level));
      void cam.controller.setZoom(primarySlot, z);
      setCurrentZoom(z);
      setZoomDisplay(z);
      setZoomNonce((n) => n + 1);
      haptics.selection();
    },
    [cam.controller, primarySlot],
  );

  // Paliers de zoom rapides selon les bornes de la caméra principale.
  const zoomLevels = useMemo(() => {
    const { min, max } = cam.controller.getZoomBounds(primarySlot);
    return buildZoomLevels(min, max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.controller, primarySlot, cam.status]);

  // Bornes de compensation d'exposition (EV) de la caméra principale.
  const exposureBounds = useMemo(
    () => cam.controller.getExposureBounds(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cam.controller, cam.status],
  );
  const onSetExposure = useCallback(
    (v: number) => {
      void cam.controller.setExposureBias(v);
    },
    [cam.controller],
  );
  const toggleAeLock = useCallback(() => {
    haptics.selection();
    void cam.controller.setAeLock(!cam.aeLocked);
  }, [cam.controller, cam.aeLocked]);

  const boomerangTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onToggleRecording = useCallback(() => {
    if (cam.isRecording) {
      if (boomerangTimer.current != null) {
        clearTimeout(boomerangTimer.current);
        boomerangTimer.current = null;
      }
      haptics.medium();
      void cam.controller.stopRecording();
    } else {
      haptics.heavy();
      void cam.controller.startRecording();
      // Boomerang : clip court auto-stoppé (le natif le boucle avant/arrière).
      if (mode === 'boomerang') {
        boomerangTimer.current = setTimeout(() => {
          boomerangTimer.current = null;
          void cam.controller.stopRecording();
        }, BOOMERANG_MS);
      }
    }
  }, [cam.controller, cam.isRecording, mode]);

  useEffect(
    () => () => {
      if (boomerangTimer.current != null) clearTimeout(boomerangTimer.current);
    },
    [],
  );

  const setPhotoSaveMode = useCallback(
    (m: SaveMode) => {
      cam.controller.setPhotoSaveMode(m);
      saveSetting('photoSaveMode', m);
    },
    [cam.controller],
  );
  const setVideoSaveMode = useCallback(
    (m: SaveMode) => {
      cam.controller.setVideoSaveMode(m);
      saveSetting('videoSaveMode', m);
    },
    [cam.controller],
  );
  const setPipCorner = useCallback(
    (c: PipCorner) => {
      cam.controller.setPipCorner(c); // réinitialise aussi la position libre
      saveSetting('pipCorner', c);
      saveSetting('pipInset', null); // retour au coin
    },
    [cam.controller],
  );
  const setLayout = useCallback(
    (l: CompositionLayout) => {
      cam.controller.setLayout(l);
      saveSetting('layout', l);
    },
    [cam.controller],
  );
  const onMovePip = useCallback(
    (inset: PipInset) => {
      cam.controller.setPipInset(inset);
      saveSetting('pipInset', inset);
    },
    [cam.controller],
  );
  const setWatermark = useCallback(
    (value: boolean) => {
      cam.controller.setWatermark(value);
      saveSetting('watermark', value);
    },
    [cam.controller],
  );
  const setOutputRatio = useCallback(
    (r: OutputRatio) => {
      cam.controller.setOutputRatio(r);
      saveSetting('outputRatio', r);
    },
    [cam.controller],
  );
  const setQuality = useCallback(
    (q: CaptureQuality) => {
      void cam.controller.setQuality(q);
      saveSetting('captureQuality', q);
    },
    [cam.controller],
  );
  const setVideoFps = useCallback(
    (fps: VideoFps) => {
      void cam.controller.setVideoFps(fps);
      saveSetting('videoFps', fps);
    },
    [cam.controller],
  );
  const setBoomerangGif = useCallback(
    (v: boolean) => {
      cam.controller.setBoomerangGif(v);
      saveSetting('boomerangGif', v);
    },
    [cam.controller],
  );

  const toggleSecondaryPreview = useCallback(() => {
    haptics.selection();
    const next = !cam.showSecondaryPreview;
    cam.controller.setShowSecondaryPreview(next);
    saveSetting('showSecondaryPreview', next);
  }, [cam.controller, cam.showSecondaryPreview]);

  const setVolumeKeyAction = useCallback((a: VolumeKeyAction) => {
    setVolumeKeyActionState(a);
    saveSetting('volumeKeyAction', a);
  }, []);

  // Restaure TOUS les réglages persistés (source unique : services/settings) et les
  // applique au contrôleur / state. Corrige le « reset au démarrage » : sur Samsung
  // le process est tué souvent, donc CHAQUE réglage doit être persisté + restauré ici.
  const applyPersisted = useCallback(
    (s: Partial<PersistedSettings>) => {
      const c = cam.controller;
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
      if (s.showSecondaryPreview != null) c.setShowSecondaryPreview(s.showSecondaryPreview);
      if (s.photoFlash != null) setPhotoFlash(s.photoFlash);
      if (s.mode != null) setMode(s.mode);
      if (s.grid != null) setGridState(s.grid);
      if (s.level != null) setLevelState(s.level);
      if (s.burstCount != null) setBurstCountState(s.burstCount);
    },
    [cam.controller],
  );

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

  useEffect(() => {
    let cancelled = false;
    void loadPersistedSettings().then((s) => {
      if (!cancelled) applyPersisted(s);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPersisted]);

  const setStabilization = useCallback((value: boolean) => {
    setStabilizationState(value);
    saveSetting('stabilization', value);
  }, []);

  const setCaptureSpeed = useCallback(
    (s: CaptureSpeed) => {
      void cam.controller.setCaptureSpeed(s);
      saveSetting('captureSpeed', s);
    },
    [cam.controller],
  );

  const setTimerSeconds = useCallback((s: TimerSeconds) => {
    setTimerSecondsState(s);
    saveSetting('timerSeconds', s);
  }, []);

  const setShutterSound = useCallback(
    (value: boolean) => {
      cam.controller.setShutterSound(value);
      saveSetting('shutterSound', value);
    },
    [cam.controller],
  );

  // Overlay « Ne bougez pas » : visible exactement pendant la capture réelle
  // (fenêtre isBusy) en mode photo, si l'anti-flou est actif.
  const holdStillVisible = stabilization && mode === 'photo' && cam.isBusy;
  useEffect(() => {
    Animated.timing(holdStillOpacity, {
      toValue: holdStillVisible ? 1 : 0,
      duration: holdStillVisible ? 90 : 160,
      useNativeDriver: true,
    }).start();
  }, [holdStillVisible, holdStillOpacity]);

  // Haptique de fin : quand la capture photo se termine (isBusy true -> false),
  // signale « c'est bon, tu peux rebouger ».
  useEffect(() => {
    if (wasBusy.current && !cam.isBusy && mode === 'photo') haptics.light();
    wasBusy.current = cam.isBusy;
  }, [cam.isBusy, mode]);

  // Annule un décompte en cours si on quitte le mode photo ou qu'un panneau s'ouvre.
  useEffect(() => {
    if (mode !== 'photo' || settingsOpen || galleryOpen) cancelCountdown();
  }, [mode, settingsOpen, galleryOpen, cancelCountdown]);

  // Nettoyage du timer au démontage.
  useEffect(() => () => cancelCountdown(), [cancelCountdown]);

  const zoomBy = useCallback(
    (dir: 'in' | 'out') => {
      const { min, max, current } = cam.controller.getZoomBounds(primarySlot);
      const step = Math.max(0.1, (max - min) / 15);
      const z = Math.min(max, Math.max(min, current + (dir === 'in' ? step : -step)));
      void cam.controller.setZoom(primarySlot, z);
      setCurrentZoom(z);
      setZoomDisplay(z);
      setZoomNonce((n) => n + 1);
      haptics.selection();
    },
    [cam.controller, primarySlot],
  );

  // Redirige les touches matérielles vers l'obturateur/zoom, seulement quand la
  // caméra est prête et qu'aucun sheet/galerie n'est ouvert (sinon volume normal).
  useVolumeShutter({
    action: volumeKeyAction,
    enabled:
      cam.status === 'running' && permissions.allGranted && !settingsOpen && !galleryOpen,
    onShutter: () => {
      if (mode === 'photo') onPhoto();
      else onToggleRecording();
    },
    onZoom: zoomBy,
  });

  // Tap-to-focus + pinch-to-zoom sur la caméra principale.
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((event) => {
        focusNonce.current += 1;
        setFocusPoint({ x: event.x, y: event.y, nonce: focusNonce.current });
        void cam.controller.focusAt(primarySlot, event.x / width, event.y / height);
      });

    let zoomBase = 1;
    const pinch = Gesture.Pinch()
      .onBegin(() => {
        zoomBase = cam.controller.getZoomBounds(primarySlot).current;
      })
      .onUpdate((event) => {
        const { min, max } = cam.controller.getZoomBounds(primarySlot);
        const zoom = Math.min(max, Math.max(min, zoomBase * event.scale));
        void cam.controller.setZoom(primarySlot, zoom);
        const now = Date.now();
        if (now - lastZoomUpdate.current > 80) {
          lastZoomUpdate.current = now;
          setZoomDisplay(zoom);
          setCurrentZoom(zoom);
          setZoomNonce((n) => n + 1);
        }
      })
      .onEnd(() => {
        const { current } = cam.controller.getZoomBounds(primarySlot);
        setZoomDisplay(current);
        setCurrentZoom(current);
        setZoomNonce((n) => n + 1);
      });

    return Gesture.Simultaneous(tap, pinch);
  }, [cam.controller, primarySlot, width, height]);

  const modeLabel = cam.mode === 'multi' ? t('mode.dual') : cam.mode === 'single' ? t('mode.single') : '—';

  return (
    <PermissionGate permissions={permissions}>
      <View style={styles.root}>
        {cam.status === 'error' ? (
          <CameraErrorView message={cam.errorMessage} onRetry={() => void cam.controller.retry()} />
        ) : (
          <>
            <MultiCamPreview
              backPreview={cam.backPreview}
              frontPreview={cam.frontPreview}
              primarySlot={primarySlot}
              isMultiCam={cam.mode === 'multi'}
              isStarting={cam.status === 'starting' || cam.status === 'idle'}
              gesture={gesture}
              focusPoint={focusPoint}
              pipCorner={cam.pipCorner}
              pipInset={cam.pipInset}
              layout={cam.layout}
              onTapSecondary={swap}
              onMovePip={onMovePip}
              showSecondaryPreview={cam.showSecondaryPreview}
            />

            {cam.status === 'running' && cam.layout === 'pip' && <RatioMask ratio={cam.outputRatio} />}
            {cam.status === 'running' && <CameraGuides grid={grid} level={level} />}

            {cam.status === 'running' && exposureBounds.supported && !settingsOpen && !galleryOpen && (
              <ExposureControl
                min={exposureBounds.min}
                max={exposureBounds.max}
                value={cam.exposureBias}
                onChange={onSetExposure}
              />
            )}

            <ZoomIndicator zoom={zoomDisplay} nonce={zoomNonce} />

            <CameraTopBar
              modeLabel={modeLabel}
              torchOn={torchOn}
              photoFlash={photoFlash}
              flashSupported={cam.hasTorch}
              onCyclePhotoFlash={cyclePhotoFlash}
              onOpenSettings={() => setSettingsOpen(true)}
              aeLocked={cam.aeLocked}
              onToggleAeLock={toggleAeLock}
            />

            {update.updateAvailable && (
              <UpdateBanner onUpdate={update.startUpdate} onDismiss={update.snooze} />
            )}

            <ProcessingIndicator count={cam.processingCount} progress={videoProgress} />

            {cam.mode === 'single' && cam.status === 'running' && <UnsupportedBanner />}

            <CaptureControls
              mode={mode}
              onSetMode={onSetMode}
              isRecording={cam.isRecording}
              isBusy={cam.isBusy}
              onPhoto={onPhoto}
              onToggleRecording={onToggleRecording}
              onSwap={swap}
              canSwap={cam.mode === 'multi'}
              lastCapture={cam.lastCapture}
              processing={cam.processingCount > 0}
              onOpenReview={() => setGalleryOpen(true)}
              zoomLevels={zoomLevels}
              currentZoom={currentZoom}
              onSelectZoom={onSelectZoom}
            />

            {cam.mode === 'multi' && cam.showSecondaryPreview && (
              <PipHint visible={pipHintVisible} corner={cam.pipCorner} onDismiss={dismissPipHint} />
            )}

            {/* Flash d'obturateur (feedback instantané, blanc) */}
            <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

            {/* Anti-flou : voile sombre + « Ne bougez pas » pendant la capture réelle */}
            <Animated.View pointerEvents="none" style={[styles.holdStill, { opacity: holdStillOpacity }]}>
              <Text style={styles.holdStillText}>{t('capture.holdStill')}</Text>
            </Animated.View>

            {/* Retardateur : décompte plein écran, tap = annuler */}
            {countdown != null && (
              <Pressable
                style={styles.countdown}
                onPress={cancelCountdown}
                accessibilityRole="button"
                accessibilityLabel={t('capture.cancelTimerA11y')}
              >
                <Text style={styles.countdownText}>{countdown}</Text>
                <Text style={styles.countdownHint}>{t('capture.cancelTimer')}</Text>
              </Pressable>
            )}

            <SettingsSheet
              visible={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              canSwap={cam.mode === 'multi'}
              onSwap={swap}
              torch={torchOn}
              torchSupported={cam.hasTorch}
              onToggleTorch={toggleTorch}
              secondaryPreview={cam.showSecondaryPreview}
              secondaryPreviewSupported={cam.mode === 'multi'}
              onToggleSecondaryPreview={toggleSecondaryPreview}
              photoFlash={photoFlash}
              flashSupported={cam.hasTorch}
              onSetPhotoFlash={onSetPhotoFlash}
              photoSaveMode={cam.photoSaveMode}
              onSetPhotoSaveMode={setPhotoSaveMode}
              videoSaveMode={cam.videoSaveMode}
              onSetVideoSaveMode={setVideoSaveMode}
              pipCorner={cam.pipCorner}
              onSetPipCorner={setPipCorner}
              layout={cam.layout}
              onSetLayout={setLayout}
              outputRatio={cam.outputRatio}
              onSetOutputRatio={setOutputRatio}
              quality={cam.captureQuality}
              onSetQuality={setQuality}
              videoFps={cam.videoFps}
              onSetVideoFps={setVideoFps}
              boomerangGif={cam.boomerangGif}
              onToggleBoomerangGif={() => setBoomerangGif(!cam.boomerangGif)}
              volumeKeyAction={volumeKeyAction}
              onSetVolumeKeyAction={setVolumeKeyAction}
              stabilization={stabilization}
              onToggleStabilization={() => setStabilization(!stabilization)}
              captureSpeed={cam.captureSpeed}
              onSetCaptureSpeed={setCaptureSpeed}
              timerSeconds={timerSeconds}
              onSetTimerSeconds={setTimerSeconds}
              shutterSound={cam.shutterSound}
              onToggleShutterSound={() => setShutterSound(!cam.shutterSound)}
              geotag={geo.enabled}
              onToggleGeotag={onToggleGeotag}
              watermark={cam.watermark}
              onToggleWatermark={() => setWatermark(!cam.watermark)}
              grid={grid}
              onToggleGrid={() => setGrid(!grid)}
              level={level}
              onToggleLevel={() => setLevel(!level)}
              burstCount={burstCount}
              onSetBurstCount={setBurstCount}
            />

            <SessionGallery
              visible={galleryOpen}
              captures={cam.sessionCaptures}
              onClose={() => setGalleryOpen(false)}
              onDelete={(c) => cam.controller.removeCapture(c)}
            />

            <Snackbar notice={cam.notice} />
          </>
        )}

        {/* Surface de composition PiP (hors-écran) */}
        <PipCompositor
          ref={pipRef}
          corner={cam.pipCorner}
          canvasWidth={pipCanvasForQuality(cam.captureQuality)}
          layout={cam.layout}
          pipInset={cam.pipInset}
          watermark={cam.watermark}
          outputRatio={cam.outputRatio}
        />

        <IntroSheet mode={introMode} onClose={dismissIntro} />
      </View>
    </PermissionGate>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' },
  holdStill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdStillText: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  countdown: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: { color: '#fff', fontSize: 120, fontWeight: '200', fontVariant: ['tabular-nums'] },
  countdownHint: { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 8 },
});
