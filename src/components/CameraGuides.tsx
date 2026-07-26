import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';

interface CameraGuidesProps {
  /** Grille règle des tiers. */
  grid: boolean;
  /** Niveau (horizon) via accéléromètre. */
  level: boolean;
}

/** Seuil (degrés) sous lequel on considère l'appareil « à niveau » (ligne verte). */
const LEVEL_THRESHOLD = 1.5;
const LEVEL_GREEN = '#7DD98F';
const LINE = 'rgba(255,255,255,0.55)';

/**
 * Repères de composition superposés au viseur (non interactifs) :
 *  - grille règle des tiers (2 lignes verticales + 2 horizontales) ;
 *  - niveau : une ligne d'horizon qui s'incline avec l'appareil et passe au vert
 *    quand il est à niveau (best-effort ; ignoré si le capteur est indisponible).
 */
export function CameraGuides({ grid, level }: CameraGuidesProps): React.ReactElement | null {
  const [tilt, setTilt] = useState(0);

  useEffect(() => {
    if (!level) return;
    let sub: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(100);
      sub = Accelerometer.addListener(({ x, y }) => {
        // Angle du vecteur gravité dans le plan écran, normalisé en [-90, 90]
        // (0 = à niveau, quel que soit le signe de y selon l'appareil).
        let dev = Math.atan2(x, y) * (180 / Math.PI);
        if (dev > 90) dev -= 180;
        else if (dev < -90) dev += 180;
        setTilt(dev);
      });
    } catch {
      sub = null; // capteur indisponible -> pas de niveau
    }
    return () => {
      sub?.remove();
    };
  }, [level]);

  if (!grid && !level) return null;
  const isLevel = Math.abs(tilt) < LEVEL_THRESHOLD;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {grid && (
        <>
          <View style={[styles.vLine, { left: '33.333%' }]} />
          <View style={[styles.vLine, { left: '66.666%' }]} />
          <View style={[styles.hLine, { top: '33.333%' }]} />
          <View style={[styles.hLine, { top: '66.666%' }]} />
        </>
      )}
      {level && (
        <View style={styles.levelWrap}>
          <View
            style={[
              styles.levelLine,
              { transform: [{ rotate: `${-tilt}deg` }], backgroundColor: isLevel ? LEVEL_GREEN : 'rgba(255,255,255,0.85)' },
            ]}
          />
          {isLevel && <View style={styles.levelDot} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: LINE },
  hLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: LINE },
  levelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  levelLine: { width: 160, height: 2, borderRadius: 1 },
  levelDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: LEVEL_GREEN,
  },
});
