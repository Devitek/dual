// Capture PHOTO multi-cam (simultanée avant+arrière), avec repli séquentiel.
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import type { FlashMode } from 'react-native-vision-camera';

import i18n from '../../i18n';

import type { CaptureContext } from './context';
import { enqueuePhotoSave } from './photoSave';
import { captureSequentialPhoto } from './sequentialCapture';

export async function capturePhoto(ctx: CaptureContext, flash: FlashMode): Promise<void> {
  if (ctx.getSnapshot().isBusy || ctx.getSnapshot().isRecording) return;
  // Appareils sans concurrent-camera : capture PHOTO en deux temps.
  if (ctx.getSnapshot().mode === 'sequential') {
    await captureSequentialPhoto(ctx, flash);
    return;
  }
  const backPhoto = ctx.getBackPhoto();
  if (backPhoto == null) return;
  ctx.update({ isBusy: true });

  // 1) Capture BRUTE des deux photos EN PARALLÈLE — seule partie qui bloque
  //    l'obturateur (les capteurs doivent avoir figé l'image).
  let primaryPath: string;
  let secondaryPath: string | null = null;
  try {
    const frontPhoto = ctx.getFrontPhoto();
    const primaryOutput = ctx.getPrimarySlot() === 'back' ? backPhoto : (frontPhoto ?? backPhoto);
    const secondaryOutput = ctx.getPrimarySlot() === 'back' ? frontPhoto : backPhoto;
    // En mode « rapide », on coupe la fusion multi-frames : moins de latence et
    // moins de « fantômes » sur un sujet qui bouge (levier anti-flou direct).
    const fast = ctx.getSnapshot().captureSpeed === 'speed' ? { enableVirtualDeviceFusion: false } : {};
    // Son d'obturateur : uniquement sur la principale (jamais de double clic),
    // et selon le réglage utilisateur.
    const [primaryFile, secondaryFile] = await Promise.all([
      primaryOutput.capturePhotoToFile(
        { flashMode: flash, enableShutterSound: ctx.getSnapshot().shutterSound, ...fast },
        {},
      ),
      secondaryOutput != null
        ? secondaryOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false, ...fast }, {})
        : Promise.resolve(null),
    ]);
    primaryPath = primaryFile.filePath;
    secondaryPath = secondaryFile?.filePath ?? null;
  } catch (error) {
    ctx.notify('error', i18n.t('notices.captureFailed', { error: (error as Error)?.message ?? String(error) }));
    ctx.update({ isBusy: false });
    return;
  }

  // 2) Obturateur de nouveau disponible IMMÉDIATEMENT. Composition PiP +
  //    sauvegarde galerie partent en tâche de fond (UI réactive).
  ctx.update({ isBusy: false });
  enqueuePhotoSave(ctx, primaryPath, secondaryPath);
}
