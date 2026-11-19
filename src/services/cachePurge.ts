// Nettoyage des fichiers bruts du cache (#255).
//
// VisionCamera écrit chaque capture dans `cacheDir` (VisionCamera_<n>.mp4, photos
// temporaires) et rien ne les supprimait : le cache grossissait sans fin (515 Mo
// mesurés après une matinée de tests).
//
// RÈGLE CARDINALE : on ne supprime QUE des bruts dont la sauvegarde a RÉUSSI.
// Un brut orphelin (composition jamais aboutie : app tuée, refus d'Android...) est
// précisément ce que la récupération (#244) et la reprise automatique (#261)
// doivent sauver : il n'est jamais touché ici.
//
// Deux vitesses :
//  - `deleteRawFiles` : suppression immédiate, quand plus rien ne référence le
//    brut (vidéo composée sans originaux) ;
//  - `scheduleCachePurge` + `runCachePurge` : le brut sert encore à la galerie de
//    session (originaux, photos) ; il est noté dans un registre et supprimé au
//    lancement SUIVANT. Chaque entrée porte l'identifiant de la session qui l'a
//    notée : une purge ne supprime jamais un fichier de la session en cours, même
//    si elle est relancée dans le même processus.
import { File, Paths } from 'expo-file-system';

import { toFileUri } from '../utils/fileSystem';

/** Identifiant de cette session (chargement du module = démarrage du process JS). */
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const LEDGER_NAME = 'cache-purge.json';

interface LedgerEntry {
  uri: string;
  session: string;
}

/** Dépendances injectables (tests). */
export interface CachePurgeDeps {
  /** URI `file://` du dossier cache de l'app (préfixe autorisé). */
  cacheUri: string;
  /** Session courante. */
  session: string;
  readLedger(): string | null;
  writeLedger(content: string): void;
  /** Supprime un fichier ; ne doit pas lever si le fichier n'existe plus. */
  remove(uri: string): void;
}

function ledgerFile(): File {
  return new File(Paths.document, LEDGER_NAME);
}

const defaultDeps: CachePurgeDeps = {
  get cacheUri() {
    return Paths.cache.uri;
  },
  session: SESSION_ID,
  readLedger() {
    const f = ledgerFile();
    return f.exists ? f.textSync() : null;
  },
  writeLedger(content) {
    const f = ledgerFile();
    if (!f.exists) f.create();
    f.write(content);
  },
  remove(uri) {
    const f = new File(uri);
    if (f.exists) f.delete();
  },
};

const withSlash = (uri: string): string => (uri.endsWith('/') ? uri : `${uri}/`);

/** URI `file://` du chemin s'il est DANS le cache de l'app, sinon null (garde-fou). */
function cacheUriOf(path: string, deps: CachePurgeDeps): string | null {
  const uri = toFileUri(path);
  return uri.startsWith(withSlash(deps.cacheUri)) ? uri : null;
}

function readEntries(deps: CachePurgeDeps): LedgerEntry[] {
  try {
    const raw = deps.readLedger();
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(
      (e): e is LedgerEntry =>
        typeof e === 'object' &&
        e != null &&
        typeof (e as LedgerEntry).uri === 'string' &&
        typeof (e as LedgerEntry).session === 'string',
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: LedgerEntry[], deps: CachePurgeDeps): void {
  deps.writeLedger(JSON.stringify({ v: 1, entries }));
}

/** Supprime tout de suite des bruts du cache que plus rien ne référence. Ne lève jamais. */
export function deleteRawFiles(paths: (string | null | undefined)[], deps: CachePurgeDeps = defaultDeps): number {
  let deleted = 0;
  for (const path of paths) {
    if (path == null) continue;
    const uri = cacheUriOf(path, deps);
    if (uri == null) continue;
    try {
      deps.remove(uri);
      deleted += 1;
    } catch {
      // Fichier verrouillé ou disparu : sans gravité, le cache reste nettoyable par Android.
    }
  }
  return deleted;
}

/** Note des bruts SAUVEGARDÉS, à supprimer au prochain lancement. Ne lève jamais. */
export function scheduleCachePurge(paths: (string | null | undefined)[], deps: CachePurgeDeps = defaultDeps): void {
  try {
    const entries = readEntries(deps);
    const known = new Set(entries.map((e) => e.uri));
    for (const path of paths) {
      if (path == null) continue;
      const uri = cacheUriOf(path, deps);
      if (uri == null || known.has(uri)) continue;
      entries.push({ uri, session: deps.session });
      known.add(uri);
    }
    writeEntries(entries, deps);
  } catch {
    // Registre illisible ou non inscriptible : on perd seulement une occasion de nettoyer.
  }
}

/**
 * Au lancement : supprime les bruts notés par les sessions PRÉCÉDENTES et garde
 * ceux de la session en cours. Renvoie le nombre de fichiers traités. Ne lève jamais.
 */
export function runCachePurge(deps: CachePurgeDeps = defaultDeps): number {
  try {
    const entries = readEntries(deps);
    const keep: LedgerEntry[] = [];
    let purged = 0;
    for (const entry of entries) {
      if (entry.session === deps.session) {
        keep.push(entry);
        continue;
      }
      try {
        deps.remove(entry.uri);
        purged += 1;
      } catch {
        keep.push(entry); // réessai au prochain lancement
      }
    }
    if (entries.length > 0) writeEntries(keep, deps);
    return purged;
  } catch {
    return 0;
  }
}
