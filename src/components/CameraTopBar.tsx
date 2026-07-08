import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';

export type PhotoFlashMode = 'off' | 'on' | 'auto';
export type TorchState = 'on' | 'off';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const FLASH_ICON: Record<PhotoFlashMode, IconName> = {
  off: 'flash-off',
  auto: 'flash-auto',
  on: 'flash-on',
};

interface CameraTopBarProps {
  modeLabel: string;
  torchOn: boolean;
  photoFlash: PhotoFlashMode;
  flashSupported: boolean;
  onCyclePhotoFlash: () => void;
  onOpenSettings: () => void;
}

/**
 * Barre supérieure Material 3 épurée : indicateur de mode (Dual / Simple) à
 * gauche ; à droite, cycle de flash photo (off / auto / on) + accès Paramètres.
 */
export function CameraTopBar({
  modeLabel,
  torchOn,
  photoFlash,
  flashSupported,
  onCyclePhotoFlash,
  onOpenSettings,
}: CameraTopBarProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Plancher : jamais au-dessus de la valeur d'origine (statusbar masquée => insets.top peut valoir 0).
  const top = Math.max(insets.top + 8, 48);
  const flashColor = !flashSupported
    ? colors.outlineVariant
    : photoFlash === 'off'
      ? colors.onSurface
      : colors.warning;

  return (
    <View style={[styles.container, { top }]} pointerEvents="box-none">
      <View style={styles.modePill}>
        {torchOn && <MaterialIcons name="flashlight-on" size={14} color={colors.warning} />}
        <Text style={styles.modeText}>{modeLabel}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCyclePhotoFlash}
          disabled={!flashSupported}
          android_ripple={{ color: colors.onSurfaceVariant, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('topBar.flashA11y', {
            state: t(
              photoFlash === 'off'
                ? 'topBar.flashStateOff'
                : photoFlash === 'auto'
                  ? 'topBar.flashStateAuto'
                  : 'topBar.flashStateOn',
            ),
          })}
        >
          <MaterialIcons name={FLASH_ICON[photoFlash]} size={21} color={flashColor} />
        </Pressable>

        <Pressable
          onPress={onOpenSettings}
          android_ripple={{ color: colors.onSurfaceVariant, borderless: true, radius: 26 }}
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('topBar.settingsA11y')}
        >
          <MaterialIcons name="tune" size={24} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
