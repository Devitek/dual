import * as FileSystem from 'expo-file-system/legacy';

/**
 * Journal d'erreurs LOCAL (ADR 0007 — privacy = produit) : rien n'est jamais
 * transmis. Les erreurs fatales JS (handler global) et les erreurs notifiées à
 * l'utilisateur sont journalisées dans un fichier du sandbox de l'app ;
 * l'utilisateur peut COPIER le journal depuis Réglages → Aide & diagnostic et
 * nous le coller (issue GitHub / support) — même canal que le rapport device.
 *
 * Limites assumées : les crashs NATIFS (Kotlin/FGS) ne passent pas par ici —
 * ils sont couverts par Play Vitals (+ mapping R8 uploadé, cf. RELEASE.md).
 * L'écriture sur crash fatal est best-effort (le process peut mourir avant le
 * flush).
 */

export interface CrashEntry {
  /** ISO 8601. */
  ts: string;
  kind: 'fatal' | 'error';
  message: string;
  stack?: string;
  /** Où l'erreur a été captée (ex. `global`, `notice`). */
  context?: string;
}

const MAX_ENTRIES = 30;
const MAX_STACK = 4000;

const journalUri = (): string => `${FileSystem.documentDirectory ?? ''}crash-journal.json`;

/** Sérialise les écritures pour éviter les pertes en cas d'erreurs rapprochées. */
let writeQueue: Promise<void> = Promise.resolve();
let installed = false;

export async function readCrashJournal(): Promise<CrashEntry[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(journalUri());
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CrashEntry =>
        typeof e === 'object' &&
        e != null &&
        typeof (e as CrashEntry).ts === 'string' &&
        typeof (e as CrashEntry).message === 'string',
    );
  } catch {
    return []; // fichier absent ou corrompu
  }
}

async function appendEntry(entry: CrashEntry): Promise<void> {
  const list = await readCrashJournal();
  list.push(entry);
  const trimmed = list.slice(-MAX_ENTRIES);
  await FileSystem.writeAsStringAsync(journalUri(), JSON.stringify(trimmed));
}

/**
 * Journalise une erreur (fire-and-forget, ne jette jamais). À utiliser aux
 * points où l'app notifie déjà un échec à l'utilisateur.
 */
export function recordError(
  message: string,
  opts: { kind?: CrashEntry['kind']; stack?: string; context?: string } = {},
): void {
  const entry: CrashEntry = {
    ts: new Date().toISOString(),
    kind: opts.kind ?? 'error',
    message: String(message).slice(0, 1000),
    ...(opts.stack != null ? { stack: opts.stack.slice(0, MAX_STACK) } : {}),
    ...(opts.context != null ? { context: opts.context } : {}),
  };
  writeQueue = writeQueue.then(() => appendEntry(entry)).catch(() => {});
}

export function clearCrashJournal(): Promise<void> {
  return FileSystem.deleteAsync(journalUri(), { idempotent: true }).catch(() => {});
}

/** Rendu texte (locale-neutre) pour copie/collage dans une issue ou au support. */
export function formatCrashJournal(entries: CrashEntry[]): string {
  if (entries.length === 0) return 'TwinLens · error journal — empty';
  const lines = entries.map((e) => {
    const head = `[${e.ts}] ${e.kind.toUpperCase()}${e.context ? ` (${e.context})` : ''}: ${e.message}`;
    return e.stack ? `${head}\n${e.stack}` : head;
  });
  return `TwinLens · error journal (${entries.length})\n\n${lines.join('\n\n')}`;
}

/** Type minimal du handler d'erreurs global de React Native. */
type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface RNErrorUtils {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

/**
 * Installe la capture des erreurs JS fatales (à appeler UNE fois, au plus tôt —
 * cf. index.ts). Chaîne le handler précédent (LogBox / crash natif RN).
 */
export function installCrashJournal(): void {
  if (installed) return;
  installed = true;
  const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (errorUtils?.setGlobalHandler == null) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      const e = error as { message?: string; stack?: string } | undefined;
      recordError(String(e?.message ?? error), {
        kind: isFatal ? 'fatal' : 'error',
        stack: e?.stack,
        context: 'global',
      });
    } catch {
      /* le journal ne doit JAMAIS aggraver un crash */
    }
    previous?.(error, isFatal);
  });
}
