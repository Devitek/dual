import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { RotatingView } from './RotatingView';

export type PhotoFlashMode = 'off' | 'on' | 'auto';
export type TorchState = 'on' | 'off';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const FLASH_ICON: Record<PhotoFlashMode, IconName> = {
  off: 'flash-off',
  auto: 'flash-auto',
  on: 'flash-on',
};

interface CameraTopBarProps {
  photoFlash: PhotoFlashMode;
  flashSupported: boolean;
  onCyclePhotoFlash: () => void;
  aeLocked: boolean;
  onToggleAeLock: () => void;
  /** Rotation (degrés) du contenu des boutons selon l'orientation physique (#173). */
  uiRotation?: number;
}

/**
 * Barre supérieure Material 3 épurée : indicateur de mode (Dual / Simple) à
 * gauche ; à droite, cycle de flash photo (off / auto / on) + accès Paramètres.
 */
export function CameraTopBar({
  photoFlash,
  flashSupported,
  onCyclePhotoFlash,
  aeLocked,
  onToggleAeLock,
  uiRotation = 0,
}: CameraTopBarProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Plancher : jamais au-dessus de la valeur d'origine (statusbar masquée => insets.top peut valoir 0).
  const top = Math.max(insets.top + 8, 48);
  const flashColor = !flashSupported ? colors.outlineVariant : photoFlash === 'off' ? colors.onSurface : colors.warning;

  return (
    <View style={[styles.container, { top }]} pointerEvents="box-none">
      <View style={styles.actions}>
        <Pressable
          onPress={onToggleAeLock}
          hitSlop={8}
          android_ripple={{ color: colors.onSurfaceVariant, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.iconBtn, aeLocked && styles.iconBtnActive, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ selected: aeLocked }}
          accessibilityLabel={t('topBar.aeLockA11y')}
        >
          <RotatingView rotation={uiRotation}>
            <MaterialIcons
              name={aeLocked ? 'lock' : 'lock-open'}
              size={20}
              color={aeLocked ? colors.warning : colors.onSurface}
            />
          </RotatingView>
        </Pressable>

        <Pressable
          onPress={onCyclePhotoFlash}
          disabled={!flashSupported}
          hitSlop={8}
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
          <RotatingView rotation={uiRotation}>
            <MaterialIcons name={FLASH_ICON[photoFlash]} size={21} color={flashColor} />
          </RotatingView>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 48,
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.overlayStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnActive: { borderWidth: 1.5, borderColor: colors.warning },
    pressed: { opacity: 0.8 },
  });
