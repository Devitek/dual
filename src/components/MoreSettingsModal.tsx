import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import { Segmented } from './Segmented';
import { M3Switch } from './M3Switch';
import { buildDeviceReport } from '../utils/deviceReport';
import {
  OTS_PER_DAY_VALUES,
  OTS_WINDOW_END_VALUES,
  OTS_WINDOW_START_VALUES,
  type OtsPerDay,
  type OtsWindowEnd,
  type OtsWindowStart,
} from '../services/settings';
import { clearCrashJournal, formatCrashJournal, readCrashJournal, type CrashEntry } from '../utils/crashJournal';
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
  // « Sur le fait » (#180)
  onTheSpotEnabled: boolean;
  onSetOnTheSpotEnabled: (v: boolean) => void;
  onTheSpotMinPerDay: OtsPerDay;
  onSetOnTheSpotMinPerDay: (v: OtsPerDay) => void;
  onTheSpotMaxPerDay: OtsPerDay;
  onSetOnTheSpotMaxPerDay: (v: OtsPerDay) => void;
  onTheSpotWindowStart: OtsWindowStart;
  onSetOnTheSpotWindowStart: (v: OtsWindowStart) => void;
  onTheSpotWindowEnd: OtsWindowEnd;
  onSetOnTheSpotWindowEnd: (v: OtsWindowEnd) => void;
  /** À l'ouverture, scrolle directement sur cette section (#180 : CTA
   *  « Personnaliser » de l'écran de présentation). */
  scrollTarget?: 'ots' | null;
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
    onTheSpotEnabled,
    onSetOnTheSpotEnabled,
    onTheSpotMinPerDay,
    onSetOnTheSpotMinPerDay,
    onTheSpotMaxPerDay,
    onSetOnTheSpotMaxPerDay,
    onTheSpotWindowStart,
    onSetOnTheSpotWindowStart,
    onTheSpotWindowEnd,
    onSetOnTheSpotWindowEnd,
    scrollTarget = null,
    diagnostics = null,
  } = props;

  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Scroll ciblé sur la section « Sur le fait » (CTA « Personnaliser », #180) :
  // la position est mesurée au layout de la section, le scroll part une fois le
  // modal posé, puis la carte CLIGNOTE (2 pulsations) : le pattern natif Android
  // « scroll puis highlight de la ligne ». Aucun setState : règle #136 sereine.
  const scrollRef = useRef<ScrollView>(null);
  const otsSectionY = useRef(0);
  const otsHighlight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible || scrollTarget !== 'ots') return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, otsSectionY.current - 12), animated: true });
    }, 300);
    const blink = setTimeout(() => {
      otsHighlight.setValue(0);
      Animated.sequence([
        Animated.timing(otsHighlight, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(otsHighlight, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(otsHighlight, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(otsHighlight, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 900);
    return () => {
      clearTimeout(timer);
      clearTimeout(blink);
    };
  }, [visible, scrollTarget, otsHighlight]);
  const [copied, setCopied] = useState(false);
  const [journal, setJournal] = useState<CrashEntry[]>([]);
  const [journalCopied, setJournalCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const journalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charge le journal d'erreurs local à chaque ouverture de l'écran.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void readCrashJournal().then((entries) => {
      if (active) setJournal(entries);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(
    () => () => {
      if (resetTimer.current != null) clearTimeout(resetTimer.current);
      if (journalTimer.current != null) clearTimeout(journalTimer.current);
    },
    [],
  );

  const onCopyJournal = useCallback(() => {
    haptics.selection();
    void Clipboard.setStringAsync(formatCrashJournal(journal));
    setJournalCopied(true);
    if (journalTimer.current != null) clearTimeout(journalTimer.current);
    journalTimer.current = setTimeout(() => setJournalCopied(false), 1800);
  }, [journal]);

  const onClearJournal = useCallback(() => {
    haptics.selection();
    void clearCrashJournal();
    setJournal([]);
  }, []);

  const onCopy = useCallback(() => {
    haptics.selection();
    void Clipboard.setStringAsync(buildDeviceReport(diagnostics));
    setCopied(true);
    if (resetTimer.current != null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [diagnostics]);

  // Une ligne (icône + libellé/description + interrupteur M3). Sans arrondi propre :
  // c'est la CARTE de section (voir `card`) qui porte les coins arrondis.
  // TOUTE la ligne est pressable et forme UN SEUL élément TalkBack (rôle switch,
  // libellé + description) ; le M3Switch interne devient décoratif (#163).
  const rowSwitch = (
    icon: IconName,
    label: string,
    value: boolean,
    onValueChange: () => void,
    desc?: string,
  ): React.ReactElement => (
    <Pressable
      style={styles.cardRow}
      onPress={onValueChange}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={desc != null ? `${label}. ${desc}` : label}
    >
      <MaterialIcons name={icon} size={22} color={colors.onSurfaceVariant} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc != null && <Text style={styles.desc}>{desc}</Text>}
      </View>
      <View importantForAccessibility="no-hide-descendants">
        <M3Switch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );

  // Regroupe les lignes d'une section dans UNE carte arrondie, séparées par des
  // dividers (comme l'app Appareil photo : arrondi au niveau du groupe, pas de
  // chaque item).
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

  // Raccourci volontaire vers la fiche Play (#183) : complément du one-shot
  // In-App Review (#179), qui n'est pas déclenchable à la demande (quotas Play).
  const rateRow = (
    <Pressable
      style={styles.cardRow}
      onPress={() => {
        void Linking.openURL('market://details?id=fr.devitek.twinlens').catch(() =>
          Linking.openURL('https://play.google.com/store/apps/details?id=fr.devitek.twinlens'),
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={t('settings.rateApp')}
    >
      <MaterialIcons name="star-rate" size={22} color={colors.onSurfaceVariant} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowLabel}>{t('settings.rateApp')}</Text>
      </View>
      <MaterialIcons name="open-in-new" size={18} color={colors.onSurfaceVariant} />
    </Pressable>
  );

  // --- Section « Sur le fait » (#180) : opt-in + cadence + plage horaire. ---
  const otsPerDayOptions = OTS_PER_DAY_VALUES.map((v) => ({ value: String(v), label: String(v) }));
  const otsStartOptions = OTS_WINDOW_START_VALUES.map((v) => ({ value: String(v), label: `${v}:00` }));
  const otsEndOptions = OTS_WINDOW_END_VALUES.map((v) => ({ value: String(v), label: `${v}:00` }));

  const otsRows: React.ReactNode[] = [
    rowSwitch(
      'notifications-active',
      t('ots.enable'),
      onTheSpotEnabled,
      () => onSetOnTheSpotEnabled(!onTheSpotEnabled),
      t('ots.enableDesc'),
    ),
  ];
  if (onTheSpotEnabled) {
    otsRows.push(
      <View style={styles.cardRowCol}>
        <View style={styles.rowHeader}>
          <MaterialIcons name="today" size={22} color={colors.onSurfaceVariant} />
          <Text style={styles.rowLabel}>{t('ots.perDayMin')}</Text>
        </View>
        <Segmented
          options={otsPerDayOptions}
          value={String(onTheSpotMinPerDay)}
          onChange={(v) => onSetOnTheSpotMinPerDay(Number(v) as OtsPerDay)}
        />
      </View>,
      <View style={styles.cardRowCol}>
        <View style={styles.rowHeader}>
          <MaterialIcons name="add-task" size={22} color={colors.onSurfaceVariant} />
          <View style={styles.rowTexts}>
            <Text style={styles.rowLabel}>{t('ots.perDayMax')}</Text>
            <Text style={styles.desc}>{t('ots.perDayMaxDesc')}</Text>
          </View>
        </View>
        <Segmented
          options={otsPerDayOptions}
          value={String(onTheSpotMaxPerDay)}
          onChange={(v) => onSetOnTheSpotMaxPerDay(Number(v) as OtsPerDay)}
        />
      </View>,
      <View style={styles.cardRowCol}>
        <View style={styles.rowHeader}>
          <MaterialIcons name="schedule" size={22} color={colors.onSurfaceVariant} />
          <Text style={styles.rowLabel}>{t('ots.windowStart')}</Text>
        </View>
        <Segmented
          options={otsStartOptions}
          value={String(onTheSpotWindowStart)}
          onChange={(v) => onSetOnTheSpotWindowStart(Number(v) as OtsWindowStart)}
        />
      </View>,
      <View style={styles.cardRowCol}>
        <View style={styles.rowHeader}>
          <MaterialIcons name="schedule" size={22} color={colors.onSurfaceVariant} />
          <Text style={styles.rowLabel}>{t('ots.windowEnd')}</Text>
        </View>
        <Segmented
          options={otsEndOptions}
          value={String(onTheSpotWindowEnd)}
          onChange={(v) => onSetOnTheSpotWindowEnd(Number(v) as OtsWindowEnd)}
        />
      </View>,
    );
  }

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

  const journalRow = (
    <View style={styles.cardRowCol}>
      <View style={styles.rowHeader}>
        <MaterialIcons name="report-problem" size={22} color={colors.onSurfaceVariant} />
        <View style={styles.rowTexts}>
          <Text style={styles.rowLabel}>{t('settings.errorJournal')}</Text>
          <Text style={styles.desc}>
            {journal.length === 0
              ? t('settings.journalEmpty')
              : t('settings.journalEntries', { count: journal.length })}
          </Text>
        </View>
      </View>
      {journal.length > 0 && (
        <View style={styles.journalActions}>
          <Pressable onPress={onCopyJournal} style={styles.copyBtn} hitSlop={8} accessibilityRole="button">
            <MaterialIcons
              name={journalCopied ? 'check' : 'content-copy'}
              size={16}
              color={colors.onSecondaryContainer}
            />
            <Text style={styles.copyText}>{journalCopied ? t('settings.copied') : t('settings.copyJournal')}</Text>
          </Pressable>
          <Pressable onPress={onClearJournal} style={styles.clearBtn} hitSlop={8} accessibilityRole="button">
            <Text style={styles.clearText}>{t('settings.clearJournal')}</Text>
          </Pressable>
        </View>
      )}
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

        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.section}>{t('settings.catGeneral')}</Text>
          {card([
            rowSwitch(
              'volume-off',
              t('settings.shutterSound'),
              shutterSound,
              onToggleShutterSound,
              t('settings.shutterSoundDesc'),
            ),
            volumeRow,
            rowSwitch('location-on', t('settings.geotag'), geotag, onToggleGeotag, t('settings.geotagDesc')),
          ])}

          <Text style={styles.section}>{t('settings.catComposition')}</Text>
          {card([
            rowSwitch('grid-on', t('settings.grid'), grid, onToggleGrid),
            rowSwitch('straighten', t('settings.level'), level, onToggleLevel, t('settings.levelDesc')),
            rowSwitch(
              'flip',
              t('settings.mirrorFront'),
              mirrorFront,
              onToggleMirrorFront,
              t('settings.mirrorFrontDesc'),
            ),
            rowSwitch(
              'branding-watermark',
              t('settings.watermark'),
              watermark,
              onToggleWatermark,
              t('settings.watermarkDesc'),
            ),
          ])}

          <Text style={styles.section}>{t('settings.catCapture')}</Text>
          {card([
            rowSwitch(
              'blur-off',
              t('settings.stabilization'),
              stabilization,
              onToggleStabilization,
              t('settings.stabilizationDesc'),
            ),
          ])}

          <View
            onLayout={(e) => {
              otsSectionY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.section}>{t('ots.title')}</Text>
            <View>
              {card(otsRows)}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.sectionHighlight,
                  { opacity: otsHighlight.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }) },
                ]}
              />
            </View>
          </View>

          <Text style={styles.section}>{t('settings.catHelp')}</Text>
          {card([rateRow, reportRow, journalRow])}

          <Text style={styles.version}>
            {t('settings.version')} {APP_VERSION}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
    // Carte de SECTION : un seul bloc arrondi qui regroupe plusieurs lignes,
    // séparées par des « gaps » (couleur de fond) — coins arrondis au groupe, pas
    // à chaque item (comme l'app Appareil photo).
    card: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 24,
      overflow: 'hidden',
      marginBottom: 8,
    },
    divider: { height: 3, backgroundColor: colors.surface },
    /* Flash de mise en avant (pattern natif Android) sur la carte ciblée. */
    sectionHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 8,
      borderRadius: 24,
      backgroundColor: colors.primary,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 16 },
    cardRowCol: { paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    rowTexts: { flex: 1, gap: 2 },
    rowLabel: { color: colors.onSurface, fontSize: 16 },
    desc: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 16 },
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
    journalActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    clearBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
    clearText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
    version: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 24, textAlign: 'center' },
  });
