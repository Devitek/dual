import React, { useCallback, useEffect, useRef } from 'react';
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
  type ViewStyle,
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
import type { CaptureQuality, CaptureSpeed, SaveMode } from '../vision/MultiCamController';
import type { CompositionLayout, PipCorner } from '../services/pipComposer';
import type { PhotoFlashMode } from './CameraTopBar';
import type { VolumeKeyAction } from '../native/volumeKeys';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Micro-légende sur une 2e ligne (ex. résolutions pour la qualité). */
  caption?: string;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * Segmented buttons Material 3 : conteneur continu (bordure unique + séparateurs
 * internes), segment actif teinté `primaryContainer` avec icône coche.
 */
function Segmented<T extends string>({ options, value, onChange, disabled = false }: SegmentedProps<T>): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.segGroup, disabled && styles.dim]}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => {
              haptics.selection();
              onChange(opt.value);
            }}
            style={[styles.segCell, i > 0 && styles.segDivider, active && styles.segCellActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
          >
            <View style={styles.segLabelRow}>
              {active && <MaterialIcons name="check" size={15} color={colors.onPrimaryContainer} style={styles.segCheck} />}
              <Text style={[styles.segLabel, active && styles.segLabelActive]} numberOfLines={1}>
                {opt.label}
              </Text>
            </View>
            {opt.caption != null && (
              <Text style={[styles.segCaption, active && styles.segCaptionActive]} numberOfLines={1}>
                {opt.caption}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const CORNERS: PipCorner[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/** Position absolue du point dans le mini-téléphone selon le coin. */
function cornerDotStyle(corner: PipCorner): ViewStyle {
  const isTop = corner === 'top-left' || corner === 'top-right';
  const isLeft = corner === 'top-left' || corner === 'bottom-left';
  return {
    position: 'absolute',
    ...(isTop ? { top: 3 } : { bottom: 3 }),
    ...(isLeft ? { left: 3 } : { right: 3 }),
  };
}

interface CornerPickerProps {
  value: PipCorner;
  onChange: (corner: PipCorner) => void;
}

/** Sélecteur de coin de vignette sous forme de 4 mini-schémas de téléphone. */
function CornerPicker({ value, onChange }: CornerPickerProps): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <View style={styles.cornerRow}>
      {CORNERS.map((corner) => {
        const active = corner === value;
        return (
          <Pressable
            key={corner}
            onPress={() => {
              haptics.selection();
              onChange(corner);
            }}
            style={[styles.cornerCell, active && styles.cornerCellActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('settings.cornerA11y', { corner: t(CORNER_KEYS[corner]) })}
          >
            <View style={[styles.phone, active && styles.phoneActive]}>
              <View style={[styles.dot, active && styles.dotActive, cornerDotStyle(corner)]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const SAVE_OPTION_KEYS: { value: SaveMode; labelKey: string }[] = [
  { value: 'pip', labelKey: 'settings.savePip' },
  { value: 'pip_plus_originals', labelKey: 'settings.savePipPlus' },
  { value: 'originals', labelKey: 'settings.saveFiles' },
];

const FLASH_OPTION_KEYS: { value: PhotoFlashMode; labelKey: string }[] = [
  { value: 'off', labelKey: 'settings.flashOff' },
  { value: 'auto', labelKey: 'settings.flashAuto' },
  { value: 'on', labelKey: 'settings.flashOn' },
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

const LAYOUT_OPTION_KEYS: { value: CompositionLayout; labelKey: string }[] = [
  { value: 'pip', labelKey: 'settings.layoutPip' },
  { value: 'sideBySide', labelKey: 'settings.layoutSideBySide' },
  { value: 'topBottom', labelKey: 'settings.layoutTopBottom' },
];

// Les légendes de résolution ne se traduisent pas (specs techniques universelles).
const QUALITY_OPTION_KEYS: { value: CaptureQuality; labelKey: string; caption: string }[] = [
  { value: 'standard', labelKey: 'settings.qualityStandard', caption: '1080p·720p' },
  { value: 'high', labelKey: 'settings.qualityHigh', caption: '1080p·1080p' },
  { value: 'max', labelKey: 'settings.qualityMax', caption: '4K·1080p' },
];

const CORNER_KEYS: Record<PipCorner, string> = {
  'top-left': 'settings.cornerTopLeft',
  'top-right': 'settings.cornerTopRight',
  'bottom-right': 'settings.cornerBottomRight',
  'bottom-left': 'settings.cornerBottomLeft',
};

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
  canSwap: boolean;
  onSwap: () => void;
  torch: boolean;
  torchSupported: boolean;
  onToggleTorch: () => void;
  secondaryPreview: boolean;
  secondaryPreviewSupported: boolean;
  onToggleSecondaryPreview: () => void;
  photoFlash: PhotoFlashMode;
  flashSupported: boolean;
  onSetPhotoFlash: (mode: PhotoFlashMode) => void;
  photoSaveMode: SaveMode;
  onSetPhotoSaveMode: (mode: SaveMode) => void;
  videoSaveMode: SaveMode;
  onSetVideoSaveMode: (mode: SaveMode) => void;
  pipCorner: PipCorner;
  onSetPipCorner: (corner: PipCorner) => void;
  layout: CompositionLayout;
  onSetLayout: (layout: CompositionLayout) => void;
  quality: CaptureQuality;
  onSetQuality: (quality: CaptureQuality) => void;
  volumeKeyAction: VolumeKeyAction;
  onSetVolumeKeyAction: (action: VolumeKeyAction) => void;
  stabilization: boolean;
  onToggleStabilization: () => void;
  captureSpeed: CaptureSpeed;
  onSetCaptureSpeed: (speed: CaptureSpeed) => void;
  timerSeconds: number;
  onSetTimerSeconds: (seconds: 0 | 3 | 10) => void;
  shutterSound: boolean;
  onToggleShutterSound: () => void;
}

/** Feuille inférieure Material 3 des paramètres caméra + enregistrement. */
export function SettingsSheet({
  visible,
  onClose,
  canSwap,
  onSwap,
  torch,
  torchSupported,
  onToggleTorch,
  secondaryPreview,
  secondaryPreviewSupported,
  onToggleSecondaryPreview,
  photoFlash,
  flashSupported,
  onSetPhotoFlash,
  photoSaveMode,
  onSetPhotoSaveMode,
  videoSaveMode,
  onSetVideoSaveMode,
  pipCorner,
  onSetPipCorner,
  layout,
  onSetLayout,
  quality,
  onSetQuality,
  volumeKeyAction,
  onSetVolumeKeyAction,
  stabilization,
  onToggleStabilization,
  captureSpeed,
  onSetCaptureSpeed,
  timerSeconds,
  onSetTimerSeconds,
  shutterSound,
  onToggleShutterSound,
}: SettingsSheetProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Bottom sheet draggable (sans reanimated) : translateY (0 = ouvert, SCREEN_H =
  // fermé) piloté par le geste puis animé au relâchement. TOUT en JS-driven
  // (useNativeDriver:false) : `Animated.event` natif n'est pas accepté par
  // `onGestureEvent` de PanGestureHandler, et setValue depuis le geste ne doit
  // pas cohabiter avec des animations natives sur la même valeur.
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
    translateY.setValue(SCREEN_H);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 3, speed: 14 }).start();
  }, [visible, translateY]);

  // Suit le doigt vers le bas uniquement (clamp haut à 0).
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
      // Ferme si tiré suffisamment bas OU avec assez de vélocité ; sinon rebond.
      if (translationY > 120 || velocityY > 900) {
        dismiss();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 2, speed: 16 }).start();
      }
    },
    [dismiss, translateY],
  );

  const saveOptions = SAVE_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const flashOptions = FLASH_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const qualityOptions = QUALITY_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey), caption: o.caption }));
  const volumeKeyOptions: { value: VolumeKeyAction; label: string }[] = [
    { value: 'volume', label: t('settings.volKeyVolume') },
    { value: 'shutter', label: t('settings.volKeyShutter') },
    { value: 'zoom', label: t('settings.volKeyZoom') },
  ];
  const speedOptions = SPEED_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const timerOptions = TIMER_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const layoutOptions = LAYOUT_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));

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
          <PanGestureHandler
            onGestureEvent={onPanGesture}
            onHandlerStateChange={onPanStateChange}
            activeOffsetY={[-8, 8]}
          >
            <View style={styles.dragZone}>
              <View style={styles.handle} />
              <Text style={styles.title}>{t('settings.title')}</Text>
            </View>
          </PanGestureHandler>

          <ScrollView showsVerticalScrollIndicator={false}>
          {/* Caméra */}
          <Text style={styles.section}>{t('settings.sectionCamera')}</Text>
          <Pressable
            onPress={() => {
              onSwap();
              dismiss();
            }}
            disabled={!canSwap}
            style={[styles.row, !canSwap && styles.dim]}
          >
            <MaterialIcons name="flip-camera-android" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>{t('settings.swap')}</Text>
          </Pressable>

          <View style={[styles.row, !torchSupported && styles.dim]}>
            <MaterialIcons name="flashlight-on" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>{t('settings.torch')}</Text>
            <Switch
              value={torch}
              disabled={!torchSupported}
              onValueChange={onToggleTorch}
              trackColor={{ true: colors.primary, false: colors.outlineVariant }}
              thumbColor={colors.onPrimary}
            />
          </View>

          <View style={[styles.row, !secondaryPreviewSupported && styles.dim]}>
            <MaterialIcons name="picture-in-picture-alt" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>{t('settings.secondaryPreview')}</Text>
            <Switch
              value={secondaryPreview}
              disabled={!secondaryPreviewSupported}
              onValueChange={onToggleSecondaryPreview}
              trackColor={{ true: colors.primary, false: colors.outlineVariant }}
              thumbColor={colors.onPrimary}
            />
          </View>

          <View style={[styles.rowCol, !flashSupported && styles.dim]}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="flash-on" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.flashPhoto')}</Text>
            </View>
            <Segmented options={flashOptions} value={photoFlash} onChange={onSetPhotoFlash} disabled={!flashSupported} />
          </View>

          <View style={styles.rowCol}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="volume-up" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.volumeKeys')}</Text>
            </View>
            <Segmented options={volumeKeyOptions} value={volumeKeyAction} onChange={onSetVolumeKeyAction} />
          </View>

          {/* Capture : anti-flou, vitesse, retardateur */}
          <Text style={styles.section}>{t('settings.sectionCapture')}</Text>
          <View style={styles.row}>
            <MaterialIcons name="blur-off" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>{t('settings.stabilization')}</Text>
            <Switch
              value={stabilization}
              onValueChange={onToggleStabilization}
              trackColor={{ true: colors.primary, false: colors.outlineVariant }}
              thumbColor={colors.onPrimary}
            />
          </View>
          <Text style={styles.optDesc}>{t('settings.stabilizationDesc')}</Text>

          <View style={styles.rowCol}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="speed" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.captureSpeed')}</Text>
            </View>
            <Segmented options={speedOptions} value={captureSpeed} onChange={onSetCaptureSpeed} />
          </View>

          <View style={styles.rowCol}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="timer" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>{t('settings.timer')}</Text>
            </View>
            <Segmented
              options={timerOptions}
              value={String(timerSeconds) as '0' | '3' | '10'}
              onChange={(v) => onSetTimerSeconds(Number(v) as 0 | 3 | 10)}
            />
          </View>

          <View style={styles.row}>
            <MaterialIcons name="volume-off" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>{t('settings.shutterSound')}</Text>
            <Switch
              value={shutterSound}
              onValueChange={onToggleShutterSound}
              trackColor={{ true: colors.primary, false: colors.outlineVariant }}
              thumbColor={colors.onPrimary}
            />
          </View>
          <Text style={styles.optDesc}>{t('settings.shutterSoundDesc')}</Text>

          <Text style={styles.section}>{t('settings.sectionLayout')}</Text>
          <Segmented options={layoutOptions} value={layout} onChange={onSetLayout} />
          {layout === 'pip' && (
            <View style={styles.rowCol}>
              <Text style={styles.optDesc}>{t('settings.sectionPipCorner')}</Text>
              <CornerPicker value={pipCorner} onChange={onSetPipCorner} />
            </View>
          )}
          <Text style={styles.hint}>{t('settings.layoutHint')}</Text>

          {/* Enregistrement */}
          <Text style={styles.section}>{t('settings.sectionRecPhoto')}</Text>
          <Segmented options={saveOptions} value={photoSaveMode} onChange={onSetPhotoSaveMode} />
          <Text style={styles.optDesc}>{t(saveModeDescKey(photoSaveMode, 'photo'))}</Text>

          <Text style={styles.section}>{t('settings.sectionRecVideo')}</Text>
          <Segmented options={saveOptions} value={videoSaveMode} onChange={onSetVideoSaveMode} />
          <Text style={styles.optDesc}>{t(saveModeDescKey(videoSaveMode, 'video'))}</Text>

          <Text style={styles.section}>{t('settings.sectionQuality')}</Text>
          <Segmented options={qualityOptions} value={quality} onChange={onSetQuality} />
          <Text style={styles.hint}>{t('settings.qualityHint')}</Text>
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
    // overflow:hidden -> clippe le fond aux coins arrondis (sinon Android laisse
    // apparaître des coins carrés opaques au-dessus de l'arrondi).
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 12,
    // paddingBottom appliqué dynamiquement (safe-area) pour ne pas masquer les
    // dernières options sous la barre système (navigation 3 boutons).
    maxHeight: '86%',
  },
  dragZone: { paddingBottom: 4 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outline,
    marginBottom: 14,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  section: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  rowCol: { paddingVertical: 10, gap: 10 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowLabel: { color: colors.onSurface, fontSize: 16, flex: 1 },
  dim: { opacity: 0.4 },
  // Segmented (M3)
  segGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 18,
    overflow: 'hidden',
  },
  segCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segDivider: { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant },
  segCellActive: { backgroundColor: colors.primaryContainer },
  segLabelRow: { flexDirection: 'row', alignItems: 'center' },
  segCheck: { marginRight: 4 },
  segLabel: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  segLabelActive: { color: colors.onPrimaryContainer },
  segCaption: { color: colors.onSurfaceVariant, fontSize: 10.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  segCaptionActive: { color: colors.onPrimaryContainer },
  optDesc: { color: colors.onSurfaceVariant, fontSize: 11.5, marginTop: 7 },
  hint: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 17, marginTop: 8 },
  // Corner picker (mini-téléphones)
  cornerRow: { flexDirection: 'row', gap: 8 },
  cornerCell: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerCellActive: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  phone: {
    width: 22,
    height: 32,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.outline,
  },
  phoneActive: { borderColor: colors.primary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.outline },
  dotActive: { backgroundColor: colors.onPrimaryContainer },
});
