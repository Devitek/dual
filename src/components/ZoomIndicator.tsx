import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

interface ZoomIndicatorProps {
  zoom: number | null;
  /** change à chaque mise à jour pour relancer l'affichage. */
  nonce: number;
}

/**
 * Pastille de niveau de zoom (« 2.0× ») affichée transitoirement lorsqu'il change.
 */
export function ZoomIndicator({ zoom, nonce }: ZoomIndicatorProps): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (zoom == null) return;
    opacity.setValue(1);
    const anim = Animated.sequence([
      Animated.delay(1100),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (zoom == null) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>{zoom.toFixed(1)}×</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center' },
  pill: {
    minWidth: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
  },
  text: { color: colors.onSurface, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
