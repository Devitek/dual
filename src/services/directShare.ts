import { shareToApp, shareSystem } from '../native/videoPip';

export type ShareTarget = 'instagram' | 'tiktok';

/** Packages candidats par cible (le 1er installé est utilisé). */
const PACKAGES: Record<ShareTarget, string[]> = {
  instagram: ['com.instagram.android'],
  // TikTok global (musically) + variante certaines régions (trill).
  tiktok: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
};

/**
 * Partage DIRECT d'une capture vers Instagram / TikTok. Si l'app cible n'est pas
 * installée (ou module natif absent), repli transparent sur le partage système.
 */
export async function shareToSocial(
  target: ShareTarget,
  uri: string,
  kind: 'photo' | 'video',
): Promise<void> {
  const mime = kind === 'video' ? 'video/*' : 'image/*';
  const launched = await shareToApp(uri, mime, PACKAGES[target]);
  if (launched) return;
  // Cible non installée -> feuille de partage SYSTÈME native (fiable sur content://).
  await shareSystem(uri, mime);
}
