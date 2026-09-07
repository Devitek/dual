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

  const rowSwitch = (
    icon: IconName,
    label: string,
    value: boolean,
    onValueChange: () => void,
    desc?: string,
  ): React.ReactElement => (
    <View style={styles.item}>
      <View style={styles.row}>
        <MaterialIcons name={icon} size={22} color={colors.onSurface} />
        <Text style={styles.rowLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: colors.primary, false: colors.outlineVariant }}
          thumbColor={colors.onPrimary}
        />
      </View>
      {desc != null && <Text style={styles.desc}>{desc}</Text>}
    </View>
  );

  const volumeKeyOptions: { value: VolumeKeyAction; label: string }[] = [
    { value: 'volume', label: t('settings.volKeyVolume') },
    { value: 'shutter', label: t('settings.volKeyShutter') },
    { value: 'zoom', label: t('settings.volKeyZoom') },
  ];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              haptics.selection();
              onClose();
            }}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('settings.back')}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>{t('settings.moreTitle')}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
        >
          {/* Général */}
          <Text style={styles.section}>{t('settings.catGeneral')}</Text>
          {rowSwitch('volume-off', t('settings.shutterSound'), shutterSound, onToggleShutterSound, t('settings.shutterSoundDesc'))}
          <View style={styles.item}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="volume-up" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.volumeKeys')}</Text>
            </View>
            <Segmented options={volumeKeyOptions} value={volumeKeyAction} onChange={onSetVolumeKeyAction} />
          </View>
          {rowSwitch('location-on', t('settings.geotag'), geotag, onToggleGeotag, t('settings.geotagDesc'))}

          {/* Composition */}
          <Text style={styles.section}>{t('settings.catComposition')}</Text>
          {rowSwitch('grid-on', t('settings.grid'), grid, onToggleGrid)}
          {rowSwitch('straighten', t('settings.level'), level, onToggleLevel, t('settings.levelDesc'))}
          {rowSwitch('flip', t('settings.mirrorFront'), mirrorFront, onToggleMirrorFront, t('settings.mirrorFrontDesc'))}
          {rowSwitch('branding-watermark', t('settings.watermark'), watermark, onToggleWatermark, t('settings.watermarkDesc'))}

          {/* Capture */}
          <Text style={styles.section}>{t('settings.catCapture')}</Text>
          {rowSwitch('blur-off', t('settings.stabilization'), stabilization, onToggleStabilization, t('settings.stabilizationDesc'))}

          {/* Aide & diagnostic */}
          <Text style={styles.section}>{t('settings.catHelp')}</Text>
          <View style={styles.item}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="info-outline" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.deviceReport')}</Text>
            </View>
            <Text style={styles.report} selectable>
              {buildDeviceReport(diagnostics)}
            </Text>
            <Pressable onPress={onCopy} style={styles.copyBtn} hitSlop={8} accessibilityRole="button">
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={16}
                color={colors.onSecondaryContainer}
              />
              <Text style={styles.copyText}>{copied ? t('settings.copied') : t('settings.copyReport')}</Text>
            </Pressable>
          </View>

          <Text style={styles.version}>{t('settings.version')} {APP_VERSION}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '700' },
  section: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 4,
  },
  item: { paddingVertical: 8, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowLabel: { color: colors.onSurface, fontSize: 16, flex: 1 },
  desc: { color: colors.onSurfaceVariant, fontSize: 11.5, lineHeight: 16 },
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
    borderRadius: 10,
    backgroundColor: colors.secondaryContainer,
  },
  copyText: { color: colors.onSecondaryContainer, fontSize: 13, fontWeight: '700' },
  version: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 24, textAlign: 'center' },
});
