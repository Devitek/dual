import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../theme/colors';
import type { CapturedMedia } from '../hooks/useMultiCameraCapture';

interface CaptureControlsProps {
  isRecording: boolean;
  isBusy: boolean;
  /** true => le bouton d'inversion est actif (multi-cam dispo). */
  canSwap: boolean;
  onSwap: () => void;
  onPhoto: () => void;
  onToggleRecording: () => void;
  lastCapture: CapturedMedia | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Barre de contrôle inférieure :
 *  [ inverser ]   [ obturateur photo ]   [ rec / stop ]
 * + minuteur d'enregistrement et vignette de dernière capture.
 */
export function CaptureControls({
  isRecording,
  isBusy,
  canSwap,
  onSwap,
  onPhoto,
  onToggleRecording,
  lastCapture,
}: CaptureControlsProps): React.ReactElement {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [isRecording]);

  const shutterDisabled = isBusy || isRecording;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Minuteur d'enregistrement */}
      {isRecording && (
        <View style={styles.timer}>
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
        </View>
      )}

      <View style={styles.bar}>
        {/* Gauche : inverser les caméras */}
        <Pressable
          style={({ pressed }) => [
            styles.sideButton,
            (!canSwap || isRecording) && styles.disabled,
            pressed && styles.pressed,
          ]}
          onPress={onSwap}
          disabled={!canSwap || isRecording}
          accessibilityLabel="Inverser caméra principale et secondaire"
        >
          <Text style={styles.sideIcon}>⟲</Text>
        </Pressable>

        {/* Centre : obturateur photo */}
        <Pressable
          onPress={onPhoto}
          disabled={shutterDisabled}
          style={styles.shutterOuter}
          accessibilityLabel="Prendre une photo"
        >
          <View
            style={[styles.shutterInner, shutterDisabled && styles.shutterBusy]}
          />
        </Pressable>

        {/* Droite : démarrer / arrêter la vidéo */}
        <Pressable
          onPress={onToggleRecording}
          disabled={isBusy && !isRecording}
          style={({ pressed }) => [
            styles.recButton,
            pressed && styles.pressed,
            isBusy && !isRecording && styles.disabled,
          ]}
          accessibilityLabel={
            isRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"
          }
        >
          <View style={isRecording ? styles.recStop : styles.recCircle} />
        </Pressable>
      </View>

      {/* Vignette dernière capture */}
      <View style={styles.lastCaptureRow} pointerEvents="none">
        {lastCapture != null && (
          <View style={styles.thumbWrap}>
            {lastCapture.kind === 'photo' ? (
              <Image source={{ uri: lastCapture.primaryUri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.videoThumb]}>
                <Text style={styles.videoGlyph}>▶</Text>
              </View>
            )}
            {lastCapture.secondaryUri != null && (
              <View style={styles.dualBadge}>
                <Text style={styles.dualBadgeText}>2</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 42,
    alignItems: 'center',
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.overlayStrong,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 18,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  timerText: { color: colors.text, fontVariant: ['tabular-nums'], fontSize: 15, fontWeight: '600' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '78%',
  },
  sideButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideIcon: { color: colors.text, fontSize: 24, fontWeight: '700' },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.text,
  },
  shutterBusy: { opacity: 0.4 },
  recButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.danger },
  recStop: { width: 22, height: 22, borderRadius: 5, backgroundColor: colors.danger },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  lastCaptureRow: {
    position: 'absolute',
    left: 24,
    bottom: 52,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  videoThumb: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoGlyph: { color: colors.text, fontSize: 18 },
  dualBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dualBadgeText: { color: colors.text, fontSize: 11, fontWeight: '800' },
});
