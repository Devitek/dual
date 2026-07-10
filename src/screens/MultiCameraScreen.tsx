import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { useThemedStyles, type Palette } from '../theme/theme';
import { useIsForeground } from '../hooks/useIsForeground';
import { useMultiCamPermissions } from '../hooks/useMultiCamPermissions';
import { useMultiCam } from '../hooks/useMultiCam';
import { useInAppUpdate } from '../hooks/useInAppUpdate';
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
import type { CameraSlot, CaptureQuality, SaveMode } from '../vision/MultiCamController';
import type { PipCorner } from '../services/pipComposer';

/** Clé de persistance du hint « touchez la vignette » (1er lancement). */
const PIP_HINT_KEY = 'tl_seen_pip_hint';

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
  const focusNonce = useRef(0);
  const lastZoomUpdate = useRef(0);
  const pipHintChecked = useRef(false);
  const pipRef = useRef<PipCompositorHandle>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
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

  const onPhoto = useCallback(() => {
    haptics.medium();
    // Feedback visuel INSTANTANÉ (flash d'obturateur blanc), avant tout traitement async.
    flashOpacity.setValue(0.9);
    Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    void cam.controller.capturePhoto(photoFlash);
  }, [cam.controller, photoFlash, flashOpacity]);

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
  const setQuality = useCallback((q: CaptureQuality) => void cam.controller.setQuality(q), [cam.controller]);

  const toggleSecondaryPreview = useCallback(() => {
    haptics.selection();
    cam.controller.setShowSecondaryPreview(!cam.showSecondaryPreview);
  }, [cam.controller, cam.showSecondaryPreview]);

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
              quality={cam.captureQuality}
              onSetQuality={setQuality}
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
        <PipCompositor ref={pipRef} corner={cam.pipCorner} canvasWidth={pipCanvasForQuality(cam.captureQuality)} />
      </View>
    </PermissionGate>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' },
});
