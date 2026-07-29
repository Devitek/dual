import React, { useEffect, useMemo, useRef, useState } from 'react';
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
/** Pixels par unité de ln(zoom) — échelle CONSTANTE (le ruler défile). */
const PX_PER_LN = 96;
/** Espacement des graduations fines (en ln). */
const TICK_LN = Math.LN2 / 8;
/** Seuil d'accroche magnétique (distance en ln à un palier). */
const SNAP_LN = 0.035;
/** Auto-repli après la dernière interaction. */
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
 *  - **replié** : chips de paliers espacés (le plus proche = cercle blanc montrant
 *    la valeur courante) ; tap = accroche sur le palier.
 *  - **déplié** (au glissement) : **ruler DÉFILANT** — échelle log à pas constant
 *    qui glisse pour amener la valeur courante au centre (curseur ~centré), bulle
 *    de valeur, accroche magnétique + tick haptique. Glissement RELATIF : marche
 *    quelle que soit la position du doigt à l'écran. Auto-repli après inactivité.
 */
export function ZoomControl({ min, max, presets, value, onZoom }: ZoomControlProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  // Valeur LOCALE pendant le glissement : pilote le ruler à 60fps sans re-rendre
  // tout l'écran (le zoom natif, lui, n'est appliqué que throttlé -> plus de lag).
  const [dragValue, setDragValue] = useState<number | null>(null);
  const expand = useRef(new Animated.Value(0)).current;
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnap = useRef<number | null>(null);
  const drag = useRef({ startZoom: 1, dxAtGrant: 0 });
  const lastApply = useRef(0);
  const pendingZoom = useRef<number | null>(null);

  // Config lue par le PanResponder (créé une fois) via ref -> pas de closure périmée.
  const cfg = useRef({ min, max, presets, onZoom, value });
  cfg.current = { min, max, presets, onZoom, value };

  const lnMin = Math.log(min);
  const lnMax = Math.log(max);
  const lnRange = lnMax - lnMin;
  const stripW = PX_PER_LN * lnRange;

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

  // Glissement RELATIF : zoom = zoomDébut × exp(Δx / k). Doigt à droite = zoom in.
  const setFromDrag = (deltaX: number): void => {
    const c = cfg.current;
    if (Math.log(c.max) - Math.log(c.min) <= 0) return;
    let z = clamp(drag.current.startZoom * Math.exp(deltaX / PX_PER_LN), c.min, c.max);
    let snapped: number | null = null;
    for (const preset of c.presets) {
      if (Math.abs(Math.log(z) - Math.log(preset)) < SNAP_LN) {
        z = preset;
        snapped = preset;
        break;
      }
    }
    if (snapped != null && snapped !== lastSnap.current) haptics.selection();
    lastSnap.current = snapped;
    // Ruler fluide (état local) ; zoom natif appliqué au plus toutes les ~45ms.
    setDragValue(z);
    pendingZoom.current = z;
    const now = Date.now();
    if (now - lastApply.current >= 45) {
      lastApply.current = now;
      c.onZoom(z);
    }
  };
  const endDrag = (): void => {
    // Applique la valeur finale exacte, puis rend la main à la prop `value`.
    if (pendingZoom.current != null) cfg.current.onZoom(pendingZoom.current);
    pendingZoom.current = null;
    lastSnap.current = null;
    setDragValue(null);
    scheduleCollapse();
  };

  const pan = useRef(
    PanResponder.create({
      // Laisse les taps aux chips ; ne capte QUE le glissement horizontal.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (_e, g) => {
        drag.current = { startZoom: cfg.current.value, dxAtGrant: g.dx };
        openExpanded();
      },
      onPanResponderMove: (_e, g) => {
        setFromDrag(g.dx - drag.current.dxAtGrant);
      },
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }),
  ).current;

  // Contenu du ruler (graduations + labels), positionné en X ABSOLU sur la bande,
  // mémoïsé : seule la translation (translateX) change pendant le zoom.
  const stripContent = useMemo(() => {
    if (lnRange <= 0) return null;
    const ticks: number[] = [];
    for (let ln = lnMin; ln <= lnMax + 1e-6; ln += TICK_LN) ticks.push(PX_PER_LN * (ln - lnMin));
    return (
      <>
        {ticks.map((x, i) => (
          <View key={i} style={[styles.minorTick, { left: x }]} />
        ))}
        {presets.map((p) => (
          <Text key={p} style={[styles.rulerLabel, { left: PX_PER_LN * (Math.log(p) - lnMin) - 16 }]}>
            {chipLabel(p)}
          </Text>
        ))}
      </>
    );
  }, [lnMin, lnMax, lnRange, presets]);

  if (presets.length < 2 || max <= min) return null;

  // Pendant le glissement on affiche la valeur LOCALE (fluide) ; sinon la prop.
  const shownValue = dragValue ?? value;

  // Chip la plus proche de la valeur (affiche la valeur exacte en actif).
  let activeIdx = 0;
  let best = Infinity;
  presets.forEach((pr, i) => {
    const d = Math.abs(Math.log(pr) - Math.log(shownValue));
    if (d < best) {
      best = d;
      activeIdx = i;
    }
  });

  const tapChip = (z: number): void => {
    haptics.selection();
    onZoom(z);
  };

  // Défilement : on centre la valeur, en épinglant aux bords (pas de vide).
  const xAbsValue = PX_PER_LN * (Math.log(shownValue) - lnMin);
  const translateX = stripW <= WIDTH ? (WIDTH - stripW) / 2 : clamp(WIDTH / 2 - xAbsValue, WIDTH - stripW, 0);
  const thumbX = xAbsValue + translateX;
  const collapsedOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.wrap}>
      {/* Bulle de valeur (dépliée) au-dessus du curseur. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.bubble, { opacity: expand, transform: [{ translateX: clamp(thumbX - 22, 0, WIDTH - 44) }] }]}
      >
        <Text style={styles.bubbleText}>{fmt(shownValue)}</Text>
      </Animated.View>

      <View style={styles.pill} {...pan.panHandlers}>
        {/* REPLIÉ : chips espacés. */}
        <Animated.View
          style={[styles.layer, styles.chips, { opacity: collapsedOpacity }]}
          pointerEvents={expanded ? 'none' : 'auto'}
        >
          {presets.map((pr, i) => {
            const active = i === activeIdx;
            return (
              <Pressable key={pr} onPress={() => tapChip(pr)} style={styles.chipHit} accessibilityRole="button">
                {active ? (
                  <View style={styles.activeChip}>
                    <Text style={styles.activeText}>{fmt(shownValue)}</Text>
                  </View>
                ) : (
                  <Text style={styles.chipText}>{chipLabel(pr)}</Text>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        {/* DÉPLIÉ : ruler défilant (bande translatée) + curseur ~centré. */}
        <Animated.View style={[styles.layer, { opacity: expand }]} pointerEvents="none">
          <View style={[styles.strip, { width: Math.max(stripW, WIDTH), transform: [{ translateX }] }]}>
            {stripContent}
          </View>
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
  strip: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  minorTick: {
    position: 'absolute',
    top: 9,
    width: StyleSheet.hairlineWidth,
    height: 9,
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
    top: 5,
    width: 3,
    height: 22,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
});
