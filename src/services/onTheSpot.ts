import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Directory, File, Paths } from 'expo-file-system';

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

/** L'appel dont la fenêtre de capture est OUVERTE à l'instant `now` (ou null). */
export function getActiveCall(journal: readonly OtsCall[], now: number): OtsCall | null {
  return (
    journal.find(
      (c) => c.status === 'pending' && c.scheduledAt <= now && now < c.scheduledAt + OTS_CAPTURE_WINDOW_MS,
    ) ?? null
  );
}

/**
 * Marque « manqués » les appels en attente dont la fenêtre est passée.
 * Rend la MÊME référence si rien n'a changé (permet un save conditionnel).
 */
export function resolveExpiredCalls(journal: readonly OtsCall[], now: number): readonly OtsCall[] {
  if (!journal.some((c) => c.status === 'pending' && c.scheduledAt + OTS_CAPTURE_WINDOW_MS <= now)) {
    return journal;
  }
  return journal.map((c) =>
    c.status === 'pending' && c.scheduledAt + OTS_CAPTURE_WINDOW_MS <= now ? { ...c, status: 'missed' as const } : c,
  );
}

/**
 * Applique une réussite (pure) : l'appel passe « done » avec son média SI sa
 * fenêtre est encore ouverte. `completed=false` sinon (déjà statué, expiré...).
 */
export function applyCompletion(
  journal: readonly OtsCall[],
  callId: string,
  mediaUri: string,
  now: number,
): { journal: readonly OtsCall[]; completed: boolean } {
  const call = journal.find((c) => c.id === callId);
  if (call == null || call.status !== 'pending' || now >= call.scheduledAt + OTS_CAPTURE_WINDOW_MS) {
    return { journal, completed: false };
  }
  return {
    journal: journal.map((c) => (c.id === callId ? { ...c, status: 'done' as const, mediaUri } : c)),
    completed: true,
  };
}

/** Un bonus est planifiable si le total d'appels du jour reste sous le plafond. */
export function canScheduleBonus(journal: readonly OtsCall[], dayStartMs: number, maxPerDay: number): boolean {
  return callsOfDay([...journal], dayStartMs).length < maxPerDay;
}

/** Un jour d'appels, pour l'onglet galerie (du plus récent au plus ancien). */
export interface OtsDayGroup {
  dayStartMs: number;
  /** Appels du jour, du plus ancien au plus récent. */
  calls: OtsCall[];
}

/** Groupe le journal par jour local, jours décroissants, appels croissants. */
export function groupCallsByDay(journal: readonly OtsCall[]): OtsDayGroup[] {
  const byDay = new Map<number, OtsCall[]>();
  for (const call of journal) {
    const day = dayStartOf(call.scheduledAt);
    const list = byDay.get(day);
    if (list == null) byDay.set(day, [call]);
    else list.push(call);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayStartMs, calls]) => ({ dayStartMs, calls: calls.sort((a, b) => a.scheduledAt - b.scheduledAt) }));
}

/**
 * Copie le média d'une réussite vers un fichier DURABLE de l'app
 * (documents/onthespot/). Les fichiers de session sont nettoyables : sans
 * cette copie, l'historique « Sur le fait » perdrait ses aperçus. Rend l'URI
 * durable, ou l'URI source en cas d'échec (best-effort).
 */
export function persistCallMedia(callId: string, sourceUri: string): string {
  try {
    const dir = new Directory(Paths.document, 'onthespot');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, `${callId}.jpg`);
    if (!dest.exists) new File(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return sourceUri;
  }
}

// ---------------------------------------------------------------------------
// Streak (chantier 3) : jours consécutifs avec au moins une réussite.
// Navigation entre jours via dayStartOf(± 12/36 h) et JAMAIS ± 24 h : les
// jours de changement d'heure font 23 ou 25 h, une arithmétique naïve
// casserait la série deux fois par an.
// ---------------------------------------------------------------------------

export interface OtsStreak {
  /** Série en cours (une journée SANS réussite ne casse la série qu'une fois finie). */
  current: number;
  /** Meilleure série de l'historique. */
  best: number;
}

