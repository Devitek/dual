import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors } from '../theme/theme';

interface M3SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

// Dimensions Material 3 (track 52×32, pouce 24, coche 16).
const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 24;
const PAD = 4;

/**
 * Interrupteur Material 3 dessiné à la main (rendu identique quel que soit le
 * thème natif Android) : piste pilule, pouce circulaire qui glisse, coche dans
 * le pouce à l'état activé. Couleurs issues de la palette Material You.
 */
export function M3Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: M3SwitchProps): React.ReactElement {
  const colors = useColors();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false, // interpolation de couleurs + translateX
      bounciness: 6,
      speed: 16,
    }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceContainerHighest, colors.primary],
  });
  const trackBorder = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.outline, colors.primary],
  });
  const thumbColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.outline, colors.onPrimary],
  });
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_W - THUMB - PAD * 2],
  });
  // Le pouce est plus petit à l'état OFF (spec M3) : on le scale légèrement.
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.66, 1] });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor, borderColor: trackBorder }]}>
        <Animated.View style={[styles.thumb, { backgroundColor: thumbColor, transform: [{ translateX }, { scale }] }]}>
          <Animated.View style={{ opacity: anim }}>
            <MaterialIcons name="check" size={16} color={colors.onPrimaryContainer} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    marginLeft: PAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
