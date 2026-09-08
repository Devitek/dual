import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

import type { MultiCamController } from '../vision/MultiCamController';
import type { PhotoFlashMode } from '../components/CameraTopBar';
import type { BurstCount, TimerSeconds } from '../services/settings';
import { haptics } from '../utils/haptics';

/** Boomerang (appui long) : durée mini du clip source (ms). */
export const BOOMERANG_MIN_MS = 700;
export const BOOMERANG_MAX_MS = 3000;

interface CaptureFlowParams {
  controller: MultiCamController;
  photoFlash: PhotoFlashMode;
  burstCount: BurstCount;
  timerSeconds: TimerSeconds;
  isRecording: boolean;
}

export interface CaptureFlow {
  /** Opacité du flash blanc d'obturateur (à monter dans le rendu). */
  flashOpacity: Animated.Value;
  /** Décompte du retardateur en cours (null = aucun). */
  countdown: number | null;
  /** Obturateur photo : capture immédiate, décompte, ou annulation du décompte. */
  onPhoto: () => void;
  /** Annule un décompte en cours (appelé par les handlers qui ouvrent un panneau
   *  ou changent de mode : le décompte n'a de sens qu'en mode photo, plein écran). */
  cancelCountdown: () => void;
  onToggleRecording: () => void;
  onBoomerangStart: () => void;
  onBoomerangStop: () => void;
}

/**
 * Flux de capture : flash d'obturateur, rafale, retardateur (décompte) et
 * enregistrement vidéo/boomerang. Extrait de MultiCameraScreen (#148).
 *
 * Le décompte vit ici SANS effet « pilote » : tout (tick haptique, capture à 0,
 * arrêt de l'interval) se passe dans le callback de l'interval, un contexte
 * événementiel. Pas de setState synchrone dans un effet (#136), pas d'effet de
 * bord dans un updater (safe en StrictMode).
 */
export function useCaptureFlow({
  controller,
  photoFlash,
  burstCount,
  timerSeconds,
  isRecording,
}: CaptureFlowParams): CaptureFlow {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownValue = useRef<number | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstingRef = useRef(false);

  // Capture réelle : flash blanc instantané puis capture async (l'overlay
  // « Ne bougez pas » est piloté séparément par l'état isBusy du contrôleur).
  // En rafale (burstCount > 1), N captures séquentielles : chaque capturePhoto
  // libère l'obturateur juste après la capture brute (la composition part en
  // tâche de fond), la suivante peut donc s'enchaîner naturellement.
  const doCapture = useCallback(() => {
    const flash = (dur: number) => {
      haptics.medium();
      flashOpacity.setValue(0.9);
      Animated.timing(flashOpacity, { toValue: 0, duration: dur, useNativeDriver: true }).start();
    };
    if (burstCount <= 1) {
      flash(200);
      void controller.capturePhoto(photoFlash);
      return;
    }
    if (burstingRef.current) return; // évite deux rafales qui se chevauchent
    burstingRef.current = true;
    void (async () => {
      try {
        for (let i = 0; i < burstCount; i++) {
          flash(150);
          await controller.capturePhoto(photoFlash);
          if (i < burstCount - 1) await new Promise((r) => setTimeout(r, 140));
        }
      } finally {
        burstingRef.current = false;
      }
    })();
  }, [controller, photoFlash, flashOpacity, burstCount]);

  // L'interval capture `doCapture` à sa création ; la ref suit la dernière
  // version (photoFlash/burstCount peuvent changer pendant le décompte).
  const doCaptureRef = useRef(doCapture);
  useEffect(() => {
    doCaptureRef.current = doCapture;
  }, [doCapture]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current != null) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    countdownValue.current = null;
    setCountdown(null);
  }, []);

  // Obturateur photo : capture immédiate, ou décompte du retardateur. Un second
  // appui pendant le décompte l'annule.
  const onPhoto = useCallback(() => {
    if (countdownTimer.current != null) {
      cancelCountdown();
      return;
    }
    if (timerSeconds <= 0) {
      doCapture();
      return;
    }
    countdownValue.current = timerSeconds;
    setCountdown(timerSeconds);
    countdownTimer.current = setInterval(() => {
      const next = (countdownValue.current ?? 1) - 1;
      countdownValue.current = next;
      if (next <= 0) {
        if (countdownTimer.current != null) {
          clearInterval(countdownTimer.current);
          countdownTimer.current = null;
        }
        countdownValue.current = null;
        setCountdown(null);
        doCaptureRef.current();
      } else {
        setCountdown(next);
        haptics.selection();
      }
    }, 1000);
  }, [timerSeconds, doCapture, cancelCountdown]);

  const onToggleRecording = useCallback(() => {
    if (isRecording) {
      haptics.medium();
      void controller.stopRecording();
    } else {
      haptics.heavy();
      void controller.startRecording();
    }
  }, [controller, isRecording]);

  // Boomerang = appui long : démarre à l'appui, arrête au relâchement (le natif
  // boucle avant/arrière). On garantit une durée mini pour un clip exploitable.
  const boomStartRef = useRef(0);
  const boomMinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBoomerangStart = useCallback(() => {
    haptics.heavy();
    boomStartRef.current = Date.now();
    void controller.startRecording();
  }, [controller]);
  const onBoomerangStop = useCallback(() => {
    if (boomMinTimer.current != null) {
      clearTimeout(boomMinTimer.current);
      boomMinTimer.current = null;
    }
    const doStop = () => {
      haptics.medium();
      void controller.stopRecording();
    };
    const elapsed = Date.now() - boomStartRef.current;
    if (elapsed >= BOOMERANG_MIN_MS) doStop();
    else boomMinTimer.current = setTimeout(doStop, BOOMERANG_MIN_MS - elapsed);
  }, [controller]);

  // Nettoyage des timers au démontage.
  useEffect(
    () => () => {
      if (boomMinTimer.current != null) clearTimeout(boomMinTimer.current);
      if (countdownTimer.current != null) clearInterval(countdownTimer.current);
    },
    [],
  );

  return {
    flashOpacity,
    countdown,
    onPhoto,
    cancelCountdown,
    onToggleRecording,
    onBoomerangStart,
    onBoomerangStop,
  };
}
