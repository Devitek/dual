import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { ModeSwitch, type CaptureMode } from './ModeSwitch';
import { ZoomBar } from './ZoomBar';
import type { CapturedMedia } from '../vision/MultiCamController';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// Anneau de progression du boomerang (rayon aligné sur le bord du bouton 70px).
const RING_R = 33;
const RING_C = 2 * Math.PI * RING_R;

interface CaptureControlsProps {
  mode: CaptureMode;
  onSetMode: (mode: CaptureMode) => void;
  isRecording: boolean;
  isBusy: boolean;
  onPhoto: () => void;
  onToggleRecording: () => void;
  /** Boomerang : appui long. Démarre/arrête l'enregistrement (le natif le boucle). */
  onBoomerangStart: () => void;
  onBoomerangStop: () => void;
  /** Durée max (ms) de l'appui long boomerang -> durée de remplissage de l'anneau. */
  boomerangMaxMs: number;
  /** Inversion arrière/avant (remplace l'ancien bouton rec de droite). */
  onSwap: () => void;
  /** false en mono-caméra : le bouton d'inversion est grisé. */
  canSwap?: boolean;
  lastCapture: CapturedMedia | null;
  /** true si une composition/sauvegarde tourne en arrière-plan. */
  processing?: boolean;
  /** Ouvre la revue de la dernière capture. */
  onOpenReview: () => void;
  // Paliers de zoom rapides
  zoomLevels: number[];
  currentZoom: number;
  onSelectZoom: (level: number) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Barre de capture inférieure — modèle appareil photo classique :
 *   [ ZoomBar ] [ ModeSwitch Photo|Vidéo ] [ miniature · obturateur unique · inversion ].
 * L'obturateur unique s'adapte au mode (photo/vidéo, repos/enregistrement).
 */
export function CaptureControls({
  mode,
  onSetMode,
  isRecording,
  isBusy,
  onPhoto,
  onToggleRecording,
  onBoomerangStart,
  onBoomerangStop,
  boomerangMaxMs,
  onSwap,
  canSwap = true,
  lastCapture,
  processing = false,
  onOpenReview,
  zoomLevels,
  currentZoom,
  onSelectZoom,
}: CaptureControlsProps): React.ReactElement {
  const [elapsed, setElapsed] = useState(0);
  const thumbScale = useRef(new Animated.Value(1)).current;
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => clearInterval(id);
  }, [isRecording]);

  // Léger « bounce » de la miniature à chaque nouvelle capture.
  useEffect(() => {
    if (lastCapture == null) return;
    thumbScale.setValue(1);
    Animated.sequence([
      Animated.timing(thumbScale, { toValue: 1.15, duration: 110, useNativeDriver: true }),
      Animated.spring(thumbScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [lastCapture, thumbScale]);

  const boomerang = mode === 'boomerang';
  const isVideo = mode === 'video' || boomerang;
  const shutterDisabled = isVideo ? isBusy && !isRecording : isBusy;
  const onShutter = mode === 'video' ? onToggleRecording : onPhoto;
  const swapDisabled = !canSwap || isRecording;

  // Boomerang : appui long -> l'anneau se remplit sur `boomerangMaxMs` puis
  // arrête tout seul ; relâcher avant la fin arrête aussi (durée = temps tenu).
  const ring = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef<Animated.CompositeAnimation | null>(null);
  const holdingRef = useRef(false);
  const [holding, setHolding] = useState(false);

  const startBoom = (): void => {
    if (holdingRef.current || shutterDisabled) return;
    holdingRef.current = true;
    setHolding(true);
    onBoomerangStart();
    ring.setValue(0);
    ringAnim.current = Animated.timing(ring, {
      toValue: 1,
      duration: boomerangMaxMs,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset SVG -> pas de native driver
    });
    ringAnim.current.start(({ finished }) => {
      if (finished && holdingRef.current) stopBoom();
    });
  };
  const stopBoom = (): void => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    ringAnim.current?.stop();
    ring.setValue(0);
    onBoomerangStop();
  };

  const innerStyle = boomerang
    ? styles.shutterRecDot
    : isVideo
      ? isRecording
        ? styles.shutterRecStop
        : styles.shutterRecDot
      : styles.shutterPhoto;
  const ringOffset = ring.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] });

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom + 8, 34) }]}
      pointerEvents="box-none"
    >
      {isRecording && !boomerang && (
        <View style={styles.timer}>
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
        </View>
      )}

      <View style={styles.stack}>
        <ZoomBar levels={zoomLevels} current={currentZoom} onSelect={onSelectZoom} />

        <ModeSwitch mode={mode} onChange={onSetMode} disabled={isRecording} />

        <View style={styles.bar}>
          {/* Gauche : miniature de la dernière capture (+ indicateur de traitement) */}
          <View style={styles.zone}>
            {lastCapture != null ? (
              <Animated.View style={{ transform: [{ scale: thumbScale }] }}>
                <Pressable
                  style={({ pressed }) => [styles.thumbWrap, pressed && styles.pressed]}
                  onPress={onOpenReview}
                  accessibilityLabel={t('capture.thumbnailA11y')}
                >
                  {lastCapture.kind === 'photo' ? (
                    <Image source={{ uri: lastCapture.primaryUri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.videoThumb]}>
                      <MaterialIcons name="play-arrow" size={22} color={colors.onSurface} />
                    </View>
                  )}
                  {lastCapture.secondaryUri != null && (
                    <View style={styles.dualBadge}>
                      <Text style={styles.dualBadgeText}>PiP</Text>
                    </View>
                  )}
                  {processing && (
                    <View style={styles.processingOverlay}>
                      <ActivityIndicator size="small" color={colors.onSurface} />
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            ) : processing ? (
              <View style={[styles.thumbWrap, styles.processingEmpty]}>
                <ActivityIndicator color={colors.onSurface} />
              </View>
            ) : null}
          </View>

          {/* Centre : obturateur unique (photo / vidéo repos / vidéo en cours) */}
          <View style={styles.zone}>
            <Pressable
              onPress={boomerang ? undefined : onShutter}
              onPressIn={boomerang ? startBoom : undefined}
              onPressOut={boomerang ? stopBoom : undefined}
              disabled={shutterDisabled}
              style={styles.shutterOuter}
              accessibilityRole="button"
              accessibilityLabel={
                boomerang
                  ? t('capture.boomerangHoldA11y')
                  : isVideo
                    ? isRecording
                      ? t('capture.recStopA11y')
                      : t('capture.recStartA11y')
                    : t('capture.shutterPhotoA11y')
              }
            >
              {holding && (
                <Svg width={70} height={70} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <AnimatedCircle
                    cx={35}
                    cy={35}
                    r={RING_R}
                    fill="none"
                    stroke={colors.danger}
                    strokeWidth={4}
                    strokeDasharray={`${RING_C} ${RING_C}`}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                    originX={35}
                    originY={35}
                    rotation={-90}
                  />
                </Svg>
              )}
              <View style={[innerStyle, shutterDisabled && styles.shutterBusy]} />
            </Pressable>
          </View>

          {/* Droite : inversion des caméras */}
          <View style={styles.zone}>
            <Pressable
              onPress={onSwap}
              disabled={swapDisabled}
              style={({ pressed }) => [styles.swapButton, pressed && styles.pressed, swapDisabled && styles.swapDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.swapA11y')}
            >
              <MaterialIcons name="cameraswitch" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // paddingBottom appliqué dynamiquement (safe-area) : réserve la barre
    // système (navigation 3 boutons ~48dp vs gestuelle ~24dp) pour ne pas
    // masquer l'obturateur et les contrôles.
    alignItems: 'center',
  },
  stack: { alignItems: 'center', gap: 16, width: '100%' },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.overlayStrong,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 16,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  timerText: { color: colors.onSurface, fontVariant: ['tabular-nums'], fontSize: 15, fontWeight: '600' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '86%',
  },
  zone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shutterOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: colors.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPhoto: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.onSurface },
  shutterRecDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.danger },
  shutterRecStop: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.danger },
  shutterBusy: { opacity: 0.4 },
  swapButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.onSurface,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  videoThumb: { backgroundColor: colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  dualBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  dualBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  processingEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
  },
});
