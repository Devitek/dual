import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  type ComposedGesture,
  type GestureType,
} from 'react-native-gesture-handler';
import { NativePreviewView, type CameraPreviewOutput } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { FocusIndicator, type FocusPoint } from './FocusIndicator';
import {
  PIP_INSET_ASPECT,
  PIP_INSET_MAX_W,
  PIP_INSET_MIN_W,
  type CompositionLayout,
  type PipCorner,
  type PipInset,
} from '../services/pipComposer';
import type { CameraSlot } from '../vision/MultiCamController';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Marges d'écran pour ne pas cacher la barre haute / les contrôles bas. */
const PIP_TOP_LIMIT = 80;
const PIP_BOTTOM_LIMIT = 150;
const PIP_SIDE_MARGIN = 12;

/** Position de la vignette PiP selon le coin (dégage la barre haute / basse). */
function pipPositionStyle(corner: PipCorner): ViewStyle {
  const isTop = corner === 'top-left' || corner === 'top-right';
  const isLeft = corner === 'top-left' || corner === 'bottom-left';
  return {
    ...(isTop ? { top: 96 } : { bottom: 150 }),
    ...(isLeft ? { left: 16 } : { right: 16 }),
  };
}

interface MultiCamPreviewProps {
  backPreview: CameraPreviewOutput | null;
  frontPreview: CameraPreviewOutput | null;
  /** Quelle caméra occupe le plein écran. */
  primarySlot: CameraSlot;
  isMultiCam: boolean;
  isStarting: boolean;
  /** Gesture composé (tap-to-focus + pinch-zoom) attaché à la caméra principale. */
  gesture: ComposedGesture | GestureType;
  focusPoint: FocusPoint | null;
  /** Coin où placer la vignette. */
  pipCorner: PipCorner;
  /** Position/taille libre de la vignette (drag/pinch). `null` = coin. */
  pipInset: PipInset | null;
  /** Disposition d'affichage (pip / côte-à-côte / haut-bas). */
  layout: CompositionLayout;
  /** Tap sur la vignette (ou la 2e moitié) => inverser les caméras. */
  onTapSecondary: () => void;
  /** Déplacement/redimensionnement de la vignette (fractions du cadre). */
  onMovePip: (inset: PipInset) => void;
  /** Afficher l'aperçu live de la 2e caméra (false = « mode surprise »). */
  showSecondaryPreview: boolean;
}

/**
 * Rendu Picture-in-Picture v5 : deux `NativePreviewView` alimentés par les
 * `CameraPreviewOutput` d'une MÊME session multi-cam (donc réellement
 * simultanés, contrairement à la v4).
 */
