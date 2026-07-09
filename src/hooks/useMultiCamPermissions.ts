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
  // Permission galerie en ÉCRITURE SEULE (`writeOnly`). L'app n'a jamais besoin
  // de LIRE la pellicule de l'utilisateur : elle ne fait qu'ENREGISTRER ses
  // propres captures (sauvegarde native scoped via MediaStore + repli
  // `saveToLibraryAsync`) et supprimer ses propres médias de session.
  // → aucune permission READ_MEDIA_IMAGES/VIDEO n'est déclarée ni demandée,
  //   ce qui évite la déclaration Play « accès photos/vidéos ».
  const [media, requestMedia] = MediaLibrary.usePermissions({ writeOnly: true });

  const [isRequesting, setIsRequesting] = useState(false);
  const didAutoRequest = useRef(false);

  const hasMediaLibraryPermission = media?.granted ?? false;
  const canAskAgain = media?.canAskAgain ?? true;

  const requestAll = useCallback(async (): Promise<void> => {
    setIsRequesting(true);
    // Demandes SÉQUENTIELLES et isolées : Android n'affiche qu'un dialogue à la
    // fois, et un refus/échec sur l'une ne doit pas empêcher les suivantes.
    try {
      if (!hasCameraPermission) {
        try {
          await requestCamera();
        } catch {
          /* refusé */
        }
      }
      if (!hasMicrophonePermission) {
        try {
          await requestMic();
        } catch {
          /* refusé */
        }
      }
      if (!hasMediaLibraryPermission) {
        try {
          await requestMedia();
        } catch {
          /* refusé */
        }
      }
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
    // Galerie = BEST-EFFORT, volontairement HORS du gate bloquant : la
    // sauvegarde passe par le MediaStore scoped (aucune permission runtime
    // requise sur Android 13+) et, en écriture seule, il n'y a rien à accorder
    // sur 13+ — bloquer l'app dessus créerait un blocage impossible à lever.
    // Seuls caméra + micro sont réellement indispensables au fonctionnement.
    allGranted: hasCameraPermission && hasMicrophonePermission,
    isRequesting,
    canAskAgain,
    requestAll,
  };
}
