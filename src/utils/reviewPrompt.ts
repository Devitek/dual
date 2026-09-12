/**
 * Conditions de déclenchement de la demande d'avis Play (issue #179).
 *
 * Logique PURE (testée dans reviewPrompt.test.ts) ; l'appel réel à l'API
 * In-App Review vit dans hooks/useReviewPrompt. Philosophie : ne solliciter
 * qu'à un moment de satisfaction (fermeture de la galerie, l'utilisateur vient
 * de voir ses photos), une seule fois, et jamais un utilisateur trop récent ou
 * une session qui vient d'échouer. Google interdit pré-questions, incitations
 * et récompenses : notre seule marge est le choix du moment.
 */

export const REVIEW_MIN_CAPTURES = 10;
export const REVIEW_MIN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewState {
  /** Nombre total de captures réussies (toutes sessions). */
  captureCount: number;
  /** Timestamp du premier lancement (null si inconnu : jamais solliciter). */
  firstLaunchAt: number | null;
  /** L'API a déjà été appelée une fois : ne plus jamais solliciter. */
  alreadyRequested: boolean;
  /** Une erreur de capture a eu lieu dans la session courante. */
  sessionHadError: boolean;
  now: number;
}

export function shouldRequestReview(s: ReviewState): boolean {
  if (s.alreadyRequested) return false;
  if (s.sessionHadError) return false;
  if (s.captureCount < REVIEW_MIN_CAPTURES) return false;
  if (s.firstLaunchAt == null) return false;
  if (s.now - s.firstLaunchAt < REVIEW_MIN_DAYS * DAY_MS) return false;
  return true;
}
