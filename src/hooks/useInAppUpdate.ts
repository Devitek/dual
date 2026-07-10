import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as InAppUpdates from 'expo-in-app-updates';

import { useIsForeground } from './useIsForeground';

/** Anti-spam : on n'interroge Play qu'une fois toutes les 6 h. */
const CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const LAST_CHECK_KEY = 'tl_update_last_check';
/** Version « plus tard » : tant que le Store propose CE versionCode, on ne re-propose plus. */
const SNOOZED_VERSION_KEY = 'tl_update_snoozed_version';

export interface InAppUpdateState {
  /** Une mise à jour Play est dispo (flexible) et non « snoozée ». */
  updateAvailable: boolean;
  /** Lance le téléchargement flexible (arrière-plan) + install auto à la fin. */
  startUpdate: () => void;
  /** « Plus tard » : masque et ne re-propose pas avant une nouvelle version. */
  snooze: () => void;
}

/**
 * Incite (sans intrusion) à installer une mise à jour Play disponible.
 *
 * Bonnes pratiques Google : **Play In-App Updates** en mode *flexible*
 * (téléchargement en arrière-plan, non bloquant). On vérifie au passage au
 * premier plan, throttlé (6 h) et **uniquement en build de prod**. Aucun échec
 * de check ne doit jamais impacter l'app (tout est silencieux).
 */
export function useInAppUpdate(): InAppUpdateState {
  const isForeground = useIsForeground();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const storeVersionRef = useRef<string | null>(null);
  const checkingRef = useRef(false);

  const runCheck = useCallback(async (): Promise<void> => {
    // Jamais en dev (le flux Play n'existe pas), ni hors Android.
    if (__DEV__ || Platform.OS !== 'android' || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const lastRaw = await AsyncStorage.getItem(LAST_CHECK_KEY).catch(() => null);
      if (lastRaw != null && Date.now() - Number(lastRaw) < CHECK_COOLDOWN_MS) return;

      const res = await InAppUpdates.checkForUpdate();
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now())).catch(() => {});

      if (!res.updateAvailable || res.flexibleAllowed === false) return;

      const snoozed = await AsyncStorage.getItem(SNOOZED_VERSION_KEY).catch(() => null);
      if (snoozed != null && snoozed === res.storeVersion) return; // déjà écarté pour cette version

      storeVersionRef.current = res.storeVersion;
      setUpdateAvailable(true);
    } catch {
      /* silencieux : un check d'update ne doit jamais gêner l'utilisateur */
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Vérifie au passage au premier plan (petit délai pour ne pas concurrencer
  // l'init caméra / les dialogues de permission au 1er lancement).
  useEffect(() => {
    if (!isForeground) return;
    const id = setTimeout(() => void runCheck(), 3000);
    return () => clearTimeout(id);
  }, [isForeground, runCheck]);

  const startUpdate = useCallback((): void => {
    setUpdateAvailable(false);
    // false = flexible : télécharge en arrière-plan puis installe (redémarrage
    // proposé par le système une fois prêt). L'utilisateur continue à filmer.
    void InAppUpdates.startUpdate(false).catch(() => {});
  }, []);

  const snooze = useCallback((): void => {
    setUpdateAvailable(false);
    const v = storeVersionRef.current;
    if (v != null) void AsyncStorage.setItem(SNOOZED_VERSION_KEY, v).catch(() => {});
  }, []);

  return { updateAvailable, startUpdate, snooze };
}
