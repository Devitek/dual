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
import { MultiCamPreview } from '../components/MultiCamPreview';
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
import type { CameraSlot, CaptureQuality, CaptureSpeed, SaveMode } from '../vision/MultiCamController';
import type { CompositionLayout, PipCorner } from '../services/pipComposer';
import type { VolumeKeyAction } from '../native/volumeKeys';

/** Clé de persistance du hint « touchez la vignette » (1er lancement). */
const PIP_HINT_KEY = 'tl_seen_pip_hint';
/** Clé de persistance de l'action des touches de volume ('volume'|'shutter'|'zoom'). */
const VOLUME_KEY_ACTION_KEY = 'tl_volume_key_action';
/** Clé de persistance de l'anti-flou « Ne bougez pas » ('1'|'0'). */
const STABILIZATION_KEY = 'tl_stabilization';
/** Clé de persistance du compromis vitesse capture ('speed'|'balanced'|'quality'). */
const CAPTURE_SPEED_KEY = 'tl_capture_speed';
/** Clé de persistance du retardateur (secondes : '0'|'3'|'10'). */
const TIMER_KEY = 'tl_timer';
/** Clé de persistance du son d'obturateur ('1'|'0'). */
const SHUTTER_SOUND_KEY = 'tl_shutter_sound';
/** Clé de persistance de la disposition de fusion ('pip'|'sideBySide'|'topBottom'). */
const LAYOUT_KEY = 'tl_layout';
/** Valeurs possibles du retardateur (secondes). */
const TIMER_VALUES = [0, 3, 10] as const;
export type TimerSeconds = (typeof TIMER_VALUES)[number];

