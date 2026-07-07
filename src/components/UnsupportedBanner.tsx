import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

interface UnsupportedBannerProps {
  /** true si l'appareil n'a tout simplement pas les deux capteurs. */
  missingSensor?: boolean;
}

/**
 * Bandeau non-bloquant affiché en haut de l'écran quand le multi-caméra
 * simultané n'est pas disponible (matériel incompatible ou session concurrente
 * refusée). L'app continue de fonctionner en mono-caméra.
 */
export function UnsupportedBanner({
  missingSensor = false,
}: UnsupportedBannerProps): React.ReactElement {
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.title}>Mode caméra unique</Text>
      <Text style={styles.text}>
        {missingSensor
          ? 'Cet appareil ne dispose pas des deux caméras.'
          : 'Cet appareil ne prend pas en charge la capture simultanée avant + arrière. Bascule automatique sur une seule caméra.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 92,
    alignSelf: 'center',
    maxWidth: '88%',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  title: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 2,
  },
  text: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
