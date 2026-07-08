import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import type { PipCorner } from '../services/pipComposer';

interface PipHintProps {
  visible: boolean;
  /** Coin de la vignette PiP — le tooltip se place juste à côté. */
  corner: PipCorner;
  onDismiss: () => void;
}

// Cohérent avec MultiCamPreview (pip: top 96 / bottom 150, hauteur 172).
function hintPositionStyle(corner: PipCorner): ViewStyle {
  const isTop = corner === 'top-left' || corner === 'top-right';
  const isLeft = corner === 'top-left' || corner === 'bottom-left';
  return {
    ...(isTop ? { top: 96 + 172 + 8 } : { bottom: 150 + 172 + 8 }),
    ...(isLeft ? { left: 16 } : { right: 16 }),
  };
}

/**
 * Bulle d'aide affichée au 1er lancement, près de la vignette PiP, pour
 * expliquer qu'un tap sur la vignette inverse les caméras. Persistance +
 * auto-masquage gérés par l'écran parent.
 */
export function PipHint({ visible, corner, onDismiss }: PipHintProps): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(0)).current;
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, hintPositionStyle(corner), { opacity }]} pointerEvents="box-none">
      <Pressable
        style={styles.bubble}
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Compris"
      >
        <MaterialIcons name="touch-app" size={16} color={colors.onPrimaryContainer} />
        <Text style={styles.text}>Touchez la vignette pour inverser les caméras</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', maxWidth: 210 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryContainer,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  text: { flex: 1, color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '600', lineHeight: 16 },
});
