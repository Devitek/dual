import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { haptics } from '../utils/haptics';

interface ZoomBarProps {
  /** Paliers de zoom rapides (ex. [1, 2]). */
  levels: number[];
  /** Zoom courant (float) — sert à surligner le palier le plus proche. */
  current: number;
  onSelect: (level: number) => void;
}

function formatLevel(level: number): string {
  // 1 -> "1×", 0.5 -> "0.5×", 2 -> "2×"
  return `${Number.isInteger(level) ? level : level.toString()}×`;
}

/**
 * Rangée de paliers de zoom rapides, posée au-dessus du sélecteur de mode.
 * Masquée s'il n'y a pas au moins deux paliers (mono-focale).
 */
export function ZoomBar({ levels, current, onSelect }: ZoomBarProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (levels.length < 2) return null;

  // Palier actif = le plus proche du zoom courant.
  let activeIdx = 0;
  let best = Infinity;
  levels.forEach((level, i) => {
    const d = Math.abs(level - current);
    if (d < best) {
      best = d;
      activeIdx = i;
    }
  });

  return (
    <View style={styles.container}>
      {levels.map((level, i) => {
        const active = i === activeIdx;
        return (
          <Pressable
            key={level}
            onPress={() => {
              haptics.selection();
              onSelect(level);
            }}
            style={[styles.pill, active && styles.pillActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('zoom.levelA11y', { level: formatLevel(level) })}
          >
            <Text style={[styles.text, active ? styles.textActive : styles.textInactive]}>
              {formatLevel(level)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  text: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  textActive: { color: '#fff' },
  textInactive: { color: 'rgba(255,255,255,0.7)' },
});
