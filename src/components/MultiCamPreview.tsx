import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  type ComposedGesture,
  type GestureType,
} from 'react-native-gesture-handler';
import { NativePreviewView, type CameraPreviewOutput } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { FocusIndicator, type FocusPoint } from './FocusIndicator';
import type { CompositionLayout, PipCorner } from '../services/pipComposer';
import type { CameraSlot } from '../vision/MultiCamController';

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
  /** Disposition d'affichage (pip / côte-à-côte / haut-bas). */
  layout: CompositionLayout;
  /** Tap sur la vignette (ou la 2e moitié) => inverser les caméras. */
  onTapSecondary: () => void;
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
  layout,
  onTapSecondary,
  showSecondaryPreview,
}: MultiCamPreviewProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const mainPreview = primarySlot === 'back' ? backPreview : frontPreview;
  const pipPreview = primarySlot === 'back' ? frontPreview : backPreview;
  const showPip = isMultiCam && pipPreview != null;
  // Disposition « écran partagé » : uniquement en multi-cam avec 2e caméra dispo.
  const isSplit = layout !== 'pip' && showPip;

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
        <Pressable
          style={[styles.pip, pipPositionStyle(pipCorner)]}
          onPress={onTapSecondary}
          hitSlop={8}
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
        </Pressable>
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

const PIP_WIDTH = 120;
const PIP_HEIGHT = 172;

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
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
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
