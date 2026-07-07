import { File } from 'expo-file-system';

/**
 * VisionCamera renvoie des chemins natifs bruts (`/data/user/...`, `/var/...`).
 * expo-media-library et expo-file-system attendent un URI `file://`.
 */
export function toFileUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

/**
 * Retourne la taille du fichier en octets, ou `null` si indéterminable.
 * Utilisé à des fins de diagnostic / vérification avant sauvegarde.
 *
 * ⚠️ API expo-file-system SDK 54+ : on utilise la classe `File` (synchrone).
 * L'ancienne API `getInfoAsync` est désormais sous `expo-file-system/legacy`.
 */
export function getFileSize(uri: string): number | null {
  try {
    const file = new File(uri);
    return file.exists ? file.size : null;
  } catch {
    return null;
  }
}

/** Formate un nombre d'octets en chaîne lisible (Ko / Mo). */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
