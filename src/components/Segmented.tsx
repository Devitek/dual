import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Micro-légende sur une 2e ligne (ex. résolutions pour la qualité). */
  caption?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * Segmented buttons Material 3 : conteneur continu (bordure unique + séparateurs
 * internes), segment actif teinté `primaryContainer` avec icône coche. Partagé
 * entre le sheet de réglages rapides et l'écran « Autres réglages ».
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps<T>): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.segGroup, disabled && styles.dim]}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => {
              haptics.selection();
              onChange(opt.value);
            }}
            style={[styles.segCell, i > 0 && styles.segDivider, active && styles.segCellActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
          >
            <View style={styles.segLabelRow}>
              {active && (
                <MaterialIcons name="check" size={15} color={colors.onPrimaryContainer} style={styles.segCheck} />
              )}
              <Text style={[styles.segLabel, active && styles.segLabelActive]} numberOfLines={1}>
                {opt.label}
              </Text>
            </View>
            {opt.caption != null && (
              <Text style={[styles.segCaption, active && styles.segCaptionActive]} numberOfLines={1}>
                {opt.caption}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  segGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 18,
    overflow: 'hidden',
  },
  dim: { opacity: 0.4 },
  segCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segDivider: { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant },
  segCellActive: { backgroundColor: colors.primaryContainer },
  segLabelRow: { flexDirection: 'row', alignItems: 'center' },
  segCheck: { marginRight: 4 },
  segLabel: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  segLabelActive: { color: colors.onPrimaryContainer },
  segCaption: { color: colors.onSurfaceVariant, fontSize: 10.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  segCaptionActive: { color: colors.onPrimaryContainer },
});
