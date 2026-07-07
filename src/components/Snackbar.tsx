import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';
import { haptics } from '../utils/haptics';
import type { Notice } from '../vision/MultiCamController';

const VISIBLE_MS = 3200;

/**
 * Snackbar Material 3 : affiche le dernier {@link Notice} (confirmation ou
 * erreur) pendant quelques secondes, avec retour haptique de notification.
 */
export function Snackbar({ notice }: { notice: Notice | null }): React.ReactElement | null {
  const [current, setCurrent] = useState<Notice | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (notice == null) return;
    setCurrent(notice);
    if (notice.kind === 'success') haptics.success();
    else haptics.error();

    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setCurrent(null);
        },
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id]);

  if (current == null) return null;

  return (
    <Animated.View style={[styles.snack, { opacity }]} pointerEvents="none">
      <Text style={styles.dot}>{current.kind === 'success' ? '✓' : '⚠'}</Text>
      <Text style={styles.text} numberOfLines={2}>
        {current.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snack: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  dot: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  text: { color: colors.onSurface, fontSize: 14, flex: 1, lineHeight: 19 },
});
