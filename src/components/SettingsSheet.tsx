import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import type { CaptureQuality, SaveMode } from '../vision/MultiCamController';
import type { PipCorner } from '../services/pipComposer';
import type { PhotoFlashMode } from './CameraTopBar';

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
  quality: CaptureQuality;
  onSetQuality: (quality: CaptureQuality) => void;
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
  quality,
  onSetQuality,
}: SettingsSheetProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();

  const saveOptions = SAVE_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const flashOptions = FLASH_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const qualityOptions = QUALITY_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey), caption: o.caption }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('settings.title')}</Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Caméra */}
          <Text style={styles.section}>{t('settings.sectionCamera')}</Text>
          <Pressable
            onPress={() => {
              onSwap();
              onClose();
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

          <Text style={styles.section}>{t('settings.sectionPipCorner')}</Text>
          <CornerPicker value={pipCorner} onChange={onSetPipCorner} />

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
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '86%',
  },
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
