import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/** Tag dédié : n'interfère pas avec d'autres consommateurs éventuels de keep-awake. */
const TAG = 'twinlens-viewfinder';

/**
 * Garde l'écran allumé tant que `active` est vrai (#214).
 *
 * Usage : viseur caméra à l'écran (`status === 'running' && isForeground`),
 * comme toutes les applis caméra (cadrer sur trépied, poser pour un selfie
 * retardateur... sans que l'écran se verrouille en pleine prise).
 *
 * Côté Android c'est le window flag `FLAG_KEEP_SCREEN_ON` : aucune permission,
 * aucun wakelock ; le flag n'a d'effet que fenêtre visible, donc aucune
 * consommation en arrière-plan. On le retire quand même explicitement dès que
 * `active` retombe (erreur caméra, arrière-plan) pour garder l'intention nette.
 */
export function useKeepAwakeWhen(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(TAG);
    return () => {
      void deactivateKeepAwake(TAG);
    };
  }, [active]);
}
