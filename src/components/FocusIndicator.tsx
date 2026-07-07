import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors } from '../theme/colors';

export interface FocusPoint {
  x: number;
  y: number;
  /** incrémenté à chaque tap pour re-déclencher l'animation. */
  nonce: number;
}

const SIZE = 74;

/**
 * Carré de mise au point animé (RN Animated, natif — sans reanimated) qui
 * apparaît à l'endroit tapé puis s'estompe.
 */
export function FocusIndicator({ point }: { point: FocusPoint | null }): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1.4)).current;

  useEffect(() => {
    if (point == null) return;
    opacity.setValue(1);
    scale.setValue(1.4);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(550),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
    // On ne dépend QUE du nonce : chaque tap re-joue l'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.nonce]);

  if (point == null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        {
          left: point.x - SIZE / 2,
          top: point.y - SIZE / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.warning,
  },
});
