import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import type { GpsCoords } from '../services/exifGps';

/** Clé de persistance de la préférence géotag ('1'|'0'). */
const GEOTAG_KEY = 'tl_geotag';

export type GeotagToggleResult = 'enabled' | 'disabled' | 'denied';

export interface GeotagApi {
  /** Le géotag est actif (préférence ON ET permission accordée). */
  enabled: boolean;
  /**
   * Bascule le géotag. À l'activation, demande la permission de localisation au
   * PREMIER PLAN (jamais en arrière-plan) ; reste OFF si refusée.
   */
  requestToggle: () => Promise<GeotagToggleResult>;
  /** Dernière position connue (cache), ou null. Lecture synchrone pour la capture. */
  getCoords: () => GpsCoords | null;
}

function toCoords(loc: Location.LocationObject): GpsCoords {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude ?? null,
  };
}

/**
 * Géotag opt-in : gère la permission de localisation (premier plan), suit la
 * position en tâche de fond pendant que c'est actif, et expose la dernière
 * position pour l'inscrire dans l'EXIF des photos. 100 % on-device.
 */
export function useGeotag(): GeotagApi {
  const [enabled, setEnabled] = useState(false);
  const coordsRef = useRef<GpsCoords | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Restaure la préférence AU MONTAGE, mais uniquement si la permission est
  // toujours accordée (l'utilisateur a pu la retirer depuis les réglages système).
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(GEOTAG_KEY)
      .then(async (v) => {
        if (v !== '1' || cancelled) return;
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted && !cancelled) setEnabled(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Démarre/arrête le suivi de position selon l'état actif.
  useEffect(() => {
    if (!enabled) {
      coordsRef.current = null;
      watchRef.current?.remove();
      watchRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last != null && !cancelled) coordsRef.current = toCoords(last);
      } catch {
        /* pas de dernière position connue */
      }
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
          (loc) => {
            coordsRef.current = toCoords(loc);
          },
        );
        if (cancelled) sub.remove();
        else watchRef.current = sub;
      } catch {
        /* suivi indisponible */
      }
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [enabled]);

  const requestToggle = useCallback(async (): Promise<GeotagToggleResult> => {
    if (enabled) {
      setEnabled(false);
      void AsyncStorage.setItem(GEOTAG_KEY, '0').catch(() => {});
      return 'disabled';
    }
    const res = await Location.requestForegroundPermissionsAsync();
    if (res.granted) {
      setEnabled(true);
      void AsyncStorage.setItem(GEOTAG_KEY, '1').catch(() => {});
      return 'enabled';
    }
    return 'denied';
  }, [enabled]);

  const getCoords = useCallback(() => coordsRef.current, []);

  return { enabled, requestToggle, getCoords };
}
