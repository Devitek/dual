import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { colors } from '../theme/colors';
import { useIsForeground } from '../hooks/useIsForeground';
import { useMultiCamPermissions } from '../hooks/useMultiCamPermissions';
import { useMultiCam } from '../hooks/useMultiCam';
import { PermissionGate } from '../components/PermissionGate';
import { MultiCamPreview } from '../components/MultiCamPreview';
import { CaptureControls } from '../components/CaptureControls';
import { CameraTopBar, type PhotoFlashMode } from '../components/CameraTopBar';
import { SettingsSheet } from '../components/SettingsSheet';
import { ZoomIndicator } from '../components/ZoomIndicator';
import { ProcessingIndicator } from '../components/ProcessingIndicator';
import { UnsupportedBanner } from '../components/UnsupportedBanner';
import { SessionGallery } from '../components/SessionGallery';
import { PipCompositor, type PipCompositorHandle } from '../components/PipCompositor';
import { Snackbar } from '../components/Snackbar';
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

/**
 * Écran principal — VisionCamera v5 multi-caméra, UI Material 3, Android.
 */
export function MultiCameraScreen(): React.ReactElement {
  const { width, height } = useWindowDimensions();
  const permissions = useMultiCamPermissions();
  const isForeground = useIsForeground();

  const cam = useMultiCam(isForeground, permissions.allGranted);

  const [primarySlot, setPrimarySlot] = useState<CameraSlot>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [photoFlash, setPhotoFlash] = useState<PhotoFlashMode>('off');
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomDisplay, setZoomDisplay] = useState<number | null>(null);
  const [zoomNonce, setZoomNonce] = useState(0);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const focusNonce = useRef(0);
  const lastZoomUpdate = useRef(0);
  const pipRef = useRef<PipCompositorHandle>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;

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
    requestVideoPipNotificationsPermission();
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

  // Réinitialise la progression quand plus aucun traitement n'est en cours.
  useEffect(() => {
    if (cam.processingCount === 0) setVideoProgress(null);
  }, [cam.processingCount]);

  const swap = useCallback(() => {
    haptics.selection();
    setPrimarySlot((prev) => {
      const next: CameraSlot = prev === 'back' ? 'front' : 'back';
      cam.controller.setPrimarySlot(next);
      return next;
    });
  }, [cam.controller]);

  const toggleTorch = useCallback(() => {
    haptics.selection();
    setTorchOn((prev) => {
      const next = !prev;
      void cam.controller.setTorch('back', next ? 'on' : 'off');
      return next;
    });
  }, [cam.controller]);

  const onSetPhotoFlash = useCallback((mode: PhotoFlashMode) => setPhotoFlash(mode), []);

  const onPhoto = useCallback(() => {
    haptics.medium();
    // Feedback visuel INSTANTANÉ (flash d'obturateur), avant tout traitement async.
    flashOpacity.setValue(0.85);
    Animated.timing(flashOpacity, { toValue: 0, duration: 240, useNativeDriver: true }).start();
    void cam.controller.capturePhoto(photoFlash);
  }, [cam.controller, photoFlash, flashOpacity]);

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
          setZoomNonce((n) => n + 1);
        }
      })
      .onEnd(() => {
        setZoomDisplay(cam.controller.getZoomBounds(primarySlot).current);
        setZoomNonce((n) => n + 1);
      });

    return Gesture.Simultaneous(tap, pinch);
  }, [cam.controller, primarySlot, width, height]);

  const modeLabel = cam.mode === 'multi' ? 'Dual' : cam.mode === 'single' ? 'Simple' : '—';

  return (
    <PermissionGate permissions={permissions}>
      <View style={styles.root}>
        {cam.status === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.msg}>{cam.errorMessage ?? 'Erreur caméra.'}</Text>
          </View>
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
            />

            <ZoomIndicator zoom={zoomDisplay} nonce={zoomNonce} />

            <CameraTopBar
              modeLabel={modeLabel}
              torchOn={torchOn}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            <ProcessingIndicator count={cam.processingCount} progress={videoProgress} />

            {cam.mode === 'single' && cam.status === 'running' && <UnsupportedBanner />}

            <CaptureControls
              isRecording={cam.isRecording}
              isBusy={cam.isBusy}
              onPhoto={onPhoto}
              onToggleRecording={onToggleRecording}
              lastCapture={cam.lastCapture}
              processing={cam.processingCount > 0}
              onOpenReview={() => setGalleryOpen(true)}
            />

            {/* Flash d'obturateur (feedback instantané) */}
            <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

            <SettingsSheet
              visible={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              canSwap={cam.mode === 'multi'}
              onSwap={swap}
              torch={torchOn}
              torchSupported={cam.hasTorch}
              onToggleTorch={toggleTorch}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { color: colors.onSurface, fontSize: 16, textAlign: 'center' },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
});