export function MultiCamPreview({
  backPreview,
  frontPreview,
  primarySlot,
  isMultiCam,
  isStarting,
  gesture,
  focusPoint,
  pipCorner,
  pipInset,
  layout,
  onTapSecondary,
  onMovePip,
  showSecondaryPreview,
}: MultiCamPreviewProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const mainPreview = primarySlot === 'back' ? backPreview : frontPreview;
  const pipPreview = primarySlot === 'back' ? frontPreview : backPreview;
  const showPip = isMultiCam && pipPreview != null;
  // Disposition « écran partagé » : uniquement en multi-cam avec 2e caméra dispo.
  const isSplit = layout !== 'pip' && showPip;

  // --- Vignette PiP déplaçable + redimensionnable (JS-driven, sans reanimated) ---
  const posX = useRef(new Animated.Value(0)).current;
  const posY = useRef(new Animated.Value(0)).current;
  const boxW = useRef(new Animated.Value(PIP_DEFAULT_W)).current;
  const boxH = useRef(Animated.multiply(boxW, PIP_INSET_ASPECT)).current;
  const cur = useRef({ left: 0, top: 0, width: PIP_DEFAULT_W });

  // Géométrie px depuis la position libre, sinon le coin par défaut.
  const resolveBox = (): { left: number; top: number; width: number } => {
    const width = pipInset != null ? pipInset.w * screenW : PIP_DEFAULT_W;
    const height = width * PIP_INSET_ASPECT;
    if (pipInset != null) {
      return { left: pipInset.x * screenW, top: pipInset.y * screenH, width };
    }
    const isTop = pipCorner === 'top-left' || pipCorner === 'top-right';
    const isLeft = pipCorner === 'top-left' || pipCorner === 'bottom-left';
    const left = isLeft ? PIP_SIDE_MARGIN + 4 : screenW - PIP_SIDE_MARGIN - 4 - width;
    const top = isTop ? PIP_TOP_LIMIT + 16 : screenH - PIP_BOTTOM_LIMIT - height;
    return { left, top, width };
  };

  // Synchronise la boîte quand la position/coin/écran change (hors geste).
  useEffect(() => {
    const b = resolveBox();
    cur.current = { left: b.left, top: b.top, width: b.width };
    posX.setValue(b.left);
    posY.setValue(b.top);
    boxW.setValue(b.width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipInset, pipCorner, screenW, screenH]);

  const pipGesture = useMemo(() => {
    const clampLeft = (left: number): number => clamp(left, PIP_SIDE_MARGIN, screenW - PIP_SIDE_MARGIN - cur.current.width);
    const clampTop = (top: number): number =>
      clamp(top, PIP_TOP_LIMIT, screenH - PIP_BOTTOM_LIMIT - cur.current.width * PIP_INSET_ASPECT);
    const commit = (): void => {
      onMovePip({ x: cur.current.left / screenW, y: cur.current.top / screenH, w: cur.current.width / screenW });
    };

    const start = { left: 0, top: 0, width: PIP_DEFAULT_W };
    const pan = Gesture.Pan()
      .onStart(() => {
        start.left = cur.current.left;
        start.top = cur.current.top;
      })
      .onUpdate((e) => {
        const left = clampLeft(start.left + e.translationX);
        const top = clampTop(start.top + e.translationY);
        cur.current.left = left;
        cur.current.top = top;
        posX.setValue(left);
        posY.setValue(top);
      })
      .onEnd(commit);

    const pinch = Gesture.Pinch()
      .onStart(() => {
        start.width = cur.current.width;
      })
      .onUpdate((e) => {
        const width = clamp(start.width * e.scale, PIP_INSET_MIN_W * screenW, PIP_INSET_MAX_W * screenW);
        cur.current.width = width;
        boxW.setValue(width);
        const left = clampLeft(cur.current.left);
        const top = clampTop(cur.current.top);
        cur.current.left = left;
        cur.current.top = top;
        posX.setValue(left);
        posY.setValue(top);
      })
      .onEnd(commit);

    const tap = Gesture.Tap().maxDuration(250).onEnd(() => onTapSecondary());

    return Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);
  }, [screenW, screenH, onTapSecondary, onMovePip, posX, posY, boxW]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {mainPreview == null ? (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {isStarting && <ActivityIndicator color={colors.primary} size="large" />}
          {isStarting && <Text style={styles.placeholderText}>{t('preview.starting')}</Text>}
        </View>
      ) : isSplit ? (
        <View style={[StyleSheet.absoluteFill, { flexDirection: layout === 'sideBySide' ? 'row' : 'column' }]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.splitHalf}>
              <NativePreviewView
                style={StyleSheet.absoluteFill}
                previewOutput={mainPreview}
                resizeMode="cover"
                implementationMode="compatible"
              />
            </View>
          </GestureDetector>
          {showSecondaryPreview ? (
            <Pressable
              style={styles.splitHalf}
              onPress={onTapSecondary}
              accessibilityRole="button"
              accessibilityLabel={t('capture.swapA11y')}
            >
              <NativePreviewView
                style={StyleSheet.absoluteFill}
                previewOutput={pipPreview}
                resizeMode="cover"
                implementationMode="compatible"
              />
              <View style={styles.splitSwap} pointerEvents="none">
                <Text style={styles.pipHintText}>⇆</Text>
              </View>
            </Pressable>
          ) : (
            <View
              style={[styles.splitHalf, styles.splitHidden]}
              accessible
              accessibilityLabel={t('preview.hiddenSecondaryA11y')}
            >
              <MaterialIcons name="visibility-off" size={22} color={colors.onSurfaceVariant} />
              <Text style={styles.hiddenChipText}>{t('preview.hiddenSecondary')}</Text>
            </View>
          )}
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill}>
            <NativePreviewView
              style={StyleSheet.absoluteFill}
              previewOutput={mainPreview}
              resizeMode="cover"
            />
          </View>
        </GestureDetector>
      )}

      <FocusIndicator point={focusPoint} />

      {!isSplit && showPip && showSecondaryPreview && (
        <GestureDetector gesture={pipGesture}>
          <Animated.View
            style={[styles.pip, { left: posX, top: posY, width: boxW, height: boxH }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={t('capture.swapA11y')}
          >
            <NativePreviewView
              style={StyleSheet.absoluteFill}
              previewOutput={pipPreview}
              resizeMode="cover"
              // 'compatible' => TextureView, indispensable pour que la vignette
              // soit rognée par le borderRadius (un SurfaceView ne se clippe pas).
              implementationMode="compatible"
            />
            <View style={styles.pipHint} pointerEvents="none">
              <Text style={styles.pipHintText}>⇆</Text>
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Mode surprise : la 2e caméra tourne mais son aperçu est masqué. */}
      {!isSplit && showPip && !showSecondaryPreview && (
        <View
          style={[styles.hiddenChip, pipPositionStyle(pipCorner)]}
          pointerEvents="none"
          accessible
          accessibilityLabel={t('preview.hiddenSecondaryA11y')}
        >
          <MaterialIcons name="visibility-off" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.hiddenChipText}>{t('preview.hiddenSecondary')}</Text>
        </View>
      )}
    </View>
  );
}

const PIP_DEFAULT_W = 120;

const makeStyles = (colors: Palette) => StyleSheet.create({
  placeholder: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  placeholderText: { color: colors.onSurfaceVariant, fontSize: 14 },
  pip: {
    position: 'absolute',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.surfaceContainerHighest,
    backgroundColor: colors.surfaceContainer,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  pipHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipHintText: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  splitHalf: { flex: 1, overflow: 'hidden', backgroundColor: colors.background },
  splitHidden: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  splitSwap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 34,
    height: 34,
    marginLeft: -17,
    marginTop: -17,
    borderRadius: 17,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.overlayStrong,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  hiddenChipText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
});
