import { useCallback, useState } from 'react';
import { useCameraDevice, type CameraDevice } from 'react-native-vision-camera';

export interface MultiCameraDevicesState {
  backDevice: CameraDevice | undefined;
  frontDevice: CameraDevice | undefined;
  /** Les deux capteurs physiques existent sur l'appareil. */
  hasBothCameras: boolean;
  /**
   * Le multi-cam simultané est (a priori) possible ET n'a pas encore échoué.
   * Optimiste tant que la 2e session ne remonte pas d'erreur.
   */
  isMultiCamSupported: boolean;
  /** La 2e session caméra a échoué -> bascule définitive en mono-caméra. */
  concurrentSessionFailed: boolean;
  /** À appeler depuis `onError` de la caméra secondaire. */
  reportConcurrentFailure: () => void;
  /** Réinitialise l'état d'échec (ex. après un changement d'appareil). */
  resetSupport: () => void;
}

/**
 * Détection du support multi-caméra.
 *
 * ⚠️ Réalité technique (VisionCamera v4) : il n'existe pas d'API JS publique
 * fiable et cross-platform pour *énumérer* les combinaisons de caméras
 * concurrentes (c'est exposé nativement via AVCaptureMultiCamSession sur iOS et
 * `CameraManager.getConcurrentCameraIds()` sur Android, mais pas remonté tel
 * quel côté JS en v4).
 *
 * Stratégie de production robuste retenue :
 *   1. On vérifie que les deux capteurs existent (`hasBothCameras`).
 *   2. On tente d'ouvrir les deux sessions simultanément (optimiste).
 *   3. Si la 2e session émet `onError` (souvent code
 *      `session/multi-cam-not-supported` ou une erreur de configuration), on
 *      appelle `reportConcurrentFailure()` -> `isMultiCamSupported` passe à
 *      false -> l'UI démonte la vignette et bascule proprement en mono-caméra.
 *
 * NB : la future API v5 (Nitro) exposera
 * `deviceFactory.supportedMultiCamDeviceCombinations` pour une détection
 * déterministe. À migrer le jour où v5 sera stable.
 */
export function useMultiCameraDevices(): MultiCameraDevicesState {
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');

  const [concurrentSessionFailed, setConcurrentSessionFailed] = useState(false);

  const hasBothCameras = backDevice != null && frontDevice != null;

  const reportConcurrentFailure = useCallback(() => {
    setConcurrentSessionFailed(true);
  }, []);

  const resetSupport = useCallback(() => {
    setConcurrentSessionFailed(false);
  }, []);

  const isMultiCamSupported = hasBothCameras && !concurrentSessionFailed;

  return {
    backDevice,
    frontDevice,
    hasBothCameras,
    isMultiCamSupported,
    concurrentSessionFailed,
    reportConcurrentFailure,
    resetSupport,
  };
}