/** Début du jour local PRÉCÉDENT celui qui commence à `dayStartMs`. */
function prevDayStart(dayStartMs: number): number {
  return dayStartOf(dayStartMs - 12 * 3_600_000);
}

/** Vrai si le jour commençant à `b` suit immédiatement celui commençant à `a`. */
function isNextDay(a: number, b: number): boolean {
  return dayStartOf(a + 36 * 3_600_000) === b;
}

export function computeStreak(journal: readonly OtsCall[], now: number): OtsStreak {
  const successDays = new Set<number>();
  for (const c of journal) {
    if (c.status === 'done') successDays.add(dayStartOf(c.scheduledAt));
  }

  // Série en cours : on remonte depuis aujourd'hui ; si aujourd'hui n'a pas
  // (encore) de réussite, la série d'hier tient toujours (journée en cours).
  const today = dayStartOf(now);
  let current = 0;
  let cursor = successDays.has(today) ? today : prevDayStart(today);
  while (successDays.has(cursor)) {
    current += 1;
    cursor = prevDayStart(cursor);
  }

  // Meilleure série : parcours chronologique des jours de réussite.
  const days = [...successDays].sort((a, b) => a - b);
  let best = current;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    run = prev != null && isNextDay(prev, d) ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return { current, best };
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

/** Verrou d'exclusion des opérations sur le journal : sync, complétion et
 *  résolution des expirés s'ENCHAÎNENT au lieu de se croiser (l'effet React
 *  peut se re-déclencher pendant qu'une opération lit le journal). */
let opInFlight: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = opInFlight.then(fn, fn);
  opInFlight = next.catch(() => {});
  return next;
}

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
  return runExclusive(() => doSync(settings, now, random));
}

/**
 * Relit le journal en résolvant les fenêtres expirées (persisté si changement).
 * C'est LA lecture à utiliser côté UI : le journal rendu est toujours cohérent.
 */
export function refreshJournal(now: number = Date.now()): Promise<readonly OtsCall[]> {
  return runExclusive(async () => {
    const journal = await loadJournal();
    const resolved = resolveExpiredCalls(journal, now);
    if (resolved !== journal) await saveJournal(resolved);
    return resolved;
  });
}

/**
 * Réussite d'un appel : statue « done » (si la fenêtre est encore ouverte) et,
 * si le plafond quotidien n'est pas atteint, tire UN appel bonus dans le reste
 * de la journée (mécanique progressive décidée dans #180). Rend 'completed' ou
 * 'ignored' (appel déjà statué / fenêtre close entre-temps).
 */
export function completeActiveCall(
  callId: string,
  mediaUri: string,
  settings: OtsSettings,
  now: number = Date.now(),
  random: () => number = Math.random,
): Promise<'completed' | 'ignored'> {
  return runExclusive(async () => {
    const stored = await loadJournal();
    const journal = resolveExpiredCalls(stored, now);
    const { journal: updated, completed } = applyCompletion(journal, callId, mediaUri, now);
    if (!completed) {
      // Persiste au moins la résolution des expirés si elle a eu lieu.
      if (journal !== stored) await saveJournal(journal);
      return 'ignored';
    }

    const dayStart = dayStartOf(now);
    let final = updated;
    if (canScheduleBonus(updated, dayStart, settings.maxPerDay)) {
      const times = drawCallTimes({
        count: 1,
        windowStartHour: settings.windowStart,
        windowEndHour: settings.windowEnd,
        dayStartMs: dayStart,
        earliestMs: now + OTS_MIN_LEAD_MS,
        random,
      });
      const first = times[0];
      if (first != null) {
        const bonus: OtsCall = { id: newCallId(first, random), scheduledAt: first, status: 'pending' };
        final = [...updated, bonus];
        await saveJournal(final);
        await scheduleCallNotification(bonus);
        return 'completed';
      }
    }
    await saveJournal(final);
    return 'completed';
  });
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

    const stored = await loadJournal();
    const journal = resolveExpiredCalls(stored, now);
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

    if (additions.length === 0) {
      if (journal !== stored) await saveJournal(journal);
      return;
    }
    await saveJournal([...journal, ...additions]);
    for (const call of additions) {
      await scheduleCallNotification(call);
    }
  } catch {
    /* best-effort : re-tentera au prochain passage au premier plan */
  }
}