/** Paliers de zoom rapides dérivés des bornes de la caméra principale. */
function buildZoomLevels(min: number, max: number): number[] {
  const levels: number[] = [];
  if (min <= 0.6) levels.push(0.5); // ultra grand-angle si dispo
  levels.push(1);
  if (max >= 1.9) levels.push(2);
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
    cam.controller.setVideoComposer((primary, secondary, corner, bitRate, saveOriginals) =>
      composePipVideo(primary, secondary, corner, bitRate, saveOriginals),
    );
    cam.controller.setPhotoComposer((primary, secondary, corner, canvasWidth, saveOriginals) =>
      composePipPhoto(primary, secondary, corner, canvasWidth, saveOriginals),
    );
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

  const onSetPhotoFlash = useCallback((mode: PhotoFlashMode) => setPhotoFlash(mode), []);

  const cyclePhotoFlash = useCallback(() => {
    haptics.selection();
    setPhotoFlash((prev) => (prev === 'off' ? 'auto' : prev === 'auto' ? 'on' : 'off'));
  }, []);

  // Capture réelle : flash blanc instantané puis capture async (l'overlay
  // « Ne bougez pas » est piloté séparément par l'état isBusy du contrôleur).
  const doCapture = useCallback(() => {
    haptics.medium();
    flashOpacity.setValue(0.9);
    Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    void cam.controller.capturePhoto(photoFlash);
  }, [cam.controller, photoFlash, flashOpacity]);

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

  const onToggleRecording = useCallback(() => {
    if (cam.isRecording) {
      haptics.medium();
      void cam.controller.stopRecording();
    } else {
      haptics.heavy();
      void cam.controller.startRecording();
    }
  }, [cam.controller, cam.isRecording]);

  const setPhotoSaveMode = useCallback((m: SaveMode) => cam.controller.setPhotoSaveMode(m), [cam.controller]);
  const setVideoSaveMode = useCallback((m: SaveMode) => cam.controller.setVideoSaveMode(m), [cam.controller]);
  const setPipCorner = useCallback((c: PipCorner) => cam.controller.setPipCorner(c), [cam.controller]);
  const setLayout = useCallback(
    (l: CompositionLayout) => {
      cam.controller.setLayout(l);
      void AsyncStorage.setItem(LAYOUT_KEY, l).catch(() => {});
    },
    [cam.controller],
  );
  const setQuality = useCallback((q: CaptureQuality) => void cam.controller.setQuality(q), [cam.controller]);

  const toggleSecondaryPreview = useCallback(() => {
    haptics.selection();
    cam.controller.setShowSecondaryPreview(!cam.showSecondaryPreview);
  }, [cam.controller, cam.showSecondaryPreview]);

  // --- Touches de volume (obturateur / zoom) ---
  useEffect(() => {
    void AsyncStorage.getItem(VOLUME_KEY_ACTION_KEY)
      .then((v) => {
        if (v === 'shutter' || v === 'zoom' || v === 'volume') setVolumeKeyActionState(v);
      })
      .catch(() => {});
  }, []);

  const setVolumeKeyAction = useCallback((a: VolumeKeyAction) => {
    setVolumeKeyActionState(a);
    void AsyncStorage.setItem(VOLUME_KEY_ACTION_KEY, a).catch(() => {});
  }, []);

  // --- Anti-flou / vitesse / retardateur (persistés) ---
  useEffect(() => {
    void AsyncStorage.multiGet([STABILIZATION_KEY, CAPTURE_SPEED_KEY, TIMER_KEY, SHUTTER_SOUND_KEY])
      .then((entries) => {
        const map = Object.fromEntries(entries);
        if (map[STABILIZATION_KEY] === '0') setStabilizationState(false);
        const speed = map[CAPTURE_SPEED_KEY];
        if (speed === 'speed' || speed === 'balanced' || speed === 'quality') {
          void cam.controller.setCaptureSpeed(speed);
        }
        const timer = Number(map[TIMER_KEY]);
        if (timer === 3 || timer === 10) setTimerSecondsState(timer);
        if (map[SHUTTER_SOUND_KEY] === '0') cam.controller.setShutterSound(false);
        const layout = map[LAYOUT_KEY];
        if (layout === 'pip' || layout === 'sideBySide' || layout === 'topBottom') {
          cam.controller.setLayout(layout);
        }
      })
      .catch(() => {});
    // Au montage uniquement ; le contrôleur applique la vitesse au (re)build session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStabilization = useCallback((value: boolean) => {
    setStabilizationState(value);
    void AsyncStorage.setItem(STABILIZATION_KEY, value ? '1' : '0').catch(() => {});
  }, []);

  const setCaptureSpeed = useCallback(
    (s: CaptureSpeed) => {
      void cam.controller.setCaptureSpeed(s);
      void AsyncStorage.setItem(CAPTURE_SPEED_KEY, s).catch(() => {});
    },
    [cam.controller],
  );

  const setTimerSeconds = useCallback((s: TimerSeconds) => {
    setTimerSecondsState(s);
    void AsyncStorage.setItem(TIMER_KEY, String(s)).catch(() => {});
  }, []);

  const setShutterSound = useCallback(
    (value: boolean) => {
      cam.controller.setShutterSound(value);
      void AsyncStorage.setItem(SHUTTER_SOUND_KEY, value ? '1' : '0').catch(() => {});
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
              layout={cam.layout}
              onTapSecondary={swap}
              showSecondaryPreview={cam.showSecondaryPreview}
            />

            <ZoomIndicator zoom={zoomDisplay} nonce={zoomNonce} />

            <CameraTopBar
              modeLabel={modeLabel}
              torchOn={torchOn}
              photoFlash={photoFlash}
              flashSupported={cam.hasTorch}
              onCyclePhotoFlash={cyclePhotoFlash}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            {update.updateAvailable && (
              <UpdateBanner onUpdate={update.startUpdate} onDismiss={update.snooze} />
            )}

            <ProcessingIndicator count={cam.processingCount} progress={videoProgress} />

            {cam.mode === 'single' && cam.status === 'running' && <UnsupportedBanner />}

            <CaptureControls
              mode={mode}
              onSetMode={setMode}
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
              quality={cam.captureQuality}
              onSetQuality={setQuality}
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
        <PipCompositor ref={pipRef} corner={cam.pipCorner} canvasWidth={pipCanvasForQuality(cam.captureQuality)} layout={cam.layout} />
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
