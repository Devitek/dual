// Pipeline de sauvegarde PHOTO (composition + galerie) en tâche de fond.
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import { toFileUri } from '../../utils/fileSystem';
import { writeOrientationToJpeg } from '../../services/exifGps';
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
  // Orientation physique à la capture (#174) : on NE recadre pas, on grave juste
  // un tag EXIF sur le rendu (et les originaux) pour un affichage paysage.
  const orientation = ctx.getCaptureExifOrientation();
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
        orientation,
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
    // Grave le tag EXIF d'orientation (#174), best-effort (ne bloque pas la sauvegarde).
    const stampOrientation = async (fileUri: string): Promise<void> => {
      try {
        await writeOrientationToJpeg(fileUri, orientation);
      } catch {
        /* best-effort : l'absence de tag ne doit pas faire échouer la capture */
      }
    };
    let pipUri: string | null = null;
    if (wantPip && canPipJs) {
      const composedPath = await pipComposer!(toFileUri(primaryPath), toFileUri(secondaryPath!));
      await ctx.stampGps(toFileUri(composedPath), coords);
      await stampOrientation(toFileUri(composedPath));
      pipUri = await ctx.persist(composedPath);
    }
    let originalPrimaryUri: string | null = null;
    if (wantOriginals) {
      await ctx.stampGps(toFileUri(primaryPath), coords);
      await stampOrientation(toFileUri(primaryPath));
      originalPrimaryUri = await ctx.persist(primaryPath);
      if (secondaryPath != null) {
        await ctx.stampGps(toFileUri(secondaryPath), coords);
        await stampOrientation(toFileUri(secondaryPath));
        await ctx.persist(secondaryPath);
      }
    }
    const displayUri = pipUri ?? originalPrimaryUri ?? toFileUri(primaryPath);
    const secondaryUri = secondaryPath != null ? toFileUri(secondaryPath) : null;
    ctx.pushCapture({ kind: 'photo', primaryUri: displayUri, secondaryUri, createdAt: Date.now() });
    ctx.notify('success', i18n.t('notices.photoSaved'));
  });
}
