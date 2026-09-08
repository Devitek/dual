// Enregistrement VIDÉO double (recorders back/front) et finalisation
// (composition PiP + sauvegarde en tâche de fond).
// Code extrait de MultiCamController.ts (issue #148, étape C) : déplacement pur,
// aucune modification de logique.
import { toFileUri } from '../../utils/fileSystem';
import i18n from '../../i18n';
import type { CameraSlot } from '../types';

import type { CaptureContext } from './context';

function commitRecordingIfDone(ctx: CaptureContext): void {
  const recAgg = ctx.getRecAgg();
  if (recAgg.settled < recAgg.expected) return;
  // Rendre la main tout de suite (arrêt effectif) ...
  ctx.update({ isRecording: false, isBusy: false });
  const recorders = ctx.getRecorders();
  recorders.back = null;
  recorders.front = null;

  const primaryPath = ctx.getPrimarySlot() === 'back' ? recAgg.backPath : recAgg.frontPath;
  const secondaryPath = ctx.getPrimarySlot() === 'back' ? recAgg.frontPath : recAgg.backPath;
  if (primaryPath == null) {
    ctx.notify('error', i18n.t('notices.noVideo'));
    return;
  }

  // ... puis composition (si un composeur vidéo est branché) + sauvegarde EN TÂCHE DE FOND.
  const snapshot = ctx.getSnapshot();
  const mode = snapshot.videoSaveMode;
  const corner = snapshot.pipCorner;
  const layout = snapshot.layout;
  const inset = snapshot.pipInset;
  const watermark = snapshot.watermark;
  const outputRatio = snapshot.outputRatio;
  const boomerang = ctx.getBoomerangMode();
  const boomerangGif = snapshot.boomerangGif;
  const bitRate = ctx.getQuality().videoBitrate;
  const wantPip = mode !== 'originals';
  const canPip = secondaryPath != null && ctx.getVideoComposer() != null;
  // Durée estimée : figée MAINTENANT (avant la composition, qui peut être longue).
  const durationMs = ctx.getRecStartedAt() > 0 ? Date.now() - ctx.getRecStartedAt() : undefined;
  ctx.enqueue(async () => {
    if (wantPip && canPip) {
      const saveOriginals = mode === 'pip_plus_originals';
      // Le composeur natif compose ET sauvegarde (Foreground Service) : URI galerie.
      // Le natif gère les dispositions (pip / côte-à-côte / haut-bas) + vignette libre.
      const savedPipUri = await ctx.getVideoComposer()!(toFileUri(primaryPath), toFileUri(secondaryPath!), {
        layout,
        corner,
        inset,
        watermark,
        bitRate,
        outputRatio,
        boomerang,
        boomerangGif,
        saveOriginals,
      });
      ctx.pushCapture({
        kind: 'video',
        primaryUri: savedPipUri,
        secondaryUri: saveOriginals ? toFileUri(secondaryPath!) : null,
        createdAt: Date.now(),
        durationMs,
        boomerang,
      });
      ctx.notify('success', i18n.t(boomerang ? 'notices.boomerangSaved' : 'notices.videoSaved'));
    } else {
      // Mode originaux, ou pas de composeur natif -> sauvegarde JS des originaux.
      const primaryUri = await ctx.persist(primaryPath);
      const secondaryUri = secondaryPath != null ? await ctx.persist(secondaryPath) : null;
      ctx.pushCapture({ kind: 'video', primaryUri, secondaryUri, createdAt: Date.now(), durationMs });
      ctx.notify('success', i18n.t(boomerang ? 'notices.boomerangSaved' : 'notices.videoSaved'));
    }
  });
}

function makeRecordingCallbacks(ctx: CaptureContext, slot: CameraSlot) {
  const onFinished = (filePath: string): void => {
    const recAgg = ctx.getRecAgg();
    if (slot === 'back') recAgg.backPath = filePath;
    else recAgg.frontPath = filePath;
    recAgg.settled += 1;
    commitRecordingIfDone(ctx);
  };
  const onError = (error: Error): void => {
    ctx.getRecAgg().settled += 1;
    ctx.notify('error', i18n.t('notices.recError', { slot, error: error.message }));
    commitRecordingIfDone(ctx);
  };
  return { onFinished, onError };
}

export async function startRecording(ctx: CaptureContext): Promise<void> {
  // Vidéo bloquée sur les appareils sans concurrent-camera (pas de flux
  // simultané → une vidéo « double » séquentielle ne serait pas simultanée).
  if (ctx.getSnapshot().mode === 'sequential') {
    ctx.notify('error', i18n.t('sequential.videoBlocked'));
    return;
  }
  const backVideo = ctx.getBackVideo();
  if (backVideo == null || ctx.getSnapshot().isRecording || ctx.getSnapshot().isBusy) return;
  ctx.setRecAgg({ expected: ctx.getFrontVideo() != null ? 2 : 1, settled: 0, backPath: null, frontPath: null });
  ctx.setRecStartedAt(Date.now());
  ctx.update({ isRecording: true });
  try {
    const recorders = ctx.getRecorders();
    const backRecorder = await backVideo.createRecorder({});
    recorders.back = backRecorder;
    const back = makeRecordingCallbacks(ctx, 'back');
    await backRecorder.startRecording(back.onFinished, back.onError);

    const frontVideo = ctx.getFrontVideo();
    if (frontVideo != null) {
      const frontRecorder = await frontVideo.createRecorder({});
      recorders.front = frontRecorder;
      const front = makeRecordingCallbacks(ctx, 'front');
      await frontRecorder.startRecording(front.onFinished, front.onError);
    }
  } catch (error) {
    ctx.update({ isRecording: false, errorMessage: (error as Error)?.message ?? 'Démarrage vidéo échoué' });
  }
}

export async function stopRecording(ctx: CaptureContext): Promise<void> {
  if (!ctx.getSnapshot().isRecording) return;
  ctx.update({ isBusy: true });
  try {
    await ctx.getRecorders().back?.stopRecording();
    await ctx.getRecorders().front?.stopRecording();
  } catch {
    /* les callbacks onFinished finaliseront */
  }
}
