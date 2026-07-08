import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';

interface UnsupportedBannerProps {
  /** true si l'appareil n'a tout simplement pas les deux capteurs. */
  missingSensor?: boolean;
}

/**
 * Bandeau non-bloquant affiché en haut de l'écran quand le multi-caméra
 * simultané n'est pas disponible (matériel incompatible ou session concurrente
 * refusée). L'app continue de fonctionner en mono-caméra. Un lien « Pourquoi ? »
 * déplie l'explication.
 */
export function UnsupportedBanner({ missingSensor = false }: UnsupportedBannerProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.container, { top: Math.max(insets.top + 52, 92) }]} pointerEvents="box-none">
      <Text style={styles.title}>Mode caméra unique</Text>
      <Text style={styles.text}>
        {missingSensor
          ? 'Cet appareil ne dispose pas des deux caméras.'
          : 'Cet appareil ne prend pas en charge la capture simultanée avant + arrière. Bascule automatique sur une seule caméra.'}
      </Text>

      {!missingSensor && (
        <>
          <Pressable
            onPress={() => {
              haptics.selection();
              setExpanded((v) => !v);
            }}
            style={styles.link}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{expanded ? 'Masquer' : 'Pourquoi ?'}</Text>
          </Pressable>

          {expanded && (
            <Text style={styles.explain}>
              La capture avant + arrière simultanée dépend de l’ISP de l’appareil : beaucoup de
              modèles ne l’autorisent que sur certaines combinaisons de caméras, ou pas du tout.
              TwinLens bascule alors sur une seule caméra pour rester fonctionnel.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    alignItems: 'center',
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
  link: { marginTop: 6, paddingVertical: 2, paddingHorizontal: 6 },
  linkText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  explain: {
    color: colors.onSurfaceVariant,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
  },
});
