import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  Camera,
  type PhotoFile,
  type VideoFile,
  type CameraCaptureError,
} from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

import { getFileSize, toFileUri } from '../utils/fileSystem';

export type MediaKind = 'photo' | 'video';

export interface CapturedMedia {
  kind: MediaKind;
  /** URI (file://) du média de la caméra PRINCIPALE, déjà sauvegardé. */
  primaryUri: string;
  /** URI du média de la caméra SECONDAIRE, ou null en mono-caméra. */
  secondaryUri: string | null;
  createdAt: number;
}

export interface MultiCameraCaptureState {
  /** À brancher sur le `<Camera>` principal (plein écran). */
  primaryCameraRef: React.RefObject<Camera | null>;
  /** À brancher sur le `<Camera>` secondaire (vignette PiP) — seulement en multi-cam. */
  secondaryCameraRef: React.RefObject<Camera | null>;
  isRecording: boolean;
  /** true pendant une prise de photo ou la finalisation d'un enregistrement. */
  isBusy: boolean;
  lastCapture: CapturedMedia | null;
  takePhoto: () => Promise<void>;
  toggleRecording: () => Promise<void>;
}

/**
 * Enregistre un fichier natif dans la pellicule et renvoie son URI.
 * (diagnostic taille via expo-file-system, non bloquant)
 */
async function persistToLibrary(path: string): Promise<string> {
  const uri = toFileUri(path);
  if (__DEV__) {
    console.log('[capture] saveToLibrary', uri, getFileSize(uri));
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return uri;
}

/**
 * Logique de capture pour DEUX caméras.
 *
 * - Photo : déclenche `takePhoto()` sur les deux caméras "en parallèle", puis
 *   sauvegarde les deux fichiers dans la pellicule.
 * - Vidéo : démarre `startRecording()` sur les deux caméras. Les callbacks
 *   `onRecordingFinished` (déclenchés par `stopRecording()`) sauvegardent chaque
 *   fichier ; on agrège les résultats pour publier un unique `lastCapture`.
 *
 * ➜ On obtient DEUX fichiers distincts (avant + arrière). La composition PiP en
 *   un seul fichier est faite en post-traitement (voir README / réponse).
 *
 * En mono-caméra, `secondaryCameraRef.current` est `null` (la vignette n'est pas
 * montée) : tout le code secondaire est simplement ignoré.
 */
export function useMultiCameraCapture(): MultiCameraCaptureState {
  const primaryCameraRef = useRef<Camera | null>(null);
  const secondaryCameraRef = useRef<Camera | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [lastCapture, setLastCapture] = useState<CapturedMedia | null>(null);

  // Agrégateur pour l'enregistrement vidéo (les callbacks arrivent de façon async).
  const recordingAccumulator = useRef<{
    expected: number;
    primaryUri: string | null;
    secondaryUri: string | null;
    settled: number;
  }>({ expected: 0, primaryUri: null, secondaryUri: null, settled: 0 });

  // ---------------------------------------------------------------- PHOTO ----
  const takePhoto = useCallback(async (): Promise<void> => {
    const primary = primaryCameraRef.current;
    if (primary == null || isBusy || isRecording) return;

    setIsBusy(true);
    try {
      const secondary = secondaryCameraRef.current;

      const primaryPromise = primary.takePhoto({ flash: 'off' });
      const secondaryPromise: Promise<PhotoFile | null> =
        secondary != null
          ? secondary.takePhoto({ flash: 'off' })
          : Promise.resolve(null);

      const [primaryPhoto, secondaryPhoto] = await Promise.all([
        primaryPromise,
        secondaryPromise,
      ]);

      const primaryUri = await persistToLibrary(primaryPhoto.path);
      const secondaryUri =
        secondaryPhoto != null ? await persistToLibrary(secondaryPhoto.path) : null;

      setLastCapture({
        kind: 'photo',
        primaryUri,
        secondaryUri,
        createdAt: Date.now(),
      });
    } catch (error) {
      Alert.alert(
        'Capture photo échouée',
        (error as CameraCaptureError)?.message ?? String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, isRecording]);

  // ---------------------------------------------------------------- VIDEO ----
  const commitRecordingIfComplete = useCallback((): void => {
    const acc = recordingAccumulator.current;
    if (acc.settled < acc.expected) return;

    if (acc.primaryUri != null) {
      setLastCapture({
        kind: 'video',
        primaryUri: acc.primaryUri,
        secondaryUri: acc.secondaryUri,
        createdAt: Date.now(),
      });
    }
    setIsBusy(false);
  }, []);

  const startRecording = useCallback((): void => {
    const primary = primaryCameraRef.current;
    if (primary == null) return;
    const secondary = secondaryCameraRef.current;

    recordingAccumulator.current = {
      expected: secondary != null ? 2 : 1,
      primaryUri: null,
      secondaryUri: null,
      settled: 0,
    };

    setIsRecording(true);

    const onError = (which: 'principale' | 'secondaire') => (error: CameraCaptureError) => {
      recordingAccumulator.current.settled += 1;
      console.warn(`[capture] erreur enregistrement caméra ${which}:`, error.code, error.message);
      setIsRecording(false);
      Alert.alert('Enregistrement interrompu', `Caméra ${which} : ${error.message}`);
      commitRecordingIfComplete();
    };

    primary.startRecording({
      // videoCodec: 'h265', // décommenter pour un meilleur ratio qualité/poids
      onRecordingFinished: async (video: VideoFile) => {
        try {
          recordingAccumulator.current.primaryUri = await persistToLibrary(video.path);
        } finally {
          recordingAccumulator.current.settled += 1;
          commitRecordingIfComplete();
        }
      },
      onRecordingError: onError('principale'),
    });

    if (secondary != null) {
      secondary.startRecording({
        onRecordingFinished: async (video: VideoFile) => {
          try {
            recordingAccumulator.current.secondaryUri = await persistToLibrary(video.path);
          } finally {
            recordingAccumulator.current.settled += 1;
            commitRecordingIfComplete();
          }
        },
        onRecordingError: onError('secondaire'),
      });
    }
  }, [commitRecordingIfComplete]);

  const stopRecording = useCallback(async (): Promise<void> => {
    setIsBusy(true); // on attend la finalisation des fichiers
    setIsRecording(false);
    await Promise.all([
      primaryCameraRef.current?.stopRecording(),
      secondaryCameraRef.current?.stopRecording(),
    ]);
    // isBusy sera remis à false par commitRecordingIfComplete()
  }, []);

  const toggleRecording = useCallback(async (): Promise<void> => {
    if (isBusy && !isRecording) return; // occupé par une photo
    if (isRecording) {
      await stopRecording();
    } else {
      startRecording();
    }
  }, [isBusy, isRecording, startRecording, stopRecording]);

  return {
    primaryCameraRef,
    secondaryCameraRef,
    isRecording,
    isBusy,
    lastCapture,
    takePhoto,
    toggleRecording,
  };
}
