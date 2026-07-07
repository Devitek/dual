import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

export interface MultiCameraPermissionsState {
  /** Caméra accordée (obligatoire). */
  hasCameraPermission: boolean;
  /** Micro accordé (obligatoire pour l'audio des vidéos). */
  hasMicrophonePermission: boolean;
  /** Écriture galerie accordée (pour sauvegarder les captures). */
  hasMediaLibraryPermission: boolean;
  /** Les 3 permissions sont accordées. */
  allGranted: boolean;
  /** Une demande est en cours (pour afficher un loader). */
  isRequesting: boolean;
  /** false => l'utilisateur a refusé définitivement, il faut ouvrir les Réglages. */
  canAskAgain: boolean;
  /** Déclenche la demande séquentielle des 3 permissions. */
  requestAll: () => Promise<void>;
}

/**
 * Centralise les 3 permissions nécessaires au multi-caméra :
 * Caméra + Microphone (react-native-vision-camera) et Galerie (expo-media-library).
 *
 * La demande est lancée automatiquement une seule fois au montage, de façon
 * séquentielle pour une UX fluide (une pop-système à la fois).
 */
export function useMultiCameraPermissions(): MultiCameraPermissionsState {
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();

  const {
    hasPermission: hasMicrophonePermission,
    requestPermission: requestMicrophonePermission,
  } = useMicrophonePermission();

  // writeOnly: on ne fait qu'ÉCRIRE dans la galerie -> permission minimale,
  // meilleure UX et conformité au principe de moindre privilège.
  const [mediaResponse, requestMediaPermission] = MediaLibrary.usePermissions({
    writeOnly: true,
  });

  const [isRequesting, setIsRequesting] = useState(false);
  const hasAutoRequested = useRef(false);

  const hasMediaLibraryPermission = mediaResponse?.granted ?? false;
  const canAskAgain = mediaResponse?.canAskAgain ?? true;

  const requestAll = useCallback(async (): Promise<void> => {
    setIsRequesting(true);
    try {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicrophonePermission) await requestMicrophonePermission();
      if (!hasMediaLibraryPermission) await requestMediaPermission();
    } finally {
      setIsRequesting(false);
    }
  }, [
    hasCameraPermission,
    hasMicrophonePermission,
    hasMediaLibraryPermission,
    requestCameraPermission,
    requestMicrophonePermission,
    requestMediaPermission,
  ]);

  // Demande automatique unique au premier montage.
  useEffect(() => {
    if (hasAutoRequested.current) return;
    hasAutoRequested.current = true;
    void requestAll();
  }, [requestAll]);

  const allGranted =
    hasCameraPermission && hasMicrophonePermission && hasMediaLibraryPermission;

  return {
    hasCameraPermission,
    hasMicrophonePermission,
    hasMediaLibraryPermission,
    allGranted,
    isRequesting,
    canAskAgain,
    requestAll,
  };
}
