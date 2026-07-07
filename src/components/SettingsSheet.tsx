import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { haptics } from '../utils/haptics';
import type { CaptureQuality, SaveMode } from '../vision/MultiCamController';
import type { PipCorner } from '../services/pipComposer';
import type { PhotoFlashMode } from './CameraTopBar';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function Segmented<T extends string>({ options, value, onChange, disabled = false }: SegmentedProps<T>): React.ReactElement {
  return (
    <View style={[styles.segment, disabled && styles.dim]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => {
              haptics.selection();
              onChange(opt.value);
            }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SAVE_OPTIONS: Option<SaveMode>[] = [
  { value: 'pip', label: 'PiP' },
  { value: 'pip_plus_originals', label: 'PiP + 2' },
  { value: 'originals', label: '2 originaux' },
];

const FLASH_OPTIONS: Option<PhotoFlashMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
];

const CORNER_OPTIONS: Option<PipCorner>[] = [
  { value: 'top-left', label: '↖' },
  { value: 'top-right', label: '↗' },
  { value: 'bottom-right', label: '↘' },
  { value: 'bottom-left', label: '↙' },
];

const QUALITY_OPTIONS: Option<CaptureQuality>[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'Élevée' },
  { value: 'max', label: 'Max' },
];

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Paramètres</Text>

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
        <Segmented options={CORNER_OPTIONS} value={pipCorner} onChange={onSetPipCorner} />

        {/* Enregistrement */}
        <Text style={styles.section}>Enregistrement — Photo</Text>
        <Segmented options={SAVE_OPTIONS} value={photoSaveMode} onChange={onSetPhotoSaveMode} />

        <Text style={styles.section}>Enregistrement — Vidéo</Text>
        <Segmented options={SAVE_OPTIONS} value={videoSaveMode} onChange={onSetVideoSaveMode} />
        <Text style={styles.section}>Qualité</Text>
        <Segmented options={QUALITY_OPTIONS} value={quality} onChange={onSetQuality} />
        <Text style={styles.hint}>
          Ajuste résolution de capture + bitrate. Changer la qualité redémarre brièvement les caméras.
        </Text>

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segItemActive: { backgroundColor: colors.primary },
  segText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  segTextActive: { color: colors.onPrimary },
  hint: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 17, marginTop: 8 },
  closeBtn: {
    marginTop: 22,
    backgroundColor: colors.surfaceContainerHighest,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  closeText: { color: colors.onSurface, fontSize: 16, fontWeight: '600' },
});
