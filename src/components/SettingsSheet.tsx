import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import type { CaptureQuality, CaptureSpeed, SaveMode, VideoFps } from '../vision/MultiCamController';
import type { CompositionLayout, OutputRatio } from '../services/pipComposer';
import type { CaptureMode } from './ModeSwitch';
import { Segmented, type SegmentedOption } from './Segmented';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

// --- Options (libellés techniques universels non traduits, sinon clés i18n) ---
const SAVE_OPTION_KEYS: { value: SaveMode; labelKey: string }[] = [
  { value: 'pip', labelKey: 'settings.savePip' },
  { value: 'pip_plus_originals', labelKey: 'settings.savePipPlus' },
  { value: 'originals', labelKey: 'settings.saveFiles' },
];
const SPEED_OPTION_KEYS: { value: CaptureSpeed; labelKey: string }[] = [
  { value: 'speed', labelKey: 'settings.speedFast' },
  { value: 'balanced', labelKey: 'settings.speedBalanced' },
  { value: 'quality', labelKey: 'settings.speedQuality' },
];
const TIMER_OPTION_KEYS: { value: '0' | '3' | '10'; labelKey: string }[] = [
  { value: '0', labelKey: 'settings.timerOff' },
  { value: '3', labelKey: 'settings.timer3s' },
  { value: '10', labelKey: 'settings.timer10s' },
];
const BURST_OPTION_KEYS: { value: '1' | '3' | '5' | '10'; labelKey: string }[] = [
  { value: '1', labelKey: 'settings.burstOff' },
  { value: '3', labelKey: 'settings.burst3' },
  { value: '5', labelKey: 'settings.burst5' },
  { value: '10', labelKey: 'settings.burst10' },
];
const FPS_OPTION_KEYS: { value: '30' | '60'; label: string }[] = [
  { value: '30', label: '30' },
  { value: '60', label: '60' },
];
const LAYOUT_OPTION_KEYS: { value: CompositionLayout; labelKey: string }[] = [
  { value: 'pip', labelKey: 'settings.layoutPip' },
  { value: 'sideBySide', labelKey: 'settings.layoutSideBySide' },
  { value: 'topBottom', labelKey: 'settings.layoutTopBottom' },
];
const RATIO_OPTION_KEYS: { value: OutputRatio; labelKey: string }[] = [
  { value: 'full', labelKey: 'settings.ratioFull' },
  { value: 'square', labelKey: 'settings.ratioSquare' },
  { value: 'tall', labelKey: 'settings.ratioTall' },
];
const QUALITY_OPTION_KEYS: { value: CaptureQuality; labelKey: string; caption: string }[] = [
  { value: 'standard', labelKey: 'settings.qualityStandard', caption: '1080p·720p' },
  { value: 'high', labelKey: 'settings.qualityHigh', caption: '1080p·1080p' },
  { value: 'max', labelKey: 'settings.qualityMax', caption: '4K·1080p' },
];
// Format boomerang (technique, non traduit).
const BOOM_FORMAT_OPTIONS: SegmentedOption<'mp4' | 'gif'>[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'gif', label: 'GIF' },
];

/** Clé i18n de la description de l'option de sauvegarde active (photo ou vidéo). */
function saveModeDescKey(mode: SaveMode, kind: 'photo' | 'video'): string {
  switch (mode) {
    case 'pip':
      return kind === 'video' ? 'settings.descPipVideo' : 'settings.descPipPhoto';
    case 'pip_plus_originals':
      return 'settings.descPipPlus';
    case 'originals':
      return 'settings.descOriginals';
  }
}

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Ouvre l'écran plein « Autres réglages ». */
  onOpenMore: () => void;
  /** Mode courant : filtre les réglages pertinents (photo/vidéo/boomerang). */
  mode: CaptureMode;

  // --- Général ---
  torch: boolean;
  torchSupported: boolean;
  onToggleTorch: () => void;
  secondaryPreview: boolean;
  secondaryPreviewSupported: boolean;
  onToggleSecondaryPreview: () => void;
  layout: CompositionLayout;
  onSetLayout: (layout: CompositionLayout) => void;
  timerSeconds: number;
  onSetTimerSeconds: (seconds: 0 | 3 | 10) => void;
  burstCount: number;
  onSetBurstCount: (count: 1 | 3 | 5 | 10) => void;
  boomerangGif: boolean;
  onToggleBoomerangGif: () => void;

  // --- Pro ---
  quality: CaptureQuality;
  onSetQuality: (quality: CaptureQuality) => void;
  captureSpeed: CaptureSpeed;
  onSetCaptureSpeed: (speed: CaptureSpeed) => void;
  outputRatio: OutputRatio;
  onSetOutputRatio: (ratio: OutputRatio) => void;
  photoSaveMode: SaveMode;
  onSetPhotoSaveMode: (mode: SaveMode) => void;
  videoSaveMode: SaveMode;
  onSetVideoSaveMode: (mode: SaveMode) => void;
  videoFps: VideoFps;
  onSetVideoFps: (fps: VideoFps) => void;
}

