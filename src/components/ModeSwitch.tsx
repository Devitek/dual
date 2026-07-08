import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';

export type CaptureMode = 'photo' | 'video';

interface ModeSwitchProps {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
  /** true pendant l'enregistrement (le mode ne peut plus changer). */
  disabled?: boolean;
}

const MODES: { value: CaptureMode; label: string }[] = [
  { value: 'photo', label: 'PHOTO' },
  { value: 'video', label: 'VIDÉO' },
];

/**
 * Pilule segmentée translucide (style appareil photo) posée au-dessus de
 * l'obturateur : bascule Photo | Vidéo. L'obturateur unique s'adapte au mode.
 */
export function ModeSwitch({ mode, onChange, disabled = false }: ModeSwitchProps): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {MODES.map((m) => {
        const active = m.value === mode;
        const isVideo = m.value === 'video';
        return (
          <Pressable
            key={m.value}
            disabled={disabled || active}
            onPress={() => {
              haptics.selection();
              onChange(m.value);
            }}
            style={[
              styles.segment,
              active && (isVideo ? styles.segmentActiveVideo : styles.segmentActivePhoto),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={isVideo ? 'Mode vidéo' : 'Mode photo'}
          >
            <Text
              style={[
                styles.label,
                active ? (isVideo ? styles.labelActiveVideo : styles.labelActive) : styles.labelInactive,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  disabled: { opacity: 0.5 },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 15,
  },
  segmentActivePhoto: { backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentActiveVideo: { backgroundColor: 'rgba(255,180,171,0.22)' },
  label: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.5 },
  labelInactive: { color: 'rgba(255,255,255,0.62)' },
  labelActive: { color: '#fff' },
  labelActiveVideo: { color: colors.danger },
});
