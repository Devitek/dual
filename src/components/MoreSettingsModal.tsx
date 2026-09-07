import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import { Segmented } from './Segmented';
import { buildDeviceReport } from '../utils/deviceReport';
import type { MultiCamDiagnostics } from '../vision/MultiCamController';
import type { VolumeKeyAction } from '../native/volumeKeys';
import appJson from '../../app.json';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const APP_VERSION: string = appJson.expo?.version ?? '';

interface MoreSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  // Général
  shutterSound: boolean;
  onToggleShutterSound: () => void;
  volumeKeyAction: VolumeKeyAction;
  onSetVolumeKeyAction: (action: VolumeKeyAction) => void;
  geotag: boolean;
  onToggleGeotag: () => void;
  // Composition
  grid: boolean;
  onToggleGrid: () => void;
  level: boolean;
  onToggleLevel: () => void;
  mirrorFront: boolean;
  onToggleMirrorFront: () => void;
  watermark: boolean;
  onToggleWatermark: () => void;
  // Capture
  stabilization: boolean;
  onToggleStabilization: () => void;
  // Aide
  diagnostics?: MultiCamDiagnostics | null;
}

/**
 * Écran plein « Autres réglages » : les préférences réglées une fois, par
 * catégories (Général, Composition, Capture, Aide & diagnostic). Ouvert depuis
 * le bouton `…` du sheet de réglages rapides.
 */
export function MoreSettingsModal(props: MoreSettingsModalProps): React.ReactElement {
  const {
    visible,
    onClose,
    shutterSound,
    onToggleShutterSound,
    volumeKeyAction,
    onSetVolumeKeyAction,
    geotag,
    onToggleGeotag,
    grid,
    onToggleGrid,
    level,
    onToggleLevel,
    mirrorFront,
    onToggleMirrorFront,
    watermark,
    onToggleWatermark,
    stabilization,
    onToggleStabilization,
    diagnostics = null,
  } = props;

  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const onCopy = useCallback(() => {
    haptics.selection();
    void Clipboard.setStringAsync(buildDeviceReport(diagnostics));
    setCopied(true);
    if (resetTimer.current != null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [diagnostics]);

  // Ligne « switch » dans une carte : icône + (libellé + description) + interrupteur.
  const rowSwitch = (
    icon: IconName,
    label: string,
    value: boolean,
    onValueChange: () => void,
    desc?: string,
  ): React.ReactElement => (
    <View style={styles.cardRow}>
      <MaterialIcons name={icon} size={22} color={colors.onSurfaceVariant} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc != null && <Text style={styles.desc}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.surfaceContainerHighest }}
        thumbColor={value ? colors.onPrimary : colors.outline}
      />
    </View>
  );

  // Regroupe des lignes dans une carte M3 arrondie, séparées par des dividers.
  const card = (rows: React.ReactNode[]): React.ReactElement => {
    const items = rows.filter((r) => r != null);
    return (
      <View style={styles.card}>
        {items.map((r, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.divider} />}
            {r}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const volumeKeyOptions: { value: VolumeKeyAction; label: string }[] = [
    { value: 'volume', label: t('settings.volKeyVolume') },
    { value: 'shutter', label: t('settings.volKeyShutter') },
    { value: 'zoom', label: t('settings.volKeyZoom') },
  ];

  const volumeRow = (
    <View style={styles.cardRowCol}>
      <View style={styles.rowHeader}>
        <MaterialIcons name="volume-up" size={22} color={colors.onSurfaceVariant} />
        <Text style={styles.rowLabel}>{t('settings.volumeKeys')}</Text>
      </View>
      <Segmented options={volumeKeyOptions} value={volumeKeyAction} onChange={onSetVolumeKeyAction} />
    </View>
  );

  const reportRow = (
    <View style={styles.cardRowCol}>
      <View style={styles.rowHeader}>
        <MaterialIcons name="info-outline" size={22} color={colors.onSurfaceVariant} />
        <Text style={styles.rowLabel}>{t('settings.deviceReport')}</Text>
      </View>
      <Text style={styles.report} selectable>
        {buildDeviceReport(diagnostics)}
      </Text>
      <Pressable onPress={onCopy} style={styles.copyBtn} hitSlop={8} accessibilityRole="button">
        <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={colors.onSecondaryContainer} />
        <Text style={styles.copyText}>{copied ? t('settings.copied') : t('settings.copyReport')}</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Top app bar M3 */}
        <View style={styles.appbar}>
          <Pressable
            onPress={() => {
              haptics.selection();
              onClose();
            }}
            android_ripple={{ color: colors.onSurfaceVariant, borderless: true, radius: 24 }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('settings.back')}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>{t('settings.moreTitle')}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.section}>{t('settings.catGeneral')}</Text>
          {card([
            rowSwitch('volume-off', t('settings.shutterSound'), shutterSound, onToggleShutterSound, t('settings.shutterSoundDesc')),
            volumeRow,
            rowSwitch('location-on', t('settings.geotag'), geotag, onToggleGeotag, t('settings.geotagDesc')),
          ])}

          <Text style={styles.section}>{t('settings.catComposition')}</Text>
          {card([
            rowSwitch('grid-on', t('settings.grid'), grid, onToggleGrid),
            rowSwitch('straighten', t('settings.level'), level, onToggleLevel, t('settings.levelDesc')),
            rowSwitch('flip', t('settings.mirrorFront'), mirrorFront, onToggleMirrorFront, t('settings.mirrorFrontDesc')),
            rowSwitch('branding-watermark', t('settings.watermark'), watermark, onToggleWatermark, t('settings.watermarkDesc')),
          ])}

          <Text style={styles.section}>{t('settings.catCapture')}</Text>
          {card([
            rowSwitch('blur-off', t('settings.stabilization'), stabilization, onToggleStabilization, t('settings.stabilizationDesc')),
          ])}

          <Text style={styles.section}>{t('settings.catHelp')}</Text>
          {card([reportRow])}

          <Text style={styles.version}>
            {t('settings.version')} {APP_VERSION}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  // Top app bar M3.
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 64, paddingHorizontal: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  section: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 12,
  },
  // Carte M3 arrondie groupant des lignes.
  card: { backgroundColor: colors.surfaceContainerHigh, borderRadius: 20, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
  cardRowCol: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowTexts: { flex: 1, gap: 2 },
  rowLabel: { color: colors.onSurface, fontSize: 16 },
  desc: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant, marginLeft: 54 },
  report: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.select({ android: 'monospace', default: undefined }),
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.secondaryContainer,
  },
  copyText: { color: colors.onSecondaryContainer, fontSize: 13, fontWeight: '700' },
  version: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 24, textAlign: 'center' },
});
