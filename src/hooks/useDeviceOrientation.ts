import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

import { orientationFromAccel, uiRotationFor, type DeviceOrientation } from '../utils/orientation';

/**
 * Rotation UI (degrés) à appliquer aux contenus des boutons pour qu'ils restent
 * droits quand l'utilisateur tient le téléphone en paysage, l'activité restant
 * verrouillée portrait (façon Google Camera). Issue #173.
 *
 * NB : `setUpdateInterval` d'expo-sensors est GLOBAL au capteur : on s'aligne
 * sur les 100 ms déjà utilisés par le niveau à bulle (CameraGuides) pour ne pas
 * se marcher dessus.
 */
export function useDeviceOrientation(enabled: boolean): number {
  const [rotation, setRotation] = useState(0);
  const current = useRef<DeviceOrientation>(0);

  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(100);
      sub = Accelerometer.addListener(({ x, y }) => {
        const next = orientationFromAccel(x, y, current.current);
        if (next !== current.current) {
          current.current = next;
          setRotation(uiRotationFor(next));
        }
      });
    } catch {
      // Capteur absent (émulateur minimal) : les icônes restent droites.
    }
    return () => sub?.remove();
  }, [enabled]);

  return rotation;
}
