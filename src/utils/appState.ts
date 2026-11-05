import { AppState, type AppStateStatus } from 'react-native';

/**
 * Résout dès que l'application est au premier plan (`active`).
 *
 * Android 12+ interdit de démarrer un Foreground Service depuis l'arrière-plan
 * (`ForegroundServiceStartNotAllowedException`). Si l'utilisateur quitte l'app
 * pendant un enregistrement, CameraX finalise quand même les fichiers
 * (`ERROR_SOURCE_INACTIVE` est traité comme un arrêt normal par VisionCamera) :
 * la composition doit alors attendre le retour au premier plan.
 */
export function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
  });
}
