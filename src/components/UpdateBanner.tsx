import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Bandeau discret « mise à jour disponible » (Play In-App Updates, flexible).
 * Non bloquant, dismissible. Placé sous la top bar ; slide/fade à l'apparition.
 */
export function UpdateBanner({ onUpdate, onDismiss }: UpdateBannerProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 5, speed: 12 }).start();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const top = Math.max(insets.top + 8, 48) + 44;

  return (
    <Animated.View style={[styles.wrap, { top, opacity: anim, transform: [{ translateY }] }]}>
      <MaterialIcons name="system-update" size={20} color={colors.primary} />
      <Text style={styles.text} numberOfLines={2}>
        {t('update.available')}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.later} accessibilityRole="button">
        <Text style={styles.laterText}>{t('update.later')}</Text>
      </Pressable>
      <Pressable
        onPress={onUpdate}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{t('update.cta')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surfaceContainerHighest,
      borderRadius: 14,
      paddingVertical: 10,
      paddingLeft: 14,
      paddingRight: 6,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
    },
    text: { flex: 1, color: colors.onSurface, fontSize: 13.5, lineHeight: 18 },
    later: { paddingHorizontal: 8, paddingVertical: 8 },
    laterText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
    cta: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    ctaText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
    pressed: { opacity: 0.85 },
  });
