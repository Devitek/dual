import { useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { shouldRequestReview } from '../utils/reviewPrompt';
import type { CapturedMedia, Notice } from '../vision/MultiCamController';

// Compteurs internes one-shot, PAS des réglages utilisateur : comme les hints
// (tl_seen_pip_hint), ils vivent hors de services/settings (exception §8).
const COUNT_KEY = 'tl_review_capture_count';
const FIRST_LAUNCH_KEY = 'tl_first_launch_at';
const REQUESTED_KEY = 'tl_review_requested';

/**
 * Demande d'avis Play In-App Review au bon moment (issue #179) : appelée à la
 * FERMETURE de la galerie de session (moment de satisfaction), si les
 * conditions de utils/reviewPrompt sont réunies. Une seule sollicitation à
 * vie ; Play applique ensuite ses propres quotas et peut ne rien afficher.
 */
export function useReviewPrompt(
  lastCapture: CapturedMedia | null,
  notice: Notice | null,
): { onGalleryClosed: () => void } {
  const loaded = useRef(false);
  const captureCount = useRef(0);
  const firstLaunchAt = useRef<number | null>(null);
  const requested = useRef(false);
  const sessionHadError = useRef(false);
  const lastCounted = useRef<CapturedMedia | null>(null);

  // Chargement one-shot + pose de la date de premier lancement si absente.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.multiGet([COUNT_KEY, FIRST_LAUNCH_KEY, REQUESTED_KEY])
      .then((entries) => {
        if (cancelled) return;
        const map = Object.fromEntries(entries);
        captureCount.current = Number.parseInt(map[COUNT_KEY] ?? '0', 10) || 0;
        requested.current = map[REQUESTED_KEY] === '1';
        const first = Number.parseInt(map[FIRST_LAUNCH_KEY] ?? '', 10);
        if (Number.isFinite(first)) {
          firstLaunchAt.current = first;
        } else {
          firstLaunchAt.current = Date.now();
          void AsyncStorage.setItem(FIRST_LAUNCH_KEY, String(firstLaunchAt.current)).catch(() => {});
        }
        loaded.current = true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Compte chaque capture réussie (le snapshot ne change de référence qu'à la
  // nouvelle capture). Écriture best-effort, uniquement des refs : pas d'état.
  useEffect(() => {
    if (lastCapture == null || lastCapture === lastCounted.current) return;
    lastCounted.current = lastCapture;
    captureCount.current += 1;
    void AsyncStorage.setItem(COUNT_KEY, String(captureCount.current)).catch(() => {});
  }, [lastCapture]);

  // Une erreur de capture/sauvegarde dans la session => pas de sollicitation.
  useEffect(() => {
    if (notice?.kind === 'error') sessionHadError.current = true;
  }, [notice]);

  const onGalleryClosed = useCallback(() => {
    if (!loaded.current) return;
    const eligible = shouldRequestReview({
      captureCount: captureCount.current,
      firstLaunchAt: firstLaunchAt.current,
      alreadyRequested: requested.current,
      sessionHadError: sessionHadError.current,
      now: Date.now(),
    });
    if (!eligible) return;
    // Marqué AVANT l'appel : même si Play n'affiche rien (quotas), on ne
    // re-sollicite jamais.
    requested.current = true;
    void AsyncStorage.setItem(REQUESTED_KEY, '1').catch(() => {});
    void StoreReview.hasAction()
      .then((available) => (available ? StoreReview.requestReview() : undefined))
      .catch(() => {});
  }, []);

  return { onGalleryClosed };
}
