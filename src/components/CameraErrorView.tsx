import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';

interface CameraErrorViewProps {
  /** Message technique éventuel (affiché en petit, pour diagnostic). */
  message?: string | null;
  onRetry: () => void;
}

/**
 * Écran d'erreur actionnable affiché quand la session caméra échoue.
 * Propose de réessayer (reconfiguration) ou d'ouvrir les réglages système.
 */
export function CameraErrorView({ message, onRetry }: CameraErrorViewProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialIcons name="no-photography" size={42} color={colors.danger} />
      </View>

      <Text style={styles.title}>{t('error.title')}</Text>
      <Text style={styles.message}>{t('error.message')}</Text>

      {message != null && message.length > 0 && <Text style={styles.detail}>{message}</Text>}

      <Pressable
        style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
        onPress={() => {
          haptics.selection();
          onRetry();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('error.retry')}
      >
        <MaterialIcons name="refresh" size={20} color={colors.onPrimary} />
        <Text style={styles.retryText}>{t('error.retry')}</Text>
      </Pressable>

      <Pressable
        style={styles.settingsLink}
        onPress={() => void Linking.openSettings()}
        accessibilityRole="button"
        accessibilityLabel={t('error.openSettings')}
      >
        <Text style={styles.settingsLinkText}>{t('error.openSettings')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  message: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  detail: {
    color: colors.outline,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginTop: 28,
  },
  retryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  settingsLink: { marginTop: 16, padding: 8 },
  settingsLinkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
