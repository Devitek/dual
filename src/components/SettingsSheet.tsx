import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
            accessibilityLabel={`Vignette en ${corner}`}
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

const SAVE_OPTIONS: Option<SaveMode>[] = [
  { value: 'pip', label: 'PiP' },
  { value: 'pip_plus_originals', label: 'PiP + 2' },
  { value: 'originals', label: '2 fichiers' },
];

const FLASH_OPTIONS: Option<PhotoFlashMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
];

const QUALITY_OPTIONS: Option<CaptureQuality>[] = [
  { value: 'standard', label: 'Standard', caption: '1080p·720p' },
  { value: 'high', label: 'Élevée', caption: '1080p·1080p' },
  { value: 'max', label: 'Max', caption: '4K·1080p' },
];

/** Phrase explicative de l'option de sauvegarde active (photo ou vidéo). */
function saveModeDescription(mode: SaveMode, kind: 'photo' | 'video'): string {
  switch (mode) {
    case 'pip':
      return kind === 'video'
        ? 'Une vidéo fusionnée (ré-encodage à la fin de la prise).'
        : 'Une image fusionnée : arrière + vignette avant.';
    case 'pip_plus_originals':
      return 'La fusion + les 2 fichiers bruts.';
    case 'originals':
      return 'Les 2 fichiers séparés, sans fusion.';
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Paramètres</Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Caméra */}
          <Text style={styles.section}>Caméra</Text>
          <Pressable
            onPress={() => {
              onSwap();
              onClose();
            }}
            disabled={!canSwap}
            style={[styles.row, !canSwap && styles.dim]}
          >
            <MaterialIcons name="flip-camera-android" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>Inverser les caméras</Text>
          </Pressable>

          <View style={[styles.row, !torchSupported && styles.dim]}>
            <MaterialIcons name="flashlight-on" size={22} color={colors.onSurface} />
            <Text style={styles.rowLabel}>Torche</Text>
            <Switch
              value={torch}
              disabled={!torchSupported}
              onValueChange={onToggleTorch}
              trackColor={{ true: colors.primary, false: colors.outlineVariant }}
              thumbColor={colors.onPrimary}
            />
          </View>

          <View style={[styles.rowCol, !flashSupported && styles.dim]}>
            <View style={styles.rowHeader}>
              <MaterialIcons name="flash-on" size={22} color={colors.onSurface} />
              <Text style={styles.rowLabel}>Flash photo</Text>
            </View>
            <Segmented options={FLASH_OPTIONS} value={photoFlash} onChange={onSetPhotoFlash} disabled={!flashSupported} />
          </View>

          <Text style={styles.section}>Position de la vignette</Text>
          <CornerPicker value={pipCorner} onChange={onSetPipCorner} />

          {/* Enregistrement */}
          <Text style={styles.section}>Enregistrement — Photo</Text>
          <Segmented options={SAVE_OPTIONS} value={photoSaveMode} onChange={onSetPhotoSaveMode} />
          <Text style={styles.optDesc}>{saveModeDescription(photoSaveMode, 'photo')}</Text>

          <Text style={styles.section}>Enregistrement — Vidéo</Text>
          <Segmented options={SAVE_OPTIONS} value={videoSaveMode} onChange={onSetVideoSaveMode} />
          <Text style={styles.optDesc}>{saveModeDescription(videoSaveMode, 'video')}</Text>

          <Text style={styles.section}>Qualité</Text>
          <Segmented options={QUALITY_OPTIONS} value={quality} onChange={onSetQuality} />
          <Text style={styles.hint}>
            « Max » : photo en 4K, vidéo en 1080p. Changer la qualité redémarre brièvement les caméras.
          </Text>
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
