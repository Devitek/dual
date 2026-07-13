import { useEffect, useRef } from 'react';

import {
  setVolumeKeyMode,
  subscribeVolumeKey,
  type VolumeKeyAction,
  type VolumeKeyMode,
} from '../native/volumeKeys';

interface UseVolumeShutterOptions {
  /** Réglage utilisateur : 'volume' (défaut, système) | 'shutter' | 'zoom'. */
  action: VolumeKeyAction;
  /** Contexte actif (caméra prête + aucun sheet/gate ouvert). Sinon : pass-through. */
  enabled: boolean;
  /** Déclencheur obturateur (photo ou start/stop vidéo selon le mode courant). */
  onShutter: () => void;
  /** Zoom pas à pas (volume+ = 'in', volume− = 'out'). */
  onZoom: (direction: 'in' | 'out') => void;
}

/**
 * Relie les touches matérielles (volume / bouton caméra) aux actions caméra.
 * Le natif n'intercepte QUE selon le mode effectif poussé ici :
 *   - désactivé (sheet ouvert, hors caméra…) -> 'off' (aucune interception)
 *   - 'volume' -> volume système normal (mais le bouton caméra reste obturateur)
 *   - 'shutter' / 'zoom' -> touches de volume consommées et redirigées.
 */
export function useVolumeShutter({ action, enabled, onShutter, onZoom }: UseVolumeShutterOptions): void {
  const shutterRef = useRef(onShutter);
  shutterRef.current = onShutter;
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;

  const effective: VolumeKeyMode = enabled ? action : 'off';
  const effectiveRef = useRef<VolumeKeyMode>(effective);
  effectiveRef.current = effective;

  // Pousse le mode effectif au natif à chaque changement.
  useEffect(() => {
    setVolumeKeyMode(effective);
  }, [effective]);

  // Abonnement unique ; interprète la touche selon le mode effectif courant.
  useEffect(() => {
    const sub = subscribeVolumeKey((key) => {
      if (key === 'camera') {
        shutterRef.current();
        return;
      }
      const mode = effectiveRef.current;
      if (mode === 'shutter') shutterRef.current();
      else if (mode === 'zoom') zoomRef.current(key === 'up' ? 'in' : 'out');
    });
    return () => {
      sub.remove();
      setVolumeKeyMode('off'); // sécurité : ne jamais laisser l'interception active
    };
  }, []);
}
