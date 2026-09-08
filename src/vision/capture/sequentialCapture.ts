// Capture PHOTO SÉQUENTIELLE (repli pour appareils sans concurrent-camera).
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import { VisionCamera, type FlashMode } from 'react-native-vision-camera';

import i18n from '../../i18n';

import type { CaptureContext } from './context';
import { enqueuePhotoSave } from './photoSave';
import { photoOptions } from './quality';

/**
 * Capture PHOTO SÉQUENTIELLE (repli pour appareils sans concurrent-camera) :
 * photo arrière depuis l'aperçu courant, puis bascule de session sur l'avant
 * (une seule caméra à la fois), puis composition PiP. L'aperçu arrière est
 * TOUJOURS restauré (try/finally). Si l'avant échoue, on garde l'arrière (mono).
 */
export async function captureSequentialPhoto(ctx: CaptureContext, flash: FlashMode): Promise<void> {
  const backPhoto = ctx.getBackPhoto();
  if (backPhoto == null || ctx.getSequentialFront() == null) return;
  if (ctx.getSnapshot().isBusy || ctx.getSnapshot().isRecording) return;

  const fast = ctx.getSnapshot().captureSpeed === 'speed' ? { enableVirtualDeviceFusion: false } : {};

  // Étape 1/2 : photo ARRIÈRE depuis la session d'aperçu déjà active.
  ctx.update({ isBusy: true, sequentialStep: 1 });
  let backPath: string;
  try {
    const backFile = await backPhoto.capturePhotoToFile(
      { flashMode: flash, enableShutterSound: ctx.getSnapshot().shutterSound, ...fast },
      {},
    );
    backPath = backFile.filePath;
  } catch (error) {
    ctx.notify('error', i18n.t('notices.captureFailed', { error: (error as Error)?.message ?? String(error) }));
    ctx.update({ isBusy: false, sequentialStep: 0 });
    return;
  }

  // Étape 2/2 : bascule sur l'AVANT (démonte l'arrière, monte l'avant).
  ctx.update({ sequentialStep: 2 });
  let frontPath: string | null = null;
  try {
    await ctx.teardownSession();
    frontPath = await captureFrontStillSequential(ctx);
  } catch (error) {
    if (__DEV__) console.warn('[multicam] sequential front capture failed', error);
    ctx.notify('error', i18n.t('sequential.frontFailed'));
  } finally {
    // Restaure l'aperçu ARRIÈRE quoi qu'il arrive (sauf si l'écran a été démonté).
    await ctx.teardownSession();
    await ctx.buildSession();
    ctx.update({ isBusy: false, sequentialStep: 0 });
  }

  // Mappe principale/secondaire selon le slot choisi, puis compose en tâche de fond.
  let primaryPath: string;
  let secondaryPath: string | null;
  if (frontPath == null) {
    primaryPath = backPath;
    secondaryPath = null;
  } else if (ctx.getPrimarySlot() === 'front') {
    primaryPath = frontPath;
    secondaryPath = backPath;
  } else {
    primaryPath = backPath;
    secondaryPath = frontPath;
  }
  enqueuePhotoSave(ctx, primaryPath, secondaryPath);
}

/**
 * Session AVANT éphémère (aperçu + photo) pour le 2ᵉ temps de la capture
 * séquentielle. Publie l'aperçu (rendu comme `backPreview`) pour que
 * l'utilisateur se cadre, laisse l'AF/AE se stabiliser, puis déclenche.
 * L'appelant démonte la session (finally).
 */
async function captureFrontStillSequential(ctx: CaptureContext): Promise<string | null> {
  const sequentialFront = ctx.getSequentialFront();
  if (sequentialFront == null) return null;
  const q = ctx.getQuality();
  const fast = ctx.getSnapshot().captureSpeed === 'speed' ? { enableVirtualDeviceFusion: false } : {};
  const session = await VisionCamera.createCameraSession(false);
  ctx.setSession(session);
  const preview = VisionCamera.createPreviewOutput();
  const frontPhoto = VisionCamera.createPhotoOutput(photoOptions(q.photoRes, ctx.getSnapshot().captureSpeed));
  ctx.setFrontPhoto(frontPhoto);
  const controllers = await session.configure([
    {
      input: sequentialFront,
      outputs: [
        { output: preview, mirrorMode: 'on' },
        { output: frontPhoto, mirrorMode: ctx.getSnapshot().mirrorFront ? 'on' : 'off' },
      ],
      constraints: [],
    },
  ]);
  ctx.setFrontController(controllers[0] ?? null);
  if (ctx.isDisposed()) {
    await session.stop();
    return null;
  }
  await session.start();
  // Aperçu AVANT visible pendant l'étape 2/2 (surface active + cadrage selfie).
  ctx.update({ backPreview: preview });
  await new Promise((resolve) => setTimeout(resolve, 350)); // stabilisation AF/AE
  const file = await frontPhoto.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false, ...fast }, {});
  return file.filePath;
}
