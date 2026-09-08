// Pipeline de sauvegarde PHOTO (composition + galerie) en tâche de fond.
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import { toFileUri } from '../../utils/fileSystem';
import i18n from '../../i18n';

import type { CaptureContext } from './context';

/**
 * Composition PiP + sauvegarde galerie d'une paire de clichés, en tâche de
 * fond. `secondaryPath` = null → sauvegarde mono. Partagé entre la capture
 * simultanée et la capture séquentielle.
 */
export function enqueuePhotoSave(ctx: CaptureContext, primaryPath: string, secondaryPath: string | null): void {
  const snapshot = ctx.getSnapshot();
  const mode = snapshot.photoSaveMode;
  const corner = snapshot.pipCorner;
  const canvasWidth = ctx.getQuality().pipCanvas;
  const wantPip = mode !== 'originals';
  const layout = snapshot.layout;
  // Géotag : résolu MAINTENANT (position en cache). Force le chemin JS (le natif
  // sauvegarde en interne, on ne pourrait pas y injecter l'EXIF GPS).
  const geotag = snapshot.geotag;
  const coords = geotag ? (ctx.getLocationProvider()?.() ?? null) : null;
  const pipInset = snapshot.pipInset;
  const watermark = snapshot.watermark;
  const outputRatio = snapshot.outputRatio;
  ctx.enqueue(async () => {
    // Chemin NATIF (Foreground Service, survit au kill) — prioritaire. Il gère
    // désormais TOUTES les dispositions + vignette libre + filigrane (Lot 4a).
    // Seul le géotag force le chemin JS (le natif sauvegarde en interne, on ne
    // peut pas y injecter l'EXIF GPS).
    const photoComposer = ctx.getPhotoComposer();
    if (wantPip && secondaryPath != null && photoComposer != null && coords == null) {
      const saveOriginals = mode === 'pip_plus_originals';
      const savedUri = await photoComposer(toFileUri(primaryPath), toFileUri(secondaryPath), {
        layout,
        corner,
        inset: pipInset,
        watermark,
        canvasWidth,
        outputRatio,
        saveOriginals,
      });
      ctx.pushCapture({
        kind: 'photo',
        primaryUri: savedUri,
        secondaryUri: saveOriginals ? toFileUri(secondaryPath) : null,
        createdAt: Date.now(),
      });
      ctx.notify('success', i18n.t('notices.photoSaved'));
      return;
    }

    // Repli view-shot (in-process) / originaux.
    const pipComposer = ctx.getPipComposer();
    const canPipJs = secondaryPath != null && pipComposer != null;
    const wantOriginals = mode === 'originals' || mode === 'pip_plus_originals' || (wantPip && !canPipJs);
    let pipUri: string | null = null;
    if (wantPip && canPipJs) {
      const composedPath = await pipComposer!(toFileUri(primaryPath), toFileUri(secondaryPath!));
      await ctx.stampGps(toFileUri(composedPath), coords);
      pipUri = await ctx.persist(composedPath);
    }
    let originalPrimaryUri: string | null = null;
    if (wantOriginals) {
      await ctx.stampGps(toFileUri(primaryPath), coords);
      originalPrimaryUri = await ctx.persist(primaryPath);
      if (secondaryPath != null) {
        await ctx.stampGps(toFileUri(secondaryPath), coords);
        await ctx.persist(secondaryPath);
      }
    }
    const displayUri = pipUri ?? originalPrimaryUri ?? toFileUri(primaryPath);
    const secondaryUri = secondaryPath != null ? toFileUri(secondaryPath) : null;
    ctx.pushCapture({ kind: 'photo', primaryUri: displayUri, secondaryUri, createdAt: Date.now() });
    ctx.notify('success', i18n.t('notices.photoSaved'));
  });
}
