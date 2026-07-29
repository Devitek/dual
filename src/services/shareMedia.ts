import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { shareSystem } from '../native/videoPip';
import type { CapturedMedia } from '../vision/MultiCamController';

function extOf(uri: string, kind: CapturedMedia['kind']): string {
  const m = /\.([a-z0-9]{2,4})(?:\?.*)?$/i.exec(uri);
  const e = m?.[1];
  if (e) return e.toLowerCase();
  return kind === 'video' ? 'mp4' : 'jpg';
}

/** Enlève les caractères interdits/gênants dans un nom de fichier. */
function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|,]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Nom de partage LISIBLE + localisé, ex. « Boomerang - 29/07/2026 22:17:27.mp4 »
 * (date formatée selon la langue, caractères interdits nettoyés).
 */
export function buildShareName(item: CapturedMedia, label: string, locale: string): string {
  const d = new Date(item.createdAt);
  let date: string;
  try {
    date = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    date = d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return `${sanitize(label)} - ${sanitize(date)}.${extOf(item.primaryUri, item.kind)}`;
}

/**
 * Partage une capture avec un **nom de fichier lisible** : on copie le média dans
 * le cache sous ce nom puis on partage (feuille système via expo-sharing, qui
 * expose le nom du fichier). Repli sur le partage système natif (URI content://)
 * si la copie échoue.
 */
export async function shareCapture(item: CapturedMedia, label: string, locale: string): Promise<void> {
  const mime = item.kind === 'video' ? 'video/*' : 'image/*';
  try {
    const name = buildShareName(item, label, locale);
    const dest = `${FileSystem.cacheDirectory ?? ''}${name}`;
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({ from: item.primaryUri, to: dest });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest, {
        mimeType: item.kind === 'video' ? 'video/mp4' : 'image/jpeg',
      });
      return;
    }
  } catch {
    /* repli ci-dessous */
  }
  await shareSystem(item.primaryUri, mime);
}
