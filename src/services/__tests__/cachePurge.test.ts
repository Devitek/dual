/**
 * #255 : nettoyage des bruts du cache. Invariant cardinal : on ne supprime que ce
 * qu'on a explicitement noté (bruts SAUVEGARDÉS) ou demandé de supprimer ; jamais
 * un fichier hors du cache, jamais un fichier de la session en cours à la purge.
 */
import { deleteRawFiles, runCachePurge, scheduleCachePurge, type CachePurgeDeps } from '../cachePurge';

const CACHE = 'file:///data/user/0/fr.devitek.twinlens/cache';
const raw = (n: number): string => `/data/user/0/fr.devitek.twinlens/cache/VisionCamera_${n}.mp4`;
const uri = (n: number): string => `file://${raw(n)}`;

/** Faux système de fichiers : registre en mémoire + journal des suppressions. */
function fakeFs(session: string, opts: { failOn?: string[]; ledger?: string | null } = {}) {
  const state = { ledger: opts.ledger ?? null, removed: [] as string[] };
  const deps: CachePurgeDeps = {
    cacheUri: CACHE,
    session,
    readLedger: () => state.ledger,
    writeLedger: (c) => {
      state.ledger = c;
    },
    remove: (u) => {
      if (opts.failOn?.includes(u)) throw new Error('verrouillé');
      state.removed.push(u);
    },
  };
  return { deps, state };
}

describe('deleteRawFiles', () => {
  it('supprime les bruts du cache, chemins natifs ou file:// indifféremment', () => {
    const { deps, state } = fakeFs('A');
    expect(deleteRawFiles([raw(1), uri(2)], deps)).toBe(2);
    expect(state.removed).toEqual([uri(1), uri(2)]);
  });

  it('ne touche jamais un fichier hors du cache (garde-fou)', () => {
    const { deps, state } = fakeFs('A');
    deleteRawFiles(['/storage/emulated/0/DCIM/Dual_PiP_1.mp4', 'content://media/external/video/1', null], deps);
    expect(state.removed).toEqual([]);
  });

  it('ne lève pas si une suppression échoue', () => {
    const { deps } = fakeFs('A', { failOn: [uri(1)] });
    expect(() => deleteRawFiles([raw(1), raw(2)], deps)).not.toThrow();
  });
});

describe('scheduleCachePurge + runCachePurge', () => {
  it('purge au lancement suivant les bruts notés par la session précédente', () => {
    const a = fakeFs('A');
    scheduleCachePurge([raw(1), raw(2)], a.deps);
    expect(a.state.removed).toEqual([]); // rien de supprimé pendant la session

    const b = fakeFs('B', { ledger: a.state.ledger });
    expect(runCachePurge(b.deps)).toBe(2);
    expect(b.state.removed).toEqual([uri(1), uri(2)]);
    expect(JSON.parse(b.state.ledger as string).entries).toEqual([]);
  });

  it('ne purge JAMAIS les bruts de la session en cours (contrôleur recréé dans le même process)', () => {
    const { deps, state } = fakeFs('A');
    scheduleCachePurge([raw(1)], deps);
    expect(runCachePurge(deps)).toBe(0);
    expect(state.removed).toEqual([]);
    expect(JSON.parse(state.ledger as string).entries).toHaveLength(1);
  });

  it('garde pour un prochain essai un brut dont la suppression échoue', () => {
    const a = fakeFs('A');
    scheduleCachePurge([raw(1), raw(2)], a.deps);
    const b = fakeFs('B', { ledger: a.state.ledger, failOn: [uri(1)] });
    expect(runCachePurge(b.deps)).toBe(1);
    const left = JSON.parse(b.state.ledger as string).entries as { uri: string }[];
    expect(left.map((e) => e.uri)).toEqual([uri(1)]);
  });

  it('dédoublonne et ignore les fichiers hors du cache', () => {
    const { deps, state } = fakeFs('A');
    scheduleCachePurge([raw(1), uri(1), '/storage/emulated/0/DCIM/x.jpg'], deps);
    expect(JSON.parse(state.ledger as string).entries).toEqual([{ uri: uri(1), session: 'A' }]);
  });

  it("un orphelin jamais noté n'est jamais purgé (réservé à #244 / #261)", () => {
    const a = fakeFs('A');
    scheduleCachePurge([raw(1)], a.deps); // seul raw(1) a été sauvegardé
    const b = fakeFs('B', { ledger: a.state.ledger });
    runCachePurge(b.deps);
    expect(b.state.removed).not.toContain(uri(2)); // raw(2) orphelin : intact
  });

  it('un registre corrompu vaut registre vide, sans lever', () => {
    const { deps, state } = fakeFs('B', { ledger: '{pas du json' });
    expect(runCachePurge(deps)).toBe(0);
    expect(state.removed).toEqual([]);
    expect(() => scheduleCachePurge([raw(3)], deps)).not.toThrow();
    expect(JSON.parse(state.ledger as string).entries).toEqual([{ uri: uri(3), session: 'B' }]);
  });
});
