import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import i18n from '../i18n';
import type { OtsPerDay, OtsWindowEnd, OtsWindowStart } from './settings';

/**
 * « Sur le fait » / On the Spot (#180, chantier 1) : planification des appels.
 *
 * Principes :
 * - 100 % local (ADR 0008) : notifications LOCALES programmées, tirage aléatoire
 *   on-device, journal en AsyncStorage. Aucun serveur.
 * - Alarmes INEXACTES assumées (pas de SCHEDULE_EXACT_ALARM, décision #180) :
 *   Android peut décaler la notification de quelques minutes, sans importance
 *   pour cette UX.
 * - Ce module planifie les appels GARANTIS (min/jour) pour aujourd'hui et
 *   demain ; les appels bonus déclenchés par une réussite arrivent au
 *   chantier 2 (flux de capture).
 */

/** Délai de capture après l'appel (3 min, décision #180). */
export const OTS_CAPTURE_WINDOW_MS = 3 * 60 * 1000;
/** Écart minimal entre deux appels d'une même journée. */
export const OTS_MIN_GAP_MS = 60 * 60 * 1000;
/** Un appel tiré « aujourd'hui » ne peut pas tomber à moins de 10 min. */
export const OTS_MIN_LEAD_MS = 10 * 60 * 1000;

/** Préfixe des identifiants de notifications « Sur le fait » (annulation ciblée). */
export const OTS_NOTIFICATION_PREFIX = 'ots-';
/** Schéma de deep link ouvert par la notification (géré au chantier 2). */
export const OTS_DEEP_LINK_PREFIX = 'twinlens://onthespot?call=';

const JOURNAL_KEY = 'tl_ots_journal';

// Affichage des notifications quand l'app est AU PREMIER PLAN (sinon Android
// les masque par défaut). Unique source de notifications de l'app.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export type OtsCallStatus = 'pending' | 'done' | 'missed';

export interface OtsCall {
  /** Identifiant unique (timestamp de planification + aléa). */
  id: string;
  /** Horaire planifié de l'appel (epoch ms). */
  scheduledAt: number;
  status: OtsCallStatus;
  /** URI du média capturé (chantier 2). */
  mediaUri?: string;
}

export interface OtsSettings {
  enabled: boolean;
  minPerDay: OtsPerDay;
  maxPerDay: OtsPerDay;
  windowStart: OtsWindowStart;
  windowEnd: OtsWindowEnd;
}

// ---------------------------------------------------------------------------
// Logique PURE (testée dans onTheSpot.test.ts)
// ---------------------------------------------------------------------------

/** Début du jour local (00:00) contenant `ts`. */
export function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface DrawParams {
  /** Nombre d'appels à tirer. */
  count: number;
  /** Bornes de la plage, en heures locales (ex. 9 et 19). */
  windowStartHour: number;
  windowEndHour: number;
  /** Début du jour local (00:00) concerné. */
  dayStartMs: number;
  /** Aucun tirage avant cet instant (ex. maintenant + 10 min pour aujourd'hui). */
  earliestMs: number;
  /** Générateur [0,1) injectable (tests déterministes). */
  random?: () => number;
}

/**
 * Tire des horaires aléatoires dans la plage du jour, triés, espacés d'au
 * moins {@link OTS_MIN_GAP_MS}. Si la fenêtre restante est trop courte, rend
 * moins d'appels que demandé (voire aucun) : on ne force jamais un appel
 * impossible.
 */
export function drawCallTimes({
  count,
  windowStartHour,
  windowEndHour,
  dayStartMs,
  earliestMs,
  random = Math.random,
}: DrawParams): number[] {
  const windowStart = Math.max(dayStartMs + windowStartHour * 3_600_000, earliestMs);
  const windowEnd = dayStartMs + windowEndHour * 3_600_000;
  if (windowEnd <= windowStart) return [];

  // Nombre d'appels qui TIENNENT dans la fenêtre avec l'écart minimal.
  const span = windowEnd - windowStart;
  const fit = Math.min(count, 1 + Math.floor(span / OTS_MIN_GAP_MS));

  // Tirage par segments égaux (un appel par segment, à une position aléatoire) :
  // garantit l'étalement sans boucle de rejet.
  const out: number[] = [];
  const segment = span / fit;
  for (let i = 0; i < fit; i++) {
    const jitter = random() * Math.max(0, segment - OTS_MIN_GAP_MS / 2);
    out.push(Math.round(windowStart + i * segment + jitter));
  }
  return out;
}

