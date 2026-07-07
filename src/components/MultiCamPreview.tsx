import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  type ComposedGesture,
  type GestureType,
} from 'react-native-gesture-handler';
import { NativePreviewView, type CameraPreviewOutput } from 'react-native-vision-camera';

import { colors } from '../theme/colors';
import { FocusIndicator, type FocusPoint } from './FocusIndicator';
import type { PipCorner } from '../services/pipComposer';
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
  /** Tap sur la vignette => inverser les caméras. */
  onTapSecondary: () => void;
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
  onTapSecondary,
}: MultiCamPreviewProps): React.ReactElement {
  const mainPreview = primarySlot === 'back' ? backPreview : frontPreview;
  const pipPreview = primarySlot === 'back' ? frontPreview : backPreview;
  const showPip = isMultiCam && pipPreview != null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {mainPreview != null ? (
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill}>
            <NativePreviewView
              style={StyleSheet.absoluteFill}
              previewOutput={mainPreview}
              resizeMode="cover"
            />
          </View>
        </GestureDetector>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {isStarting && <ActivityIndicator color={colors.primary} size="large" />}
          {isStarting && <Text style={styles.placeholderText}>Démarrage des caméras…</Text>}
        </View>
      )}

      <FocusIndicator point={focusPoint} />

      {showPip && (
        <Pressable
          style={[styles.pip, pipPositionStyle(pipCorner)]}
          onPress={onTapSecondary}
          accessibilityRole="button"
          accessibilityLabel="Inverser les caméras"
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
    </View>
  );
}

const PIP_WIDTH = 120;
const PIP_HEIGHT = 172;

const styles = StyleSheet.create({
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
});
