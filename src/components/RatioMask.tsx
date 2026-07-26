import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { pipRatioFactor, type OutputRatio } from '../services/pipComposer';

/**
 * Repère de cadrage (best-effort) pour le ratio de sortie de la disposition `pip` :
 * assombrit les zones hors du cadre conservé (centré) et trace un liseré. Non
 * interactif ; masqué pour `full` (plein capteur). La composition recadre au
 * centre, donc ce repère centré reflète ce qui sera gardé.
 */
export function RatioMask({ ratio }: { ratio: OutputRatio }): React.ReactElement | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  if (ratio === 'full') return null;

  const targetWH = 1 / pipRatioFactor(ratio); // largeur/hauteur du cadre voulu
  let bars: React.ReactNode = null;
  let frame: React.ReactNode = null;

  if (size != null && size.w > 0 && size.h > 0) {
    const contWH = size.w / size.h;
    let fw: number;
    let fh: number;
    if (targetWH < contWH) {
      fh = size.h;
      fw = size.h * targetWH;
    } else {
      fw = size.w;
      fh = size.w / targetWH;
    }
    const bx = (size.w - fw) / 2;
    const by = (size.h - fh) / 2;

    bars =
      targetWH < contWH ? (
        <>
          <View style={[styles.dim, { left: 0, top: 0, bottom: 0, width: bx }]} />
          <View style={[styles.dim, { right: 0, top: 0, bottom: 0, width: bx }]} />
        </>
      ) : (
        <>
          <View style={[styles.dim, { left: 0, right: 0, top: 0, height: by }]} />
          <View style={[styles.dim, { left: 0, right: 0, bottom: 0, height: by }]} />
        </>
      );
    frame = <View style={[styles.frame, { left: bx, top: by, width: fw, height: fh }]} />;
  }

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev?.w === width && prev?.h === height ? prev : { w: width, h: height }));
      }}
    >
      {bars}
      {frame}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.45)' },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
});
