/**
 * Journal d'erreurs local (ADR 0007) : rien ne part jamais de l'appareil — on
 * teste l'append plafonné, la résistance à la corruption, le rendu copiable et
 * le chaînage du handler global.
 */

import {
  clearCrashJournal,
  formatCrashJournal,
  installCrashJournal,
  readCrashJournal,
  recordError,
  type CrashEntry,
} from '../crashJournal';

// Mock expo-file-system/legacy : store mémoire (préfixe `mock` requis — jest
// hoiste jest.mock() au-dessus des imports/const).
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  readAsStringAsync: jest.fn(async (uri: string) => {
    if (!mockFiles.has(uri)) throw new Error('ENOENT');
    return mockFiles.get(uri) as string;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
    mockFiles.set(uri, content);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
});

describe('recordError / readCrashJournal', () => {
  it('append + relecture (message, kind, contexte, stack tronquée)', async () => {
    recordError('boom', { context: 'notice' });
    recordError('fatal!', { kind: 'fatal', stack: 'x'.repeat(5000), context: 'global' });
    await flush();
    const list = await readCrashJournal();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'error', message: 'boom', context: 'notice' });
    expect(list[1]?.kind).toBe('fatal');
    expect(list[1]?.stack?.length).toBe(4000); // MAX_STACK
    expect(new Date(list[0]!.ts).getTime()).not.toBeNaN();
  });

  it('plafonné à 30 entrées (les plus anciennes sortent)', async () => {
    for (let i = 0; i < 35; i++) recordError(`e${i}`);
    await flush();
    const list = await readCrashJournal();
    expect(list).toHaveLength(30);
    expect(list[0]?.message).toBe('e5');
    expect(list[29]?.message).toBe('e34');
  });

  it('fichier corrompu → [] (et le prochain append repart proprement)', async () => {
    mockFiles.set('file:///doc/crash-journal.json', '{pas-du-json');
    await expect(readCrashJournal()).resolves.toEqual([]);
    recordError('après corruption');
    await flush();
    await expect(readCrashJournal()).resolves.toHaveLength(1);
  });

  it('clearCrashJournal vide le journal', async () => {
    recordError('x');
    await flush();
    await clearCrashJournal();
    await expect(readCrashJournal()).resolves.toEqual([]);
  });
});

describe('formatCrashJournal — rendu copiable', () => {
  it('vide → mention explicite', () => {
    expect(formatCrashJournal([])).toContain('empty');
  });

  it('inclut horodatage, kind, contexte, message et stack', () => {
    const entries: CrashEntry[] = [
      { ts: '2026-09-07T10:00:00.000Z', kind: 'fatal', message: 'Boom', stack: 'at foo()', context: 'global' },
    ];
    const out = formatCrashJournal(entries);
    expect(out).toContain('TwinLens · error journal (1)');
    expect(out).toContain('[2026-09-07T10:00:00.000Z] FATAL (global): Boom');
    expect(out).toContain('at foo()');
  });
});

describe('installCrashJournal — handler global chaîné', () => {
  it('capture puis rappelle le handler précédent', async () => {
    const previous = jest.fn();
    let installedHandler: ((e: unknown, fatal?: boolean) => void) | undefined;
    (globalThis as Record<string, unknown>).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => {
        installedHandler = h;
      },
    };
    installCrashJournal();
    expect(installedHandler).toBeDefined();

    const err = new Error('fatal crash');
    installedHandler?.(err, true);
    await flush();

    expect(previous).toHaveBeenCalledWith(err, true); // le crash RN suit son cours
    const list = await readCrashJournal();
    expect(list.at(-1)).toMatchObject({ kind: 'fatal', message: 'fatal crash', context: 'global' });
  });
});
