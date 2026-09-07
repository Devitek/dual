import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import type { MultiCamDiagnostics } from '../vision/MultiCamController';

interface UnsupportedBannerProps {
  /**
   * Mode caméra dégradé courant :
   *  - `single`     : un seul capteur exploitable (aucun dual possible) ;
   *  - `sequential` : les deux capteurs existent mais pas de capture simultanée
   *    (photo double prise en deux temps, vidéo indisponible).
   */
  mode: 'single' | 'sequential';
  /** Diagnostic de détection multi-caméra (pour le bloc « détails techniques »). */
  diagnostics?: MultiCamDiagnostics | null;
}

/** Champs d'intérêt de `Platform.constants` côté Android (typage permissif). */
type AndroidConstants = {
  Brand?: string;
  Manufacturer?: string;
  Model?: string;
  Release?: string;
  Version?: number | string;
};

/** Construit un rapport technique locale-neutre, copiable pour le support. */
function buildReport(diagnostics?: MultiCamDiagnostics | null): string {
  const c = Platform.constants as AndroidConstants;
  const maker = c.Manufacturer ?? c.Brand ?? '?';
  const model = c.Model ?? '?';
  const lines = [
    'TwinLens · dual camera check',
    `Device: ${maker} ${model}`,
    `Android: ${c.Release ?? '?'} (SDK ${c.Version ?? '?'})`,
  ];
  if (diagnostics != null) {
    lines.push(
      `Concurrent feature: ${diagnostics.concurrentFeature ? 'yes' : 'no'}`,
      `Camera combinations: ${diagnostics.comboCount}`,
      `Front+back combo: ${diagnostics.frontBackCombo ? 'yes' : 'no'}`,
    );
  }
  return lines.join('\n');
}

/**
 * Bandeau non-bloquant affiché en haut de l'écran quand le multi-caméra
 * simultané n'est pas disponible (matériel incompatible ou session concurrente
 * refusée). L'app continue de fonctionner en mono-caméra. Un lien « Pourquoi ? »
 * déplie l'explication + un bloc « détails techniques » copiable (aide au
 * support : la plupart de ces cas viennent d'un OEM qui n'expose pas la capacité
 * `FEATURE_CAMERA_CONCURRENT`, pas d'un bug de l'app).
 */
export function UnsupportedBanner({
  mode,
  diagnostics = null,
}: UnsupportedBannerProps): React.ReactElement {
  // Réduit par défaut (peu intrusif) → dépliable au tap.
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `single` = un seul capteur (dual impossible) ; `sequential` = photo double
  // en deux temps possible, mais vidéo simultanée non → diagnostic disponible.
  const sequential = mode === 'sequential';
  const title = t(sequential ? 'sequential.title' : 'unsupported.title');
  const topStyle = { top: Math.max(insets.top + 52, 92) };
  const accent = styles.title.color as string;

  useEffect(
    () => () => {
      if (resetTimer.current != null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const onCopy = useCallback(() => {
    haptics.selection();
    void Clipboard.setStringAsync(buildReport(diagnostics));
    setCopied(true);
    if (resetTimer.current != null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [diagnostics]);

  // --- Mode RÉDUIT : petite pastille icône + titre + chevron ---
  if (!open) {
    return (
      <View style={[styles.wrap, topStyle]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            haptics.selection();
            setOpen(true);
          }}
          style={styles.compact}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          <MaterialIcons name="info-outline" size={15} color={accent} />
          <Text style={styles.compactTitle} numberOfLines={1}>{title}</Text>
          <MaterialIcons name="expand-more" size={16} color={styles.compactTitle.color as string} />
        </Pressable>
      </View>
    );
  }

  // --- Mode DÉPLIÉ : carte complète (texte + diagnostic copiable) ---
  return (
    <View style={[styles.wrap, topStyle]} pointerEvents="box-none">
      <View style={styles.card}>
        <Pressable
          onPress={() => {
            haptics.selection();
            setOpen(false);
          }}
          style={styles.header}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.title}>{title}</Text>
          <MaterialIcons name="expand-less" size={16} color={accent} />
        </Pressable>

        <Text style={styles.text}>{t(sequential ? 'sequential.text' : 'unsupported.textMissing')}</Text>

        {sequential && (
          <>
            <Text style={styles.explain}>{t('unsupported.explain')}</Text>

            <Text style={styles.detailsLabel}>{t('unsupported.details')}</Text>
            <Text style={styles.report} selectable>
              {buildReport(diagnostics)}
            </Text>

            <Pressable onPress={onCopy} style={styles.copyBtn} hitSlop={8} accessibilityRole="button">
              <Text style={styles.copyText}>{copied ? t('unsupported.copied') : t('unsupported.copy')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Conteneur de positionnement (transparent) — partagé réduit/déplié.
  wrap: {
    position: 'absolute',
    top: 92,
    alignSelf: 'center',
    maxWidth: '88%',
    alignItems: 'center',
  },
  // Mode réduit : pastille compacte (une ligne).
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  compactTitle: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12.5,
    flexShrink: 1,
  },
  // Mode déplié : carte complète.
  card: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  title: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  text: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  explain: {
    color: colors.onSurfaceVariant,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
  },
  detailsLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 4,
  },
  report: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    fontFamily: Platform.select({ android: 'monospace', default: undefined }),
  },
  copyBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.secondaryContainer,
  },
  copyText: { color: colors.onSecondaryContainer, fontSize: 12, fontWeight: '700' },
});
