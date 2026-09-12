import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { useZoomState } from '../hooks/useZoomState';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { useCaptureFlow, BOOMERANG_MAX_MS } from '../hooks/useCaptureFlow';
import { useSettingsWiring } from '../hooks/useSettingsWiring';
import { PermissionGate } from '../components/PermissionGate';
import { IntroSheet } from '../components/IntroSheet';
import { useIntro } from '../hooks/useIntro';
import { MultiCamPreview } from '../components/MultiCamPreview';
import { CameraGuides } from '../components/CameraGuides';
import { RatioMask } from '../components/RatioMask';
import { CaptureControls } from '../components/CaptureControls';
import type { CaptureMode } from '../components/ModeSwitch';
import { CameraTopBar, type PhotoFlashMode } from '../components/CameraTopBar';
import { SettingsSheet } from '../components/SettingsSheet';
import { MoreSettingsModal } from '../components/MoreSettingsModal';
import { ZoomIndicator } from '../components/ZoomIndicator';
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
  updateCaptureWidget,
} from '../native/videoPip';
import { haptics } from '../utils/haptics';
import type { FocusPoint } from '../components/FocusIndicator';
import { pipCanvasForQuality } from '../vision/MultiCamController';
import type { CameraSlot } from '../vision/MultiCamController';
import { saveSetting, type TimerSeconds } from '../services/settings';

/** Clé du hint « touchez la vignette » (1er lancement — one-shot, hors réglages). */
const PIP_HINT_KEY = 'tl_seen_pip_hint';
/** Hint one-shot « maintenir pour le boomerang » (1re fois en mode boomerang). */
const BOOM_HINT_KEY = 'tl_seen_boom_hint';

/** Durée fixe d'un boomerang déclenché par une touche de volume (pas d'appui long). */
const BOOMERANG_KEY_MS = 1500;
/** Modes indisponibles en repli séquentiel (vidéo simultanée impossible). Référence
 *  stable pour éviter les re-rendus de CaptureControls. */
const SEQUENTIAL_BLOCKED_MODES: CaptureMode[] = ['video', 'boomerang'];

// Réexport pour compat (le type vit désormais dans services/settings).
export type { TimerSeconds };

