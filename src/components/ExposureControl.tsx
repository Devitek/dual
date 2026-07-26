import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useColors } from '../theme/theme';
import { haptics } from '../utils/haptics';

interface ExposureControlProps {
  min: number;
  max: number;
  /** Valeur EV courante. */
  value: number;
  onChange: (v: number) => void;
}

const TRACK_H = 160;

/**
 * Contrôle manuel d'exposition (compensation EV) superposé au viseur : un bouton
 * soleil déplie un curseur vertical (haut = +EV, bas = −EV). Valeur transitoire
 * (non persistée). Rendu vide si l'appareil ne supporte pas la compensation EV.
 */
export function ExposureControl({ min, max, value, onChange }: ExposureControlProps): React.ReactElement | null {
  const { t } = useTranslation();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const trackH = useRef(TRACK_H);

  if (!(max > min)) return null;

  const setFromY = (localY: number) => {
    const h = trackH.current || TRACK_H;
    const clampedY = Math.min(h, Math.max(0, localY));
    const v = max - (clampedY / h) * (max - min);
    onChange(Math.round(v * 10) / 10);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromY(e.nativeEvent.locationY),
      onPanResponderMove: (e) => setFromY(e.nativeEvent.locationY),
    }),
  ).current;

  // Position du pouce (0 en haut = max, 1 en bas = min).
  const frac = max > min ? (max - value) / (max - min) : 0.5;
  const thumbTop = frac * trackH.current;

  const label = `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open && (
        <View style={styles.sliderCol}>
          <Text style={[styles.value, { color: colors.onSurface }]}>{label}</Text>
          <View
            style={styles.track}
            onLayout={(e) => {
              trackH.current = e.nativeEvent.layout.height;
            }}
            {...pan.panHandlers}
          >
            <View style={styles.trackLine} />
            <View style={[styles.thumb, { top: thumbTop - 10, backgroundColor: colors.primary }]} />
          </View>
          <Pressable
            onPress={() => {
              haptics.selection();
              onChange(0);
            }}
            hitSlop={8}
          >
            <Text style={[styles.reset, { color: colors.onSurfaceVariant }]}>0</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        style={[styles.btn, { backgroundColor: open ? colors.primary : 'rgba(0,0,0,0.45)' }]}
        onPress={() => {
          haptics.selection();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('capture.exposure')}
      >
        <MaterialIcons name="exposure" size={20} color={open ? colors.onPrimary : '#fff'} />
        {value !== 0 && !open && <Text style={styles.badge}>{label}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 12, top: '30%', alignItems: 'center' },
  sliderCol: { alignItems: 'center', marginBottom: 8 },
  value: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  track: { width: 40, height: TRACK_H, alignItems: 'center', justifyContent: 'center' },
  trackLine: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  reset: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { color: '#fff', fontSize: 8, fontWeight: '700', position: 'absolute', bottom: 2 },
});
