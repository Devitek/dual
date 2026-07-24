import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { useThemedStyles, type Palette } from '../theme/theme';
import { DEFAULT_PIP_LAYOUT, type CompositionLayout, type PipCorner } from '../services/pipComposer';

export interface PipCompositorHandle {
  /** Compose la version PiP (principale + vignette) et renvoie l'URI du JPEG. */
  compose: (primaryUri: string, secondaryUri: string) => Promise<string>;
}

interface Pending {
  resolve: (uri: string) => void;
  reject: (error: unknown) => void;
  loaded: number;
  timer: ReturnType<typeof setTimeout>;
}

/** Style de position de la vignette dans le canvas selon le coin choisi. */
function insetPositionStyle(corner: PipCorner, insetW: number, insetH: number, margin: number): ImageStyle {
  const isTop = corner === 'top-left' || corner === 'top-right';
  const isLeft = corner === 'top-left' || corner === 'bottom-left';
  return {
    width: insetW,
    height: insetH,
    ...(isTop ? { top: margin } : { bottom: margin }),
    ...(isLeft ? { left: margin } : { right: margin }),
  };
}

/**
 * Surface de composition PiP rendue HORS-ÉCRAN. On y charge les deux photos,
 * puis on capture le tout en un seul JPEG via react-native-view-shot.
 * Piloté impérativement (`ref.compose(...)`) par le MultiCamController.
 *
 * ⚠️ Le conteneur ne doit PAS avoir d'`opacity < 1` : sur Android, capturer une
 * vue sous un parent semi-transparent délave les couleurs du rendu.
 */
/** Dimensions du canvas de composition selon la disposition (base = canvasWidth). */
function canvasSize(layout: CompositionLayout, cw: number): { w: number; h: number } {
  switch (layout) {
    case 'sideBySide':
      return { w: cw, h: Math.round((cw * 2) / 3) }; // 2 moitiés portrait -> paysage 3:2
    case 'topBottom':
      return { w: cw, h: Math.round((cw * 3) / 2) }; // 2 moitiés paysage -> portrait 2:3
    case 'pip':
    default:
      return { w: cw, h: Math.round((cw * 4) / 3) }; // portrait 3:4
  }
}

export const PipCompositor = forwardRef<
  PipCompositorHandle,
  { corner: PipCorner; canvasWidth: number; layout: CompositionLayout }
>(function PipCompositor({ corner, canvasWidth, layout }, ref) {
    const shotRef = useRef<ViewShotRef>(null);
    const [job, setJob] = useState<{ primary: string; secondary: string; id: number } | null>(null);
    const pending = useRef<Pending | null>(null);
    const styles = useThemedStyles(makeStyles);

    useImperativeHandle(
      ref,
      () => ({
        compose: (primary, secondary) =>
          new Promise<string>((resolve, reject) => {
            if (pending.current != null) {
              clearTimeout(pending.current.timer);
              pending.current.reject(new Error('Composition annulée'));
            }
            const timer = setTimeout(() => {
              if (pending.current != null) {
                pending.current.reject(new Error('Composition PiP : délai dépassé'));
                pending.current = null;
                setJob(null);
              }
            }, 5000);
            pending.current = { resolve, reject, loaded: 0, timer };
            setJob({ primary, secondary, id: Date.now() });
          }),
      }),
      [],
    );

    const onImageSettled = (): void => {
      const p = pending.current;
      if (p == null) return;
      p.loaded += 1;
      if (p.loaded < 2) return;
      requestAnimationFrame(() => {
        void (async () => {
          const cur = pending.current;
          if (cur == null) return;
          try {
            const uri = await shotRef.current?.capture?.();
            clearTimeout(cur.timer);
            if (uri == null) cur.reject(new Error('Capture PiP vide'));
            else cur.resolve(uri);
          } catch (error) {
            clearTimeout(cur.timer);
            cur.reject(error);
          } finally {
            pending.current = null;
            setJob(null);
          }
        })();
      });
    };

    const { w: canvasW, h: canvasH } = canvasSize(layout, canvasWidth);
    const insetW = canvasW * DEFAULT_PIP_LAYOUT.insetWidthRatio;
    const insetH = insetW * (canvasH / canvasW);
    const margin = canvasW * DEFAULT_PIP_LAYOUT.marginRatio;

    return (
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot
          ref={shotRef}
        options={{ format: 'jpg', quality: 0.98, width: canvasW, height: canvasH }}
        style={[styles.canvas, { width: canvasW, height: canvasH }]}
        >
          {job != null && layout === 'pip' && (
            <>
              <Image
                source={{ uri: job.primary }}
                style={styles.fill}
                resizeMode="cover"
                fadeDuration={0}
                onLoad={onImageSettled}
                onError={onImageSettled}
              />
              <Image
                source={{ uri: job.secondary }}
                resizeMode="cover"
                fadeDuration={0}
                onLoad={onImageSettled}
                onError={onImageSettled}
                style={[styles.inset, insetPositionStyle(corner, insetW, insetH, margin)]}
              />
            </>
          )}
          {job != null && layout !== 'pip' && (
            <View style={[styles.split, { flexDirection: layout === 'sideBySide' ? 'row' : 'column' }]}>
              <Image
                source={{ uri: job.primary }}
                style={styles.half}
                resizeMode="cover"
                fadeDuration={0}
                onLoad={onImageSettled}
                onError={onImageSettled}
              />
              <Image
                source={{ uri: job.secondary }}
                style={styles.half}
                resizeMode="cover"
                fadeDuration={0}
                onLoad={onImageSettled}
                onError={onImageSettled}
              />
            </View>
          )}
        </ViewShot>
      </View>
    );
  },
);

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Hors-écran via un décalage, SANS opacity (sinon couleurs délavées à la capture).
  offscreen: { position: 'absolute', left: -5000, top: 0 },
  canvas: { backgroundColor: colors.background },
  fill: { width: '100%', height: '100%' },
  inset: { position: 'absolute', borderRadius: 24, borderWidth: 6, borderColor: '#FFFFFF' },
  split: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  half: { flex: 1 },
});