type Tab = 'general' | 'pro';

/**
 * Feuille inférieure Material 3 des réglages RAPIDES (contextuels au mode), en
 * deux onglets Général / Pro. Les préférences réglées une fois vivent dans
 * l'écran plein « Autres réglages » (bouton `…`).
 */
export function SettingsSheet(props: SettingsSheetProps): React.ReactElement {
  const {
    visible,
    onClose,
    onOpenMore,
    mode,
    torch,
    torchSupported,
    onToggleTorch,
    secondaryPreview,
    secondaryPreviewSupported,
    onToggleSecondaryPreview,
    layout,
    onSetLayout,
    timerSeconds,
    onSetTimerSeconds,
    burstCount,
    onSetBurstCount,
    boomerangGif,
    onToggleBoomerangGif,
    quality,
    onSetQuality,
    captureSpeed,
    onSetCaptureSpeed,
    outputRatio,
    onSetOutputRatio,
    photoSaveMode,
    onSetPhotoSaveMode,
    videoSaveMode,
    onSetVideoSaveMode,
    videoFps,
    onSetVideoFps,
  } = props;

  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('general');
  // Indicateur d'onglet glissant (0 = Général, 1 = Pro) — ressort, façon native.
  const [tabsW, setTabsW] = useState(0);
  const indicator = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(indicator, {
      toValue: tab === 'general' ? 0 : 1,
      useNativeDriver: true,
      bounciness: 4,
      speed: 18,
    }).start();
  }, [tab, indicator]);
  const indicatorHalf = (tabsW - 6) / 2; // 6 = padding gauche+droite du conteneur (3+3)

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SCREEN_H],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [translateY, onClose]);

  useEffect(() => {
    if (!visible) return;
    setTab('general'); // repart sur Général à chaque ouverture (comme Google Camera)
    translateY.setValue(SCREEN_H);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 3, speed: 14 }).start();
  }, [visible, translateY]);

  const onPanGesture = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const ty = e.nativeEvent.translationY;
      translateY.setValue(ty > 0 ? ty : 0);
    },
    [translateY],
  );

  const onPanStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      const { translationY, velocityY } = e.nativeEvent;
      if (translationY > 120 || velocityY > 900) {
        dismiss();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 2, speed: 16 }).start();
      }
    },
    [dismiss, translateY],
  );

  // --- Options localisées ---
  const saveOptions = SAVE_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const speedOptions = SPEED_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const timerOptions = TIMER_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const burstOptions = BURST_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const fpsOptions = FPS_OPTION_KEYS.map((o) => ({ value: o.value, label: o.label }));
  const layoutOptions = LAYOUT_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const ratioOptions = RATIO_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const qualityOptions = QUALITY_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey), caption: o.caption }));

  // --- Helpers de rendu (row switch / row segmented) ---
  const rowSwitch = (
    icon: IconName,
    label: string,
    value: boolean,
    onValueChange: () => void,
    disabled = false,
  ): React.ReactElement => (
    <View style={[styles.row, disabled && styles.dim]}>
      <MaterialIcons name={icon} size={22} color={colors.onSurface} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.outlineVariant }}
        thumbColor={colors.onPrimary}
      />
    </View>
  );

  const rowSeg = (icon: IconName, label: string, seg: React.ReactNode, desc?: string): React.ReactElement => (
    <View style={styles.rowCol}>
      <View style={styles.rowHeader}>
        <MaterialIcons name={icon} size={22} color={colors.onSurface} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {seg}
      {desc != null && <Text style={styles.optDesc}>{desc}</Text>}
    </View>
  );

  const torchRow = rowSwitch('flashlight-on', t('settings.torch'), torch, onToggleTorch, !torchSupported);
  const previewRow = rowSwitch(
    'picture-in-picture-alt',
    t('settings.secondaryPreview'),
    secondaryPreview,
    onToggleSecondaryPreview,
    !secondaryPreviewSupported,
  );
  const layoutRow = rowSeg(
    'dashboard-customize',
    t('settings.layout'),
    <Segmented options={layoutOptions} value={layout} onChange={onSetLayout} />,
  );

  // --- Contenu Général selon le mode ---
  const renderGeneral = (): React.ReactElement => {
    if (mode === 'video') {
      return (
        <>
          {torchRow}
          {previewRow}
          {layoutRow}
        </>
      );
    }
    if (mode === 'boomerang') {
      return (
        <>
          {rowSeg(
            'gif',
            t('settings.boomerangFormat'),
            <Segmented
              options={BOOM_FORMAT_OPTIONS}
              value={boomerangGif ? 'gif' : 'mp4'}
              onChange={(v) => {
                if ((v === 'gif') !== boomerangGif) onToggleBoomerangGif();
              }}
            />,
          )}
          {torchRow}
          {previewRow}
        </>
      );
    }
    // photo
    return (
      <>
        {rowSeg(
          'timer',
          t('settings.timer'),
          <Segmented
            options={timerOptions}
            value={String(timerSeconds) as '0' | '3' | '10'}
            onChange={(v) => onSetTimerSeconds(Number(v) as 0 | 3 | 10)}
          />,
        )}
        {rowSeg(
          'burst-mode',
          t('settings.burst'),
          <Segmented
            options={burstOptions}
            value={String(burstCount) as '1' | '3' | '5' | '10'}
            onChange={(v) => onSetBurstCount(Number(v) as 1 | 3 | 5 | 10)}
          />,
          t('settings.burstDesc'),
        )}
        {torchRow}
        {previewRow}
        {layoutRow}
      </>
    );
  };

  // --- Contenu Pro selon le mode ---
  const qualityRow = rowSeg(
    'high-quality',
    t('settings.quality'),
    <Segmented options={qualityOptions} value={quality} onChange={onSetQuality} />,
    t('settings.qualityHint'),
  );
  const ratioRow =
    layout === 'pip'
      ? rowSeg(
          'aspect-ratio',
          t('settings.outputRatio'),
          <Segmented options={ratioOptions} value={outputRatio} onChange={onSetOutputRatio} />,
          t('settings.outputRatioDesc'),
        )
      : null;

  const renderPro = (): React.ReactElement => {
    if (mode === 'video') {
      return (
        <>
          {qualityRow}
          {rowSeg(
            '60fps-select',
            t('settings.videoFps'),
            <Segmented
              options={fpsOptions}
              value={String(videoFps) as '30' | '60'}
              onChange={(v) => onSetVideoFps(Number(v) as VideoFps)}
            />,
            t('settings.videoFpsDesc'),
          )}
          {ratioRow}
          {rowSeg(
            'save',
            t('settings.save'),
            <Segmented options={saveOptions} value={videoSaveMode} onChange={onSetVideoSaveMode} />,
            t(saveModeDescKey(videoSaveMode, 'video')),
          )}
        </>
      );
    }
    if (mode === 'boomerang') {
      return (
        <>
          {qualityRow}
          {rowSeg(
            'save',
            t('settings.save'),
            <Segmented options={saveOptions} value={videoSaveMode} onChange={onSetVideoSaveMode} />,
            t(saveModeDescKey(videoSaveMode, 'video')),
          )}
        </>
      );
    }
    // photo
    return (
      <>
        {qualityRow}
        {rowSeg(
          'speed',
          t('settings.captureSpeed'),
          <Segmented options={speedOptions} value={captureSpeed} onChange={onSetCaptureSpeed} />,
        )}
        {ratioRow}
        {rowSeg(
          'save',
          t('settings.save'),
          <Segmented options={saveOptions} value={photoSaveMode} onChange={onSetPhotoSaveMode} />,
          t(saveModeDescKey(photoSaveMode, 'photo')),
        )}
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdropPress} onPress={dismiss} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 12, 28), transform: [{ translateY }] },
          ]}
        >
          <PanGestureHandler onGestureEvent={onPanGesture} onHandlerStateChange={onPanStateChange} activeOffsetY={[-8, 8]}>
            <View style={styles.dragZone}>
              <View style={styles.handle} />
            </View>
          </PanGestureHandler>

          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('settings.title')}</Text>
            <Pressable
              onPress={() => {
                haptics.selection();
                onOpenMore();
              }}
              style={styles.moreBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('settings.more')}
            >
              <MaterialIcons name="more-horiz" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          {/* Onglets Général | Pro (indicateur glissant animé) */}
          <View style={styles.tabs} onLayout={(e) => setTabsW(e.nativeEvent.layout.width)}>
            {tabsW > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabIndicator,
                  {
                    width: indicatorHalf,
                    transform: [
                      {
                        translateX: indicator.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, indicatorHalf],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}
            {(['general', 'pro'] as Tab[]).map((tb) => {
              const active = tb === tab;
              return (
                <Pressable
                  key={tb}
                  onPress={() => {
                    haptics.selection();
                    setTab(tb);
                  }}
                  style={styles.tab}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {t(tb === 'general' ? 'settings.tabGeneral' : 'settings.tabPro')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {tab === 'general' ? renderGeneral() : renderPro()}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  gestureRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  backdropPress: { flex: 1 },
  sheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '86%',
  },
  dragZone: { paddingBottom: 4 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outline,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '700' },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 3,
    marginTop: 12,
    marginBottom: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 17,
    backgroundColor: colors.primaryContainer,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 17, alignItems: 'center' },
  tabLabel: { color: colors.onSurfaceVariant, fontSize: 14, fontWeight: '700' },
  tabLabelActive: { color: colors.onPrimaryContainer },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  rowCol: { paddingVertical: 10, gap: 10 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowLabel: { color: colors.onSurface, fontSize: 16, flex: 1 },
  dim: { opacity: 0.4 },
  optDesc: { color: colors.onSurfaceVariant, fontSize: 11.5, marginTop: 7 },
});
