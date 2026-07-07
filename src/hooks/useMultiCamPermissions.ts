import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

export interface MultiCamPermissionsState {
  hasCameraPermission: boolean;
  hasMicrophonePermission: boolean;
  hasMediaLibraryPermission: boolean;
  allGranted: boolean;
  isRequesting: boolean;
  canAskAgain: boolean;
  requestAll: () => Promise<void>;
}

/**
 * Permissions v5 : Caméra + Micro via les hooks natifs de VisionCamera
 * (le config plugin Expo n'existe plus en v5), + Galerie via expo-media-library.
 * Demande séquentielle unique au montage.
 */
export function useMultiCamPermissions(): MultiCamPermissionsState {
  const { hasPermission: hasCameraPermission, requestPermission: requestCamera } =
    useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMic } =
    useMicrophonePermission();
  // Permission galerie COMPLÈTE (lecture+écriture) : sur Android, `writeOnly`
  // ne suffit pas toujours pour `saveToLibraryAsync` selon la version d'OS.
  const [media, requestMedia] = MediaLibrary.usePermissions();

  const [isRequesting, setIsRequesting] = useState(false);
  const didAutoRequest = useRef(false);

  const hasMediaLibraryPermission = media?.granted ?? false;
  const canAskAgain = media?.canAskAgain ?? true;

  const requestAll = useCallback(async (): Promise<void> => {
    setIsRequesting(true);
    try {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicrophonePermission) await requestMic();
      if (!hasMediaLibraryPermission) await requestMedia();
    } finally {
      setIsRequesting(false);
    }
  }, [
    hasCameraPermission,
    hasMicrophonePermission,
    hasMediaLibraryPermission,
    requestCamera,
    requestMic,
    requestMedia,
  ]);

  useEffect(() => {
    if (didAutoRequest.current) return;
    didAutoRequest.current = true;
    void requestAll();
  }, [requestAll]);

  return {
    hasCameraPermission,
    hasMicrophonePermission,
    hasMediaLibraryPermission,
    allGranted: hasCameraPermission && hasMicrophonePermission && hasMediaLibraryPermission,
    isRequesting,
    canAskAgain,
    requestAll,
  };
}
