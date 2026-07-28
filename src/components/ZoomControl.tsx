import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '../utils/haptics';

interface ZoomControlProps {
  min: number;
  max: number;
  /** Paliers « objectif » (accroche), ex. [0.5, 1, 2, 5, 10, 30]. */
  presets: number[];
  /** Zoom courant (pilote la position ; synchronisé au pincement). */
  value: number;
  /** Zoom demandé (continu). */
  onZoom: (zoom: number) => void;
}

const WIDTH = 280;
const MINOR_TICKS = 31;
/** Délai d'auto-repli après la dernière interaction. */
const COLLAPSE_MS = 1600;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function fmt(z: number): string {
  const r = Math.round(z * 10) / 10;
  return Number.isInteger(r) ? `${r}×` : `${r.toFixed(1)}×`;
}
function chipLabel(z: number): string {
  return z < 1 ? `.${String(z).slice(2)}` : String(z);
}

/**
 * Contrôle de zoom façon appareil photo, animé, à deux états :
 *  - **replié** : pilule de chips espacés (le plus proche = cercle blanc montrant
 *    la valeur courante) ; tap = accroche sur le palier.
 *  - **déplié** (au glissement) : ruler à graduations, labels majeurs en échelle
 *    LOG, curseur + bulle de valeur qui suit le doigt ; accroche magnétique +
 *    tick haptique. Auto-repli après inactivité.
 */
export function ZoomControl({ min, max, presets, value, onZoom }: ZoomControlProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const expand = useRef(new Animated.Value(0)).current;
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnap = useRef<number | null>(null);

  // Config lue par le PanResponder (créé une fois) via ref -> pas de closure périmée.
  const cfg = useRef({ min, max, presets, onZoom });
  cfg.current = { min, max, presets, onZoom };

  const logRange = Math.log(max) - Math.log(min);
  const pOf = (z: number): number => (logRange > 0 ? clamp((Math.log(clamp(z, min, max)) - Math.log(min)) / logRange, 0, 1) : 0);

  const animateExpand = (to: number): void => {
    Animated.timing(expand, { toValue: to, duration: 200, useNativeDriver: true }).start();
  };
  const scheduleCollapse = (): void => {
    if (collapseTimer.current != null) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      setExpanded(false);
      animateExpand(0);
    }, COLLAPSE_MS);
  };
  const openExpanded = (): void => {
    if (collapseTimer.current != null) clearTimeout(collapseTimer.current);
    setExpanded(true);
    animateExpand(1);
  };

  useEffect(
    () => () => {
      if (collapseTimer.current != null) clearTimeout(collapseTimer.current);
    },
    [],
  );

  const setFromX = (x: number): void => {
    const c = cfg.current;
    const range = Math.log(c.max) - Math.log(c.min);
    if (range <= 0) return;
    const p = clamp(x / WIDTH, 0, 1);
    let z = Math.exp(Math.log(c.min) + p * range);
    // Accroche magnétique proche d'un palier.
    let snapped: number | null = null;
    for (const preset of c.presets) {
      const pp = clamp((Math.log(clamp(preset, c.min, c.max)) - Math.log(c.min)) / range, 0, 1);
      if (Math.abs(pp - p) < 0.04) {
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
      // Laisse les taps aux chips ; ne capte QUE le glissement horizontal.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => openExpanded(),
      onPanResponderMove: (e) => {
        openExpanded();
        setFromX(e.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        lastSnap.current = null;
        scheduleCollapse();
      },
      onPanResponderTerminate: () => {
        lastSnap.current = null;
        scheduleCollapse();
      },
    }),
  ).current;

  if (presets.length < 2 || max <= min) return null;

  // Chip la plus proche de la valeur (affiche la valeur exacte en actif).
  let activeIdx = 0;
  let best = Infinity;
  presets.forEach((pr, i) => {
    const d = Math.abs(pOf(pr) - pOf(value));
    if (d < best) {
      best = d;
      activeIdx = i;
    }
  });

  const tapChip = (z: number): void => {
    haptics.selection();
    onZoom(z);
  };

  const collapsedOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const thumbX = pOf(value) * WIDTH;

  return (
    <View style={styles.wrap}>
      {/* Bulle de valeur (dépliée) qui suit le curseur. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.bubble, { opacity: expand, transform: [{ translateX: clamp(thumbX - 22, 0, WIDTH - 44) }] }]}
      >
        <Text style={styles.bubbleText}>{fmt(value)}</Text>
      </Animated.View>

      <View style={styles.pill} {...pan.panHandlers}>
        {/* Couche REPLIÉE : chips espacés. */}
        <Animated.View style={[styles.layer, styles.chips, { opacity: collapsedOpacity }]} pointerEvents={expanded ? 'none' : 'auto'}>
          {presets.map((pr, i) => {
            const active = i === activeIdx;
            return (
              <Pressable key={pr} onPress={() => tapChip(pr)} style={styles.chipHit} accessibilityRole="button">
                {active ? (
                  <View style={styles.activeChip}>
                    <Text style={styles.activeText}>{fmt(value)}</Text>
                  </View>
                ) : (
                  <Text style={styles.chipText}>{chipLabel(pr)}</Text>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Couche DÉPLIÉE : ruler (graduations + labels log + curseur). */}
        <Animated.View style={[styles.layer, { opacity: expand }]} pointerEvents="none">
          {Array.from({ length: MINOR_TICKS }).map((_, i) => (
            <View key={i} style={[styles.minorTick, { left: (i / (MINOR_TICKS - 1)) * WIDTH }]} />
          ))}
          {presets.map((pr) => (
            <Text key={pr} style={[styles.rulerLabel, { left: clamp(pOf(pr) * WIDTH - 16, 2, WIDTH - 34) }]}>
              {chipLabel(pr)}
            </Text>
          ))}
          <View style={[styles.thumb, { left: thumbX - 1.5 }]} />
        </Animated.View>
      </View>
    </View>
  );
}

const PILL_H = 44;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: WIDTH },
  bubble: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    width: 44,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  bubbleText: { color: '#fff', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pill: {
    width: WIDTH,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', paddingHorizontal: 6 },
  chipHit: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  chipText: { color: 'rgba(255,255,255,0.72)', fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  activeChip: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 6,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeText: { color: '#111', fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  minorTick: {
    position: 'absolute',
    top: 8,
    width: StyleSheet.hairlineWidth,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  rulerLabel: {
    position: 'absolute',
    bottom: 5,
    width: 32,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 3,
    height: 20,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
});
