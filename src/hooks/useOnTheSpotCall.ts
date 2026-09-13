import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import i18n from '../i18n';
import {
  completeActiveCall,
  computeStreak,
  getActiveCall,
  refreshJournal,
  OTS_CAPTURE_WINDOW_MS,
  type OtsCall,
  type OtsSettings,
} from '../services/onTheSpot';
import type { CapturedMedia } from '../vision/MultiCamController';

/** Cadence de surveillance du journal (une fenêtre peut s'ouvrir app ouverte). */
const POLL_MS = 10_000;
/** Cadence du compte à rebours affiché. */
const TICK_MS = 1_000;

export interface OnTheSpotCallState {
  /** Appel dont la fenêtre est ouverte (null sinon). Pilote le chip viseur. */
  activeCall: OtsCall | null;
  /** Millisecondes restantes de la fenêtre (0 si aucun appel). */
  remainingMs: number;
}

/**
 * Fenêtre de capture « Sur le fait » côté UI (#180, chantier 2).
 *
 * Une seule source de vérité : le journal. Qu'on arrive par le tap sur la
 * notification, par l'ouverture spontanée de l'app pendant une fenêtre, ou
 * qu'une fenêtre s'ouvre l'app déjà ouverte (poll), le chip s'affiche dès
 * qu'un appel est actif. Toute PHOTO capturée pendant la fenêtre = réussite
 * (+ éventuel bonus planifié par le service, plafond quotidien respecté).
 */
export function useOnTheSpotCall(
  enabled: boolean,
  settings: OtsSettings,
  lastCapture: CapturedMedia | null,
  notify: (kind: 'success' | 'error', text: string) => void,
): OnTheSpotCallState {
  const [activeCall, setActiveCall] = useState<OtsCall | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const activeRef = useRef<OtsCall | null>(null);
  const settingsRef = useRef(settings);
  const notifyRef = useRef(notify);
  useEffect(() => {
    settingsRef.current = settings;
    notifyRef.current = notify;
  }, [settings, notify]);

  const refresh = useCallback(async (tappedCallId?: string) => {
    const journal = await refreshJournal();
    const now = Date.now();
    const active = getActiveCall([...journal], now);
    activeRef.current = active;
    setActiveCall(active);
    setRemainingMs(active != null ? Math.max(0, active.scheduledAt + OTS_CAPTURE_WINDOW_MS - now) : 0);
    // Tap sur une notification dont la fenêtre est déjà close : le dire.
    if (tappedCallId != null && active?.id !== tappedCallId) {
      const tapped = journal.find((c) => c.id === tappedCallId);
      if (tapped != null && tapped.status !== 'done') notifyRef.current('error', i18n.t('ots.expiredNotice'));
    }
  }, []);

  // Réponses de notification : à froid (app lancée par le tap) + à chaud.
  useEffect(() => {
    if (!enabled) return;
    const callIdOf = (data: unknown): string | undefined => {
      const url = (data as { url?: unknown } | null)?.url;
      if (typeof url !== 'string') return undefined;
      return /[?&]call=([\w-]+)/.exec(url)?.[1];
    };
    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        const id = callIdOf(r?.notification.request.content.data);
        if (!cancelled && id != null) void refresh(id);
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = callIdOf(r.notification.request.content.data);
      if (id != null) void refresh(id);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, refresh]);

  // Surveillance : rattrape une fenêtre qui s'ouvre pendant que l'app est
  // ouverte, et l'état initial au montage. Le chargement initial part en
  // microtâche : pas de setState synchrone dans le corps de l'effet (règle
  // set-state-in-effect verrouillée en erreur, #136).
  useEffect(() => {
    if (!enabled) {
      activeRef.current = null;
      return;
    }
    const kickoff = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(id);
    };
  }, [enabled, refresh]);

  // Compte à rebours : tick chaque seconde pendant une fenêtre ouverte ;
  // à zéro, refresh (l'appel passe « manqué » côté journal).
  useEffect(() => {
    if (activeCall == null) return;
    const id = setInterval(() => {
      const left = activeCall.scheduledAt + OTS_CAPTURE_WINDOW_MS - Date.now();
      if (left <= 0) {
        clearInterval(id);
        void refresh();
      } else {
        setRemainingMs(left);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [activeCall, refresh]);

  // Toute PHOTO capturée pendant la fenêtre = réussite de l'appel.
  const lastHandled = useRef<CapturedMedia | null>(null);
  useEffect(() => {
    const call = activeRef.current;
    if (call == null || lastCapture == null || lastCapture === lastHandled.current) return;
    if (lastCapture.kind !== 'photo') return;
    lastHandled.current = lastCapture;
    void completeActiveCall(call.id, lastCapture.primaryUri, settingsRef.current).then(async (res) => {
      if (res === 'completed') {
        // La série (streak) rend la réussite tangible dès 2 jours consécutifs.
        const journal = await refreshJournal();
        const streak = computeStreak(journal, Date.now());
        notifyRef.current(
          'success',
          streak.current >= 2 ? i18n.t('ots.doneNoticeStreak', { count: streak.current }) : i18n.t('ots.doneNotice'),
        );
      }
      void refresh();
    });
  }, [lastCapture, refresh]);

  // Désactivation à chaud : l'état interne peut rester « actif », le rendu est
  // dérivé (pas de reset par setState dans un effet).
  return enabled ? { activeCall, remainingMs } : { activeCall: null, remainingMs: 0 };
}
