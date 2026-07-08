import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';

interface ProcessingIndicatorProps {
  count: number;
  /** progression 0..1 (ou null/-1 = indéterminé). */
  progress?: number | null;
}

/**
 * Indicateur DISCRET de traitement en tâche de fond (au-dessus de la miniature).
 * La progression détaillée est dans la notification système (Foreground Service).
 */
export function ProcessingIndicator({ count, progress }: ProcessingIndicatorProps): React.ReactElement | null {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  if (count <= 0) return null;
  const pct = progress != null && progress >= 0 ? Math.round(progress * 100) : null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <ActivityIndicator size="small" color={colors.onPrimaryContainer} />
        <Text style={styles.text}>{pct != null ? t('processing.pip', { pct }) : t('processing.generic')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', bottom: 132, left: 16 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryContainer,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  text: { color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
