import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../theme/colors';

export type PhotoFlashMode = 'off' | 'on' | 'auto';
export type TorchState = 'on' | 'off';

interface CameraTopBarProps {
  modeLabel: string;
  torchOn: boolean;
  onOpenSettings: () => void;
}

/**
 * Barre supérieure Material 3 épurée : indicateur de mode (Dual / Simple) +
 * petit repère torche, et bouton d'accès au menu Paramètres (à droite).
 */
export function CameraTopBar({ modeLabel, torchOn, onOpenSettings }: CameraTopBarProps): React.ReactElement {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.modePill}>
        {torchOn && <MaterialIcons name="flashlight-on" size={14} color={colors.warning} />}
        <Text style={styles.modeText}>{modeLabel}</Text>
      </View>

      <Pressable
        onPress={onOpenSettings}
        android_ripple={{ color: colors.onSurfaceVariant, borderless: true, radius: 26 }}
        style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir les paramètres"
      >
        <MaterialIcons name="tune" size={24} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.overlayStrong,
  },
  modeText: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  settingsBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
});