/**
 * Écran principal — VisionCamera v5 multi-caméra, UI Material 3, Android.
 * Orchestration seulement : zoom (useZoomState), flux de capture
 * (useCaptureFlow) et réglages persistés (useSettingsWiring) vivent dans des
 * hooks dédiés (#148).
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [pipHintVisible, setPipHintVisible] = useState(false);
  const [boomHint, setBoomHint] = useState(false);
  const focusNonce = useRef(0);
  const pipHintChecked = useRef(false);
  const pipRef = useRef<PipCompositorHandle>(null);
  const holdStillOpacity = useRef(new Animated.Value(0)).current;
  /** Mode demandé par un deep-link (widget/tuile) — prime sur le mode persisté. */
  const deepLinkMode = useRef<CaptureMode | null>(null);
  const wasBusy = useRef(false);
  const styles = useThemedStyles(makeStyles);

  // Repli séquentiel : la vidéo (et le boomerang) sont impossibles faute de flux
  // simultané. Le mode EFFECTIF est dérivé au rendu (pas de setState dans un
  // effet, #136) : la préférence `mode` reste intacte et revient d'elle-même
  // sur un appareil capable de multi-cam.
  const effectiveMode: CaptureMode = cam.mode === 'sequential' ? 'photo' : mode;

  // Le mode d'un deep-link (widget/tuile) prime sur le mode persisté.
  const onRestoreMode = useCallback((m: CaptureMode) => {
    if (deepLinkMode.current == null) setMode(m);
  }, []);

  const settings = useSettingsWiring({
    controller: cam.controller,
    showSecondaryPreview: cam.showSecondaryPreview,
    onRestorePhotoFlash: setPhotoFlash,
    onRestoreMode,
  });

  const zoom = useZoomState(cam.controller, primarySlot, cam.status);
  // Rotation des contenus de boutons selon l'orientation physique (#173),
  // activité verrouillée portrait (façon Google Camera). Capteur actif
  // uniquement caméra prête et app au premier plan.
  const uiRotation = useDeviceOrientation(cam.status === 'running' && isForeground);
  // Fonctions stables (useCallback) extraites pour les deps des callbacks/effets :
  // l'objet `zoom`/`flow` change à chaque rendu, pas ses fonctions.
  const { showZoom, showZoomThrottled, syncToSlot } = zoom;

  const flow = useCaptureFlow({
    controller: cam.controller,
    photoFlash,
    burstCount: settings.burstCount,
    timerSeconds: settings.timerSeconds,
    isRecording: cam.isRecording,
  });
  const { cancelCountdown } = flow;

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
    return () => {
      cam.controller.setVideoComposer(null);
      cam.controller.setPhotoComposer(null);
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
      syncToSlot(next);
      return next;
    });
  }, [cam.controller, dismissPipHint, syncToSlot]);

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

  // Changement de mode : annule un éventuel décompte (il n'a de sens qu'en mode
  // photo) — dans le handler, pas dans un effet (#136).
  const onSetMode = useCallback(
    (m: CaptureMode) => {
      if (m !== 'photo') cancelCountdown();
      setMode(m);
      saveSetting('mode', m);
    },
    [cancelCountdown],
  );

  // Ouverture d'un panneau : le décompte plein écran serait masqué -> annulation.
  const openSettings = useCallback(() => {
    cancelCountdown();
    setSettingsOpen(true);
  }, [cancelCountdown]);
  const openGallery = useCallback(() => {
    cancelCountdown();
    setGalleryOpen(true);
  }, [cancelCountdown]);

  // Synchronise le mode boomerang côté contrôleur (lu à la fin de l'enregistrement).
  useEffect(() => {
    cam.controller.setBoomerangMode(effectiveMode === 'boomerang');
  }, [effectiveMode, cam.controller]);

  // Widget d'accueil : miniature de la dernière capture (best-effort).
  useEffect(() => {
    const lc = cam.lastCapture;
    if (lc != null) updateCaptureWidget(lc.primaryUri, lc.kind);
  }, [cam.lastCapture]);

  // Deep-link du widget d'accueil : `twinlens://capture?mode=photo|video|boomerang`
  // -> ouvre l'app directement dans le mode demandé (démarrage à froid + à chaud).
  // `deepLinkMode` mémorise le mode demandé : la restauration des réglages
  // persistés (async, ordre d'arrivée non garanti) ne doit PAS l'écraser —
  // sinon le widget ouvrait l'app dans le DERNIER mode utilisé au cold start.
  useEffect(() => {
    const apply = (url: string | null): void => {
      if (url == null) return;
      const m = /[?&]mode=(photo|video|boomerang)/.exec(url);
      if (m != null) {
        deepLinkMode.current = m[1] as CaptureMode;
        onSetMode(m[1] as CaptureMode);
      }
    };
    void Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener('url', (e) => apply(e.url));
    return () => sub.remove();
  }, [onSetMode]);

  // Hint one-shot « maintenir » la 1re fois qu'on passe en mode boomerang.
  // Le rendu est conditionné au mode : pas de setState synchrone à la sortie
  // du mode (#136), le timer nettoie l'état en différé.
  useEffect(() => {
    if (effectiveMode !== 'boomerang') return;
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    void AsyncStorage.getItem(BOOM_HINT_KEY).then((seen) => {
      if (cancelled || seen === '1') return;
      setBoomHint(true);
      void AsyncStorage.setItem(BOOM_HINT_KEY, '1').catch(() => {});
      hideTimer = setTimeout(() => setBoomHint(false), 4500);
    });
    return () => {
      cancelled = true;
      if (hideTimer != null) clearTimeout(hideTimer);
    };
  }, [effectiveMode]);

  const toggleAeLock = useCallback(() => {
    haptics.selection();
    void cam.controller.setAeLock(!cam.aeLocked);
  }, [cam.controller, cam.aeLocked]);

  // Overlay « Ne bougez pas » : visible exactement pendant la capture réelle
  // (fenêtre isBusy) en mode photo, si l'anti-flou est actif.
  const holdStillVisible = settings.stabilization && effectiveMode === 'photo' && cam.isBusy;
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
    if (wasBusy.current && !cam.isBusy && effectiveMode === 'photo') haptics.light();
    wasBusy.current = cam.isBusy;
  }, [cam.isBusy, effectiveMode]);

  // Redirige les touches matérielles vers l'obturateur/zoom, seulement quand la
  // caméra est prête et qu'aucun sheet/galerie n'est ouvert (sinon volume normal).
  useVolumeShutter({
    action: settings.volumeKeyAction,
    enabled: cam.status === 'running' && permissions.allGranted && !settingsOpen && !moreOpen && !galleryOpen,
    onShutter: () => {
      if (effectiveMode === 'photo') flow.onPhoto();
      else if (effectiveMode === 'boomerang') {
        // Touche volume : pas d'appui long -> boomerang de durée fixe.
        flow.onBoomerangStart();
        setTimeout(flow.onBoomerangStop, BOOMERANG_KEY_MS);
      } else flow.onToggleRecording();
    },
    onZoom: zoom.zoomBy,
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
        const z = Math.min(max, Math.max(min, zoomBase * event.scale));
        void cam.controller.setZoom(primarySlot, z);
        showZoomThrottled(z);
      })
      .onEnd(() => {
        showZoom(cam.controller.getZoomBounds(primarySlot).current);
      });

    return Gesture.Simultaneous(tap, pinch);
  }, [cam.controller, primarySlot, width, height, showZoom, showZoomThrottled]);

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
              onMovePip={settings.onMovePip}
              showSecondaryPreview={cam.showSecondaryPreview}
            />

            {cam.status === 'running' && cam.layout === 'pip' && <RatioMask ratio={cam.outputRatio} />}
            {cam.status === 'running' && <CameraGuides grid={settings.grid} level={settings.level} />}

            <ZoomIndicator zoom={zoom.zoomDisplay} nonce={zoom.zoomNonce} />

            <CameraTopBar
              photoFlash={photoFlash}
              flashSupported={cam.hasTorch}
              onCyclePhotoFlash={cyclePhotoFlash}
              aeLocked={cam.aeLocked}
              onToggleAeLock={toggleAeLock}
              uiRotation={uiRotation}
            />

            {update.updateAvailable && <UpdateBanner onUpdate={update.startUpdate} onDismiss={update.snooze} />}

            {(cam.mode === 'single' || cam.mode === 'sequential') && cam.status === 'running' && (
              <UnsupportedBanner mode={cam.mode} diagnostics={cam.diagnostics} />
            )}

            <CaptureControls
              mode={effectiveMode}
              onSetMode={onSetMode}
              onOpenSettings={openSettings}
              blockedModes={cam.mode === 'sequential' ? SEQUENTIAL_BLOCKED_MODES : undefined}
              onBlockedMode={() => cam.controller.showNotice('error', t('sequential.videoBlocked'))}
              isRecording={cam.isRecording}
              isBusy={cam.isBusy}
              onPhoto={flow.onPhoto}
              onToggleRecording={flow.onToggleRecording}
              onBoomerangStart={flow.onBoomerangStart}
              onBoomerangStop={flow.onBoomerangStop}
              boomerangMaxMs={BOOMERANG_MAX_MS}
              onSwap={swap}
              canSwap={cam.mode === 'multi'}
              lastCapture={cam.lastCapture}
              processing={cam.processingCount > 0}
              onOpenReview={openGallery}
              zoomMin={zoom.zoomBounds.min}
              zoomMax={zoom.zoomBounds.max}
              zoomLevels={zoom.zoomLevels}
              currentZoom={zoom.currentZoom}
              onZoom={zoom.onZoom}
              uiRotation={uiRotation}
            />

            {boomHint && effectiveMode === 'boomerang' && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  bottom: 210,
                  alignSelf: 'center',
                  maxWidth: '80%',
                  // Fond >= 0.8 : garantit le contraste du texte blanc quel que
                  // soit le viseur derrière (#163).
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                  {t('capture.boomerangHint')}
                </Text>
              </View>
            )}

            {cam.mode === 'multi' && cam.showSecondaryPreview && (
              <PipHint visible={pipHintVisible} corner={cam.pipCorner} onDismiss={dismissPipHint} />
            )}

            {/* Repli séquentiel : indique l'étape en cours (arrière → avant). */}
            {cam.sequentialStep > 0 && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: '46%',
                  alignSelf: 'center',
                  maxWidth: '82%',
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                  {t('sequential.capturing', { step: cam.sequentialStep })}
                </Text>
              </View>
            )}

            {/* Flash d'obturateur (feedback instantané, blanc) */}
            <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flow.flashOpacity }]} />

            {/* Anti-flou : voile sombre + « Ne bougez pas » pendant la capture réelle */}
            <Animated.View pointerEvents="none" style={[styles.holdStill, { opacity: holdStillOpacity }]}>
              <Text style={styles.holdStillText}>{t('capture.holdStill')}</Text>
            </Animated.View>

            {/* Retardateur : décompte plein écran, tap = annuler */}
            {flow.countdown != null && (
              <Pressable
                style={styles.countdown}
                onPress={flow.cancelCountdown}
                accessibilityRole="button"
                accessibilityLabel={t('capture.cancelTimerA11y')}
              >
                <Text style={styles.countdownText}>{flow.countdown}</Text>
                <Text style={styles.countdownHint}>{t('capture.cancelTimer')}</Text>
              </Pressable>
            )}

            <SettingsSheet
              visible={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              onOpenMore={() => {
                setSettingsOpen(false);
                setMoreOpen(true);
              }}
              mode={effectiveMode}
              torch={torchOn}
              torchSupported={cam.hasTorch}
              onToggleTorch={toggleTorch}
              secondaryPreview={cam.showSecondaryPreview}
              secondaryPreviewSupported={cam.mode === 'multi'}
              onToggleSecondaryPreview={settings.toggleSecondaryPreview}
              layout={cam.layout}
              onSetLayout={settings.setLayout}
              timerSeconds={settings.timerSeconds}
              onSetTimerSeconds={settings.setTimerSeconds}
              burstCount={settings.burstCount}
              onSetBurstCount={settings.setBurstCount}
              boomerangGif={cam.boomerangGif}
              onToggleBoomerangGif={() => settings.setBoomerangGif(!cam.boomerangGif)}
              quality={cam.captureQuality}
              onSetQuality={settings.setQuality}
              captureSpeed={cam.captureSpeed}
              onSetCaptureSpeed={settings.setCaptureSpeed}
              outputRatio={cam.outputRatio}
              onSetOutputRatio={settings.setOutputRatio}
              photoSaveMode={cam.photoSaveMode}
              onSetPhotoSaveMode={settings.setPhotoSaveMode}
              videoSaveMode={cam.videoSaveMode}
              onSetVideoSaveMode={settings.setVideoSaveMode}
              videoFps={cam.videoFps}
              onSetVideoFps={settings.setVideoFps}
            />

            <MoreSettingsModal
              visible={moreOpen}
              onClose={() => setMoreOpen(false)}
              shutterSound={cam.shutterSound}
              onToggleShutterSound={() => settings.setShutterSound(!cam.shutterSound)}
              volumeKeyAction={settings.volumeKeyAction}
              onSetVolumeKeyAction={settings.setVolumeKeyAction}
              geotag={geo.enabled}
              onToggleGeotag={onToggleGeotag}
              grid={settings.grid}
              onToggleGrid={() => settings.setGrid(!settings.grid)}
              level={settings.level}
              onToggleLevel={() => settings.setLevel(!settings.level)}
              mirrorFront={cam.mirrorFront}
              onToggleMirrorFront={() => settings.setMirrorFront(!cam.mirrorFront)}
              watermark={cam.watermark}
              onToggleWatermark={() => settings.setWatermark(!cam.watermark)}
              stabilization={settings.stabilization}
              onToggleStabilization={() => settings.setStabilization(!settings.stabilization)}
              diagnostics={cam.diagnostics}
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
    countdownHint: { color: '#fff', fontSize: 15, marginTop: 8 },
  });
