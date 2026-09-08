import { useCallback, useMemo, useRef, useState } from 'react';

import type { CameraSlot, MultiCamController, MultiCamStatus } from '../vision/MultiCamController';
import { haptics } from '../utils/haptics';

/**
 * Paliers de zoom rapides « par objectif » dérivés des bornes de la caméra
 * principale : ultra grand-angle (0.5×) si dispo, principal (1×), puis les
 * téléobjectifs usuels (2× / 5× / 10×) tant que l'appareil les atteint. Sur un
 * device logique multi-objectifs, franchir ces paliers bascule physiquement de
 * capteur (grand-angle → télé).
 */
export function buildZoomLevels(min: number, max: number): number[] {
  const levels: number[] = [];
  if (min <= 0.6) levels.push(0.5); // ultra grand-angle si dispo
  levels.push(1); // principal
  for (const z of [2, 5, 10, 30, 100]) {
    if (max + 0.05 >= z) levels.push(z); // téléobjectifs / super-zoom disponibles
  }
  return levels;
}

export interface ZoomState {
  zoomBounds: { min: number; max: number; current: number };
  zoomLevels: number[];
  /** Valeur affichée par les contrôles (slider / presets). */
  currentZoom: number;
  /** Valeur du toast indicateur (null = masqué). */
  zoomDisplay: number | null;
  /** Nonce de ré-affichage du toast (chaque changement le fait réapparaître). */
  zoomNonce: number;
  /** Zoom continu depuis le slider. */
  onZoom: (z: number) => void;
  /** Pas de zoom via les touches de volume. */
  zoomBy: (dir: 'in' | 'out') => void;
  /** Reflète une valeur déjà appliquée au contrôleur (fin de pinch). */
  showZoom: (z: number) => void;
  /** Variante throttlée (~80 ms) pour le pinch continu. */
  showZoomThrottled: (z: number) => void;
  /** Resynchronise l'état après un changement de caméra principale (swap). */
  syncToSlot: (slot: CameraSlot) => void;
}

/**
 * État et actions du zoom de la caméra principale : bornes, paliers, valeur
 * courante, toast indicateur. Les GESTES (pinch) restent dans l'écran, ils
 * combinent zoom et focus ; ils délèguent ici l'affichage.
 */
export function useZoomState(
  controller: MultiCamController,
  primarySlot: CameraSlot,
  camStatus: MultiCamStatus,
): ZoomState {
  const [zoomDisplay, setZoomDisplay] = useState<number | null>(null);
  const [zoomNonce, setZoomNonce] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(1);
  const lastZoomUpdate = useRef(0);

  // Bornes + paliers selon la caméra principale. `camStatus` force le recalcul
  // quand la session démarre (les bornes réelles n'existent qu'à ce moment-là).
  const zoomBounds = useMemo(
    () => controller.getZoomBounds(primarySlot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, primarySlot, camStatus],
  );
  const zoomLevels = useMemo(() => buildZoomLevels(zoomBounds.min, zoomBounds.max), [zoomBounds]);

  const showZoom = useCallback((z: number) => {
    setCurrentZoom(z);
    setZoomDisplay(z);
    setZoomNonce((n) => n + 1);
  }, []);

  const showZoomThrottled = useCallback(
    (z: number) => {
      const now = Date.now();
      if (now - lastZoomUpdate.current > 80) {
        lastZoomUpdate.current = now;
        showZoom(z);
      }
    },
    [showZoom],
  );

  // Zoom continu (slider) : applique + met à jour l'état (le tick haptique
  // d'accroche est géré dans le ZoomControl).
  const onZoom = useCallback(
    (z: number) => {
      const c = Math.min(zoomBounds.max, Math.max(zoomBounds.min, z));
      void controller.setZoom(primarySlot, c);
      showZoom(c);
    },
    [controller, primarySlot, zoomBounds, showZoom],
  );

  const zoomBy = useCallback(
    (dir: 'in' | 'out') => {
      const { min, max, current } = controller.getZoomBounds(primarySlot);
      const step = Math.max(0.1, (max - min) / 15);
      const z = Math.min(max, Math.max(min, current + (dir === 'in' ? step : -step)));
      void controller.setZoom(primarySlot, z);
      showZoom(z);
      haptics.selection();
    },
    [controller, primarySlot, showZoom],
  );

  const syncToSlot = useCallback(
    (slot: CameraSlot) => {
      setCurrentZoom(controller.getZoomBounds(slot).current);
    },
    [controller],
  );

  return {
    zoomBounds,
    zoomLevels,
    currentZoom,
    zoomDisplay,
    zoomNonce,
    onZoom,
    zoomBy,
    showZoom,
    showZoomThrottled,
    syncToSlot,
  };
}
