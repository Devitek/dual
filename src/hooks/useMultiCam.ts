import { useEffect, useRef, useSyncExternalStore } from 'react';

import { MultiCamController, type MultiCamSnapshot } from '../vision/MultiCamController';

export interface UseMultiCamResult extends MultiCamSnapshot {
  controller: MultiCamController;
}

/**
 * Pont React <-> {@link MultiCamController}.
 *
 * - Crée un contrôleur stable pour la durée de vie de l'écran.
 * - Initialise la session dès que `enabled` (permissions OK) passe à true.
 * - Démarre/arrête la session selon `isActive` (premier plan).
 * - Libère tout au démontage.
 */
export function useMultiCam(isActive: boolean, enabled: boolean): UseMultiCamResult {
  const ref = useRef<MultiCamController | null>(null);
  if (ref.current === null) ref.current = new MultiCamController();
  const controller = ref.current;

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    if (!enabled) return;
    void controller.init();
    return () => {
      void controller.dispose();
    };
  }, [enabled, controller]);

  useEffect(() => {
    void controller.setActive(isActive);
  }, [isActive, controller]);

  return { controller, ...snapshot };
}
