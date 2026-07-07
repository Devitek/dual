import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import type { CapturedMedia } from '../vision/MultiCamController';

interface CaptureControlsProps {
  isRecording: boolean;
  isBusy: boolean;
  onPhoto: () => void;
  onToggleRecording: () => void;
  lastCapture: CapturedMedia | null;
  /** true si une composition/sauvegarde tourne en arrière-plan. */
  processing?: boolean;
  /** Ouvre la revue de la dernière capture. */
  onOpenReview: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Barre de capture inférieure : [ miniature ] [ obturateur ] [ rec/stop ].
 * L'inversion de caméra est désormais dans le menu Paramètres (+ tap sur la vignette).
 */
export function CaptureControls({
  isRecording,
  isBusy,
  onPhoto,
  onToggleRecording,
  lastCapture,
  processing = false,
  onOpenReview,
}: CaptureControlsProps): React.ReactElement {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => clearInterval(id);
  }, [isRecording]);

  const shutterDisabled = isBusy || isRecording;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {isRecording && (
        <View style={styles.timer}>
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
        </View>
      )}

      <View style={styles.bar}>
        {/* Gauche : miniature de la dernière capture (+ indicateur de traitement) */}
        <View style={styles.zone}>
          {lastCapture != null ? (
            <Pressable
              style={({ pressed }) => [styles.thumbWrap, pressed && styles.pressed]}
              onPress={onOpenReview}
              accessibilityLabel="Voir les médias de la session"
            >
              {lastCapture.kind === 'photo' ? (
                <Image source={{ uri: lastCapture.primaryUri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <MaterialIcons name="play-arrow" size={22} color={colors.onSurface} />
                </View>
              )}
              {lastCapture.secondaryUri != null && (
                <View style={styles.dualBadge}>
                  <Text style={styles.dualBadgeText}>PiP</Text>
                </View>
              )}
              {processing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="small" color={colors.onSurface} />
                </View>
              )}
            </Pressable>
          ) : processing ? (
            <View style={[styles.thumbWrap, styles.processingEmpty]}>
              <ActivityIndicator color={colors.onSurface} />
            </View>
          ) : null}
        </View>

        {/* Centre : obturateur photo */}
        <View style={styles.zone}>
          <Pressable
            onPress={onPhoto}
            disabled={shutterDisabled}
            style={styles.shutterOuter}
            accessibilityLabel="Prendre une photo"
          >
            <View style={[styles.shutterInner, shutterDisabled && styles.shutterBusy]} />
          </Pressable>
        </View>

        {/* Droite : démarrer / arrêter la vidéo */}
        <View style={styles.zone}>
          <Pressable
            onPress={onToggleRecording}
            disabled={isBusy && !isRecording}
            style={({ pressed }) => [
              styles.recButton,
              pressed && styles.pressed,
              isBusy && !isRecording && styles.disabled,
            ]}
            accessibilityLabel={isRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
          >
            <View style={isRecording ? styles.recStop : styles.recCircle} />
          </Pressable>
        </View>
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
  timerText: { color: colors.onSurface, fontVariant: ['tabular-nums'], fontSize: 15, fontWeight: '600' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '86%',
  },
  zone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: colors.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.onSurface },
  shutterBusy: { opacity: 0.4 },
  recButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.danger },
  recStop: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.danger },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.onSurface,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  videoThumb: { backgroundColor: colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  dualBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  dualBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  processingEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
  },
});
