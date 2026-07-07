import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type CameraDevice,
  type CameraRuntimeError,
} from 'react-native-vision-camera';

import { colors } from '../theme/colors';

interface MultiCameraViewProps {
  primaryDevice: CameraDevice;
  secondaryDevice: CameraDevice | undefined;
  primaryRef: React.RefObject<Camera | null>;
  secondaryRef: React.RefObject<Camera | null>;
  isActive: boolean;
  /** true => on monte la 2e caméra dans la vignette PiP. */
  isMultiCam: boolean;
  /** Appelé si la caméra secondaire échoue (session concurrente refusée). */
  onSecondaryError: () => void;
  /** Tap sur la vignette => inverser principale / secondaire. */
  onTapSecondary: () => void;
}

/**
 * Rendu Picture-in-Picture :
 *  - caméra principale en plein écran,
 *  - caméra secondaire dans une vignette flottante (tap pour inverser).
 *
 * Détails importants :
 *  - `audio` n'est activé QUE sur la caméra principale : deux entrées audio
 *    simultanées provoquent des conflits sur la plupart des appareils.
 *  - `onError` de la secondaire remonte l'échec pour basculer en mono-caméra.
 */
export function MultiCameraView({
  primaryDevice,
  secondaryDevice,
  primaryRef,
  secondaryRef,
  isActive,
  isMultiCam,
  onSecondaryError,
  onTapSecondary,
}: MultiCameraViewProps): React.ReactElement {
  const showPip = isMultiCam && secondaryDevice != null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Caméra principale — plein écran */}
      <Camera
        ref={primaryRef}
        style={StyleSheet.absoluteFill}
        device={primaryDevice}
        isActive={isActive}
        photo
        video
        audio={isActive}
        onError={(error: CameraRuntimeError) => {
          console.error('[MultiCam] caméra principale:', error.code, error.message);
        }}
      />

      {/* Caméra secondaire — vignette PiP */}
      {showPip && (
        <Pressable
          style={styles.pip}
          onPress={onTapSecondary}
          accessibilityRole="button"
          accessibilityLabel="Inverser les caméras"
        >
          <Camera
            ref={secondaryRef}
            style={StyleSheet.absoluteFill}
            device={secondaryDevice}
            isActive={isActive}
            photo
            video
            audio={false}
            onError={(error: CameraRuntimeError) => {
              console.warn('[MultiCam] caméra secondaire:', error.code, error.message);
              onSecondaryError();
            }}
          />
          <View style={styles.pipHint} pointerEvents="none">
            <Text style={styles.pipHintText}>⇆</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const PIP_WIDTH = 118;
const PIP_HEIGHT = 168;

const styles = StyleSheet.create({
  pip: {
    position: 'absolute',
    top: 64,
    right: 18,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // ombre iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    // ombre Android
    elevation: 8,
  },
  pipHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipHintText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
