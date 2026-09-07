import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';

export type CaptureMode = 'photo' | 'video' | 'boomerang';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ModeSwitchProps {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
  /** true pendant l'enregistrement (le mode ne peut plus changer). */
  disabled?: boolean;
  /** Modes indisponibles sur cet appareil (grisés) — ex. vidéo en mode séquentiel. */
  blockedModes?: CaptureMode[];
  /** Appelé quand un mode bloqué est touché (afficher un message explicatif). */
  onBlocked?: (mode: CaptureMode) => void;
}

const MODES: { value: CaptureMode; labelKey: string; a11yKey: string; icon?: IconName }[] = [
  { value: 'photo', labelKey: 'mode.photo', a11yKey: 'mode.photoA11y' },
  { value: 'video', labelKey: 'mode.video', a11yKey: 'mode.videoA11y' },
  // ∞ (comme Instagram) plutôt qu'un texte peu clair.
  { value: 'boomerang', labelKey: 'mode.boomerang', a11yKey: 'mode.boomerangA11y', icon: 'all-inclusive' },
];

/**
 * Pilule segmentée translucide (style appareil photo) posée au-dessus de
 * l'obturateur : bascule Photo | Vidéo. L'obturateur unique s'adapte au mode.
 */
export function ModeSwitch({
  mode,
  onChange,
  disabled = false,
  blockedModes = [],
  onBlocked,
}: ModeSwitchProps): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {MODES.map((m) => {
        const active = m.value === mode;
        const isVideo = m.value === 'video';
        const blocked = blockedModes.includes(m.value);
        return (
          <Pressable
            key={m.value}
            // Un mode bloqué reste pressable (pour afficher le message), mais jamais actif.
            disabled={disabled || active}
            onPress={() => {
              if (blocked) {
                haptics.error();
                onBlocked?.(m.value);
                return;
              }
              haptics.selection();
              onChange(m.value);
            }}
            style={[
              styles.segment,
              active && (isVideo ? styles.segmentActiveVideo : styles.segmentActivePhoto),
              blocked && styles.segmentBlocked,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: disabled || blocked }}
            accessibilityLabel={t(m.a11yKey)}
          >
            {m.icon != null ? (
              <MaterialIcons
                name={m.icon}
                size={19}
                color={active ? '#fff' : 'rgba(255,255,255,0.62)'}
              />
            ) : (
              <Text
                style={[
                  styles.label,
                  active ? (isVideo ? styles.labelActiveVideo : styles.labelActive) : styles.labelInactive,
                ]}
              >
                {t(m.labelKey)}
              </Text>
            )}
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
  segmentBlocked: { opacity: 0.35 },
  segmentActivePhoto: { backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentActiveVideo: { backgroundColor: 'rgba(255,180,171,0.22)' },
  label: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.5 },
  labelInactive: { color: 'rgba(255,255,255,0.62)' },
  labelActive: { color: '#fff' },
  labelActiveVideo: { color: colors.danger },
});
