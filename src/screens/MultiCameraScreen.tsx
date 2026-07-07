import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CameraDevice } from 'react-native-vision-camera';

import { colors } from '../theme/colors';
import { useIsForeground } from '../hooks/useIsForeground';
import { useMultiCameraPermissions } from '../hooks/useMultiCameraPermissions';
import { useMultiCameraDevices } from '../hooks/useMultiCameraDevices';
import { useMultiCameraCapture } from '../hooks/useMultiCameraCapture';
import { PermissionGate } from '../components/PermissionGate';
import { MultiCameraView } from '../components/MultiCameraView';
import { CaptureControls } from '../components/CaptureControls';
import { UnsupportedBanner } from '../components/UnsupportedBanner';

type Position = 'back' | 'front';

/**
 * Écran principal Multi-Caméra.
 *
 * Compose : permissions -> détection matériel -> rendu PiP -> contrôles.
 * Gère l'état "quelle caméra est principale" (inversion) et le cycle de vie
 * (caméra désactivée quand l'app n'est pas au premier plan).
 */
export function MultiCameraScreen(): React.ReactElement {
  const permissions = useMultiCameraPermissions();
  const devices = useMultiCameraDevices();
  const capture = useMultiCameraCapture();
  const isForeground = useIsForeground();

  // Quelle caméra occupe le plein écran ? (l'autre va dans la vignette)
  const [primaryPosition, setPrimaryPosition] = useState<Position>('back');

  const swap = useCallback(() => {
    setPrimaryPosition((p) => (p === 'back' ? 'front' : 'back'));
  }, []);

  // La caméra n'est active QUE si l'app est au premier plan ET les permissions OK.
  const isActive = isForeground && permissions.allGranted;

  const primaryDevice: CameraDevice | undefined =
    primaryPosition === 'back' ? devices.backDevice : devices.frontDevice;
  const secondaryDevice: CameraDevice | undefined =
    primaryPosition === 'back' ? devices.frontDevice : devices.backDevice;

  return (
    <PermissionGate permissions={permissions}>
      <View style={styles.root}>
        {primaryDevice == null ? (
          <View style={styles.center}>
            <Text style={styles.noCamText}>Aucune caméra disponible sur cet appareil.</Text>
          </View>
        ) : (
          <>
            <MultiCameraView
              primaryDevice={primaryDevice}
              secondaryDevice={secondaryDevice}
              primaryRef={capture.primaryCameraRef}
              // On ne branche la ref secondaire QUE si le multi-cam est actif :
              // en mono-caméra, capture.secondaryCameraRef.current reste null.
              secondaryRef={capture.secondaryCameraRef}
              isActive={isActive}
              isMultiCam={devices.isMultiCamSupported}
              onSecondaryError={devices.reportConcurrentFailure}
              onTapSecondary={swap}
            />

            {!devices.isMultiCamSupported && (
              <UnsupportedBanner missingSensor={!devices.hasBothCameras} />
            )}

            <CaptureControls
              isRecording={capture.isRecording}
              isBusy={capture.isBusy}
              canSwap={devices.hasBothCameras}
              onSwap={swap}
              onPhoto={capture.takePhoto}
              onToggleRecording={capture.toggleRecording}
              lastCapture={capture.lastCapture}
            />
          </>
        )}
      </View>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  noCamText: { color: colors.text, fontSize: 16, textAlign: 'center' },
});