/** Les appels du journal planifiés dans la journée de `dayStartMs`. */
export function callsOfDay(journal: readonly OtsCall[], dayStartMs: number): OtsCall[] {
  const end = dayStartMs + 24 * 3_600_000;
  return journal.filter((c) => c.scheduledAt >= dayStartMs && c.scheduledAt < end);
}

/**
 * Journal sans les appels FUTURS encore en attente : à la désactivation, ces
 * appels n'auront jamais lieu (notifications annulées), ils ne doivent pas
 * rester dans l'historique (ni compter comme « manqués »). Le passé, lui,
 * reste intact.
 */
export function pruneFuturePending(journal: readonly OtsCall[], now: number): OtsCall[] {
  return journal.filter((c) => !(c.status === 'pending' && c.scheduledAt > now));
}

// ---------------------------------------------------------------------------
// Journal (AsyncStorage, best-effort)
// ---------------------------------------------------------------------------

export async function loadJournal(): Promise<OtsCall[]> {
  try {
    const raw = await AsyncStorage.getItem(JOURNAL_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is OtsCall =>
        typeof (c as OtsCall)?.id === 'string' &&
        typeof (c as OtsCall)?.scheduledAt === 'number' &&
        ['pending', 'done', 'missed'].includes((c as OtsCall)?.status),
    );
  } catch {
    return [];
  }
}

export async function saveJournal(journal: readonly OtsCall[]): Promise<void> {
  try {
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Synchronisation des notifications (appelée à chaque passage au premier plan)
// ---------------------------------------------------------------------------

function newCallId(scheduledAt: number, random: () => number): string {
  return `${scheduledAt.toString(36)}-${Math.floor(random() * 36 ** 4).toString(36)}`;
}

async function scheduleCallNotification(call: OtsCall): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: `${OTS_NOTIFICATION_PREFIX}${call.id}`,
    content: {
      title: i18n.t('ots.notifTitle'),
      body: i18n.t('ots.notifBody', { minutes: Math.round(OTS_CAPTURE_WINDOW_MS / 60000) }),
      data: { url: `${OTS_DEEP_LINK_PREFIX}${call.id}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(call.scheduledAt) },
  });
}

/** Sync en cours : les appels concurrents s'enchaînent au lieu de se croiser
 *  (l'effet React peut se re-déclencher pendant qu'une sync lit le journal). */
let syncInFlight: Promise<void> = Promise.resolve();

/**
 * Aligne les notifications programmées sur les réglages : désactivé => tout
 * annuler et purger les appels futurs du journal ; activé => garantir
 * `minPerDay` appels journalisés + programmés pour aujourd'hui (fenêtre
 * restante) et demain. Idempotent, sérialisé, best-effort : appelée à chaque
 * retour au premier plan, jamais bloquante pour l'UI.
 */
export function syncOnTheSpotSchedule(
  settings: OtsSettings,
  now: number = Date.now(),
  random: () => number = Math.random,
): Promise<void> {
  syncInFlight = syncInFlight.then(() => doSync(settings, now, random));
  return syncInFlight;
}

async function doSync(settings: OtsSettings, now: number, random: () => number): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((n) => n.identifier.startsWith(OTS_NOTIFICATION_PREFIX));

    if (!settings.enabled) {
      await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
      const journal = await loadJournal();
      const pruned = pruneFuturePending(journal, now);
      if (pruned.length !== journal.length) await saveJournal(pruned);
      return;
    }

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return; // la demande se fait au moment de l'activation (UI)

    const journal = await loadJournal();
    const additions: OtsCall[] = [];

    for (const dayOffset of [0, 1]) {
      const dayStart = dayStartOf(now) + dayOffset * 24 * 3_600_000;
      const existing = callsOfDay(journal, dayStart);
      // Des appels déjà planifiés (ou passés) ce jour-là : on ne re-tire pas,
      // même s'ils sont inférieurs au min (fenêtre restante trop courte hier
      // soir, réglage augmenté en cours de journée...). Simplicité d'abord.
      if (existing.length > 0) continue;
      const times = drawCallTimes({
        count: settings.minPerDay,
        windowStartHour: settings.windowStart,
        windowEndHour: settings.windowEnd,
        dayStartMs: dayStart,
        earliestMs: dayOffset === 0 ? now + OTS_MIN_LEAD_MS : 0,
        random,
      });
      for (const t of times) {
        additions.push({ id: newCallId(t, random), scheduledAt: t, status: 'pending' });
      }
    }

    if (additions.length === 0) return;
    await saveJournal([...journal, ...additions]);
    for (const call of additions) {
      await scheduleCallNotification(call);
    }
  } catch {
    /* best-effort : re-tentera au prochain passage au premier plan */
  }
}
