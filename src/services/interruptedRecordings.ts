// Récupération des enregistrements vidéo restés dans le cache.
//
// VisionCamera écrit chaque flux dans `cacheDir/VisionCamera_<n>.mp4`
// (File.createTempFile). Si la composition PiP n'a jamais abouti (app quittée
// pendant l'enregistrement sur une version antérieure au correctif, process tué
// avant la composition...), ces fichiers restent dans le cache sans jamais
// atteindre la galerie. Ce service les retrouve et les enregistre dans la galerie
// à la demande de l'utilisateur, puis libère le cache.
//
// Les fichiers de la session en cours sont exclus : la galerie de session peut
// encore les référencer, et un enregistrement en attente de composition aussi.
import { Directory, File, Paths } from 'expo-file-system';
import { saveToLibraryAsync } from 'expo-media-library/legacy';

import { getSessionStartedAt } from '../utils/sessionStart';

const RAW_RECORDING_PATTERN = /^VisionCamera_.*\.mp4$/i;

export interface InterruptedRecording {
  uri: string;
  name: string;
  size: number;
  /** Date de dernière modification (ms epoch), ou null si inconnue. */
  modifiedAt: number | null;
}

export interface RecoveryResult {
  saved: number;
  failed: number;
}

/** Dépendances injectables (tests). */
export interface RecoveryDeps {
  listCache: () => (Directory | File)[];
  save: (uri: string) => Promise<void>;
  /** Début de la session en cours (repère posé au démarrage), ou null s'il manque. */
  sessionStartedAt: number | null;
}

const defaultDeps = (): RecoveryDeps => ({
  listCache: () => Paths.cache.list(),
  save: (uri) => saveToLibraryAsync(uri),
  sessionStartedAt: getSessionStartedAt(),
});

/**
 * Liste les enregistrements bruts laissés dans le cache par une session
 * précédente (fichiers non vides, plus anciens que la session en cours).
 * Ne lève jamais : renvoie une liste vide en cas d'erreur d'accès au cache.
 * Sans repère de session, renvoie une liste vide : impossible de distinguer
 * les fichiers de la session en cours, on ne touche à rien.
 */
export function findInterruptedRecordings(deps: RecoveryDeps = defaultDeps()): InterruptedRecording[] {
  const { sessionStartedAt } = deps;
  if (sessionStartedAt == null) return [];
  let entries: (Directory | File)[];
  try {
    entries = deps.listCache();
  } catch {
    return [];
  }
  const found: InterruptedRecording[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File) || !RAW_RECORDING_PATTERN.test(entry.name)) continue;
    try {
      const size = entry.size ?? 0;
      const modifiedAt = entry.modificationTime ?? null;
      if (size <= 0) continue;
      if (modifiedAt != null && modifiedAt >= sessionStartedAt) continue;
      found.push({ uri: entry.uri, name: entry.name, size, modifiedAt });
    } catch {
      // Fichier disparu entre le listing et la lecture : on l'ignore.
    }
  }
  return found.sort((a, b) => (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0));
}

/**
 * Enregistre chaque fichier dans la galerie (MediaStore, écriture seule), puis
 * le supprime du cache. Un fichier dont la sauvegarde échoue reste en place
 * pour une nouvelle tentative.
 */
export async function recoverInterruptedRecordings(
  recordings: InterruptedRecording[],
  deps: Pick<RecoveryDeps, 'save'> = defaultDeps(),
): Promise<RecoveryResult> {
  const result: RecoveryResult = { saved: 0, failed: 0 };
  for (const recording of recordings) {
    try {
      await deps.save(recording.uri);
    } catch {
      result.failed += 1;
      continue;
    }
    result.saved += 1;
    try {
      new File(recording.uri).delete();
    } catch {
      // Sauvegardé mais pas supprimé : il réapparaîtra (doublon possible), sans perte.
    }
  }
  return result;
}
