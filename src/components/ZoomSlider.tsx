import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { haptics } from '../utils/haptics';

interface ZoomSliderProps {
  /** Bornes de zoom du device. */
  min: number;
  max: number;
  /** Paliers « objectif » (points d'accroche magnétiques), ex. [0.5,1,2,5,10]. */
  presets: number[];
  /** Zoom courant (pilote la position du curseur ; synchronisé au pincement). */
  value: number;
  /** Zoom demandé (continu, pendant le glissement ou au tap d'un palier). */
  onZoom: (zoom: number) => void;
}

/** Zone d'accroche magnétique autour d'un palier, en fraction de la barre. */
const SNAP_EPS = 0.045;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 1 -> "1×", 0.5 -> "0.5×", 1.8 -> "1.8×". */
function fmtValue(z: number): string {
  const r = Math.round(z * 10) / 10;
  return Number.isInteger(r) ? `${r}×` : `${r.toFixed(1)}×`;
}

/** Étiquette compacte de palier : 0.5 -> ".5", 2 -> "2", 10 -> "10". */
function tickLabel(z: number): string {
  return z < 1 ? `.${String(z).slice(2)}` : String(z);
}

/**
 * Barre de zoom façon appareil photo : paliers « objectif » (tap = accroche),
 * et surtout **glissement continu** en échelle LOG avec **accroche magnétique**
 * (+ tick haptique) sur les paliers. Le palier actif s'affiche en `N×` ; entre
 * deux, la valeur exacte suit le curseur. Synchronisée avec le pincement.
 */
export function ZoomSlider({ min, max, presets, value, onZoom }: ZoomSliderProps): React.ReactElement | null {
  const [width, setWidth] = useState(0);

  // Config lue par le PanResponder (créé une seule fois) via une ref, pour éviter
  // les closures périmées quand les bornes / la largeur changent.
  const cfg = useRef({ width: 0, min, max, presets, onZoom });
  cfg.current.min = min;
  cfg.current.max = max;
  cfg.current.presets = presets;
  cfg.current.onZoom = onZoom;

  const lastSnap = useRef<number | null>(null);

  const pOf = (z: number, mn: number, mx: number): number => {
    const range = Math.log(mx) - Math.log(mn);
    return range > 0 ? clamp((Math.log(clamp(z, mn, mx)) - Math.log(mn)) / range, 0, 1) : 0;
  };
  const zOf = (p: number, mn: number, mx: number): number => {
    const range = Math.log(mx) - Math.log(mn);
    return Math.exp(Math.log(mn) + clamp(p, 0, 1) * range);
  };

  const setFromX = (x: number): void => {
    const c = cfg.current;
    if (c.width <= 0) return;
    const p = clamp(x / c.width, 0, 1);
    let z = zOf(p, c.min, c.max);
    // Accroche magnétique : si le curseur est proche d'un palier, on colle dessus.
    let snapped: number | null = null;
    for (const preset of c.presets) {
      if (Math.abs(pOf(preset, c.min, c.max) - p) < SNAP_EPS) {
        z = preset;
        snapped = preset;
        break;
      }
    }
    if (snapped != null && snapped !== lastSnap.current) haptics.selection();
    lastSnap.current = snapped;
    c.onZoom(z);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        lastSnap.current = null;
      },
      onPanResponderTerminate: () => {
        lastSnap.current = null;
      },
    }),
  ).current;

  if (presets.length < 2 || max <= min) return null;

  // Palier « actif » = celui dont on est très proche (sinon on est entre deux).
  const activePreset = presets.find((pr) => Math.abs(pr - value) / value < 0.06);

  return (
    <View style={styles.wrap}>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{fmtValue(value)}</Text>
      </View>

      <View
        style={styles.track}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          cfg.current.width = w;
          setWidth(w);
        }}
        {...pan.panHandlers}
      >
        {width > 0 &&
          presets.map((pr) => {
            const active = pr === activePreset;
            const left = pOf(pr, min, max) * width;
            return (
              <View key={pr} style={[styles.tick, { left: left - 16 }]}>
                {active ? (
                  <View style={styles.activePill}>
                    <Text style={styles.activeText}>{fmtValue(pr)}</Text>
                  </View>
                ) : (
                  <Text style={styles.tickText}>{tickLabel(pr)}</Text>
                )}
              </View>
            );
          })}
      </View>
    </View>
  );
}

const TRACK_H = 34;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    marginBottom: 6,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  bubbleText: { color: '#fff', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: {
    width: 260,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  activePill: {
    minWidth: 32,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeText: { color: '#fff', fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
