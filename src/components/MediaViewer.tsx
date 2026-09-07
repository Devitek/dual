import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import { getFileSize } from '../utils/fileSystem';
import type { CapturedMedia } from '../vision/MultiCamController';

const { width: W, height: H } = Dimensions.get('window');
const DISMISS_Y = 140;
const INFO_Y = 90;
const NAV_X = W / 4;
const NAV_V = 700;

const keyOf = (m: CapturedMedia): string => `${m.kind}-${m.createdAt}`;

interface MediaViewerProps {
  media: CapturedMedia[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onShare: (item: CapturedMedia) => void;
  /** Posters (vignettes) des vidéos, indexés par `keyOf`. */
  posters: Record<string, string>;
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms?: number): string {
  if (ms == null || ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Visionneuse média plein écran (photos, vidéos, boomerangs), gestes façon
 * Google Photos : bas = fermer, haut = détails, gauche/droite = naviguer. La
 * vidéo se lit en ligne (sans contrôles natifs, pour laisser passer les gestes) ;
 * un toucher met en pause / reprend.
 */
export function MediaViewer({ media, index, onIndexChange, onClose, onShare, posters }: MediaViewerProps): React.ReactElement | null {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [cur, setCur] = useState(index);
  const [info, setInfo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const curRef = useRef(index);
  const offsetX = useRef(new Animated.Value(-index * W)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const axis = useRef<null | 'x' | 'y'>(null);

  const item = media[cur] ?? null;
  const isVideo = item?.kind === 'video';

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // Charge/lit la vidéo courante ; met en pause quand la page courante est une photo.
  useEffect(() => {
    setPaused(false);
    if (item != null && item.kind === 'video') {
      player.loop = item.boomerang === true;
      player.replaceAsync(item.primaryUri).then(() => player.play()).catch(() => {});
    } else {
      player.pause();
    }
  }, [item, player]);

  // Dimensions réelles (photos uniquement) pour l'écran d'infos.
  useEffect(() => {
    setDims(null);
    if (item == null || item.kind !== 'photo') return;
    let active = true;
    Image.getSize(
      item.primaryUri,
      (w, h) => {
        if (active) setDims({ w, h });
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [item]);

  const backdropOpacity = ty.interpolate({
    inputRange: [-H, 0, H],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  const goTo = useCallback(
    (target: number) => {
      curRef.current = target;
      setCur(target);
      onIndexChange(target);
      Animated.spring(offsetX, { toValue: -target * W, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
    },
    [offsetX, onIndexChange],
  );

  const resetY = useCallback(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }, [ty]);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
      setPaused(true);
    } else {
      player.play();
      setPaused(false);
    }
  }, [player]);

  const onGesture = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = e.nativeEvent;
      if (axis.current == null) {
        if (Math.abs(translationX) > 6 || Math.abs(translationY) > 6) {
          axis.current = Math.abs(translationX) > Math.abs(translationY) ? 'x' : 'y';
        } else {
          return;
        }
      }
      if (axis.current === 'x') {
        let dx = translationX;
        const atStart = curRef.current === 0 && dx > 0;
        const atEnd = curRef.current === media.length - 1 && dx < 0;
        if (atStart || atEnd) dx *= 0.35;
        offsetX.setValue(-curRef.current * W + dx);
      } else {
        ty.setValue(translationY);
      }
    },
    [offsetX, ty, media.length],
  );

  const onState = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      const { translationX, translationY, velocityX, velocityY } = e.nativeEvent;
      const a = axis.current;
      axis.current = null;

      if (a == null) {
        // Tap : lecture/pause sur une vidéo.
        if (media[curRef.current]?.kind === 'video') togglePlay();
        return;
      }

      if (a === 'y') {
        if (translationY > DISMISS_Y || velocityY > 1000) {
          Animated.timing(ty, { toValue: H, duration: 180, useNativeDriver: false }).start(() => onClose());
          return;
        }
        if (translationY < -INFO_Y) {
          haptics.selection();
          setInfo(true);
        }
        resetY();
        return;
      }

      const i = curRef.current;
      let target = i;
      if ((translationX < -NAV_X || velocityX < -NAV_V) && i < media.length - 1) target = i + 1;
      else if ((translationX > NAV_X || velocityX > NAV_V) && i > 0) target = i - 1;
      goTo(target);
    },
    [goTo, media, onClose, resetY, togglePlay, ty],
  );

  if (item == null) return null;

  const dateStr = new Date(item.createdAt).toLocaleString(i18n.language);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      <PanGestureHandler onGestureEvent={onGesture} onHandlerStateChange={onState}>
        <Animated.View
          style={[styles.strip, { width: media.length * W, transform: [{ translateX: offsetX }, { translateY: ty }] }]}
        >
          {media.map((m, i) => {
            const poster = posters[keyOf(m)];
            return (
              <View key={keyOf(m)} style={styles.page}>
                {m.kind === 'photo' ? (
                  <Image source={{ uri: m.primaryUri }} style={styles.media} resizeMode="contain" />
                ) : i === cur ? (
                  <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} />
                ) : poster != null ? (
                  <Image source={{ uri: poster }} style={styles.media} resizeMode="contain" />
                ) : (
                  <View style={[styles.media, styles.videoPlaceholder]}>
                    <MaterialIcons name="movie" size={44} color={colors.onSurfaceVariant} />
                  </View>
                )}
                {m.kind === 'video' && i !== cur && (
                  <View style={styles.playBadge} pointerEvents="none">
                    <MaterialIcons name="play-arrow" size={30} color="#fff" />
                  </View>
                )}
              </View>
            );
          })}
        </Animated.View>
      </PanGestureHandler>

      {/* Icône lecture au centre quand la vidéo courante est en pause. */}
      {isVideo && paused && (
        <View style={styles.centerPlay} pointerEvents="none">
          <MaterialIcons name="play-arrow" size={44} color="#fff" />
        </View>
      )}

      {media.length > 1 && (
        <View style={[styles.topBar, { top: Math.max(insets.top + 8, 40) }]} pointerEvents="none">
          <Text style={styles.counter}>
            {cur + 1} / {media.length}
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.shareFab, { bottom: Math.max(insets.bottom + 20, 36) }]}
        onPress={() => onShare(item)}
        accessibilityRole="button"
        accessibilityLabel={t('gallery.share')}
      >
        <MaterialIcons name="share" size={20} color={colors.onPrimary} />
        <Text style={styles.shareFabText}>{t('gallery.share')}</Text>
      </Pressable>

      {info && (
        <>
          <Pressable style={styles.infoScrim} onPress={() => setInfo(false)} />
          <View style={[styles.infoSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.infoHandle} />
            <Text style={styles.infoTitle}>{t('gallery.infoTitle')}</Text>
            <InfoRow icon="event" label={t('gallery.infoDate')} value={dateStr} styles={styles} colors={colors} />
            {item.kind === 'video' ? (
              <InfoRow
                icon="schedule"
                label={t('gallery.infoDuration')}
                value={formatDuration(item.durationMs)}
                styles={styles}
                colors={colors}
              />
            ) : (
              <InfoRow
                icon="aspect-ratio"
                label={t('gallery.infoResolution')}
                value={dims != null ? `${dims.w} × ${dims.h}` : '—'}
                styles={styles}
                colors={colors}
              />
            )}
            <InfoRow
              icon="sd-storage"
              label={t('gallery.infoSize')}
              value={formatBytes(getFileSize(item.primaryUri))}
              styles={styles}
              colors={colors}
            />
            <InfoRow
              icon="picture-in-picture-alt"
              label={t('gallery.infoDual')}
              value={item.secondaryUri != null ? t('gallery.yes') : t('gallery.no')}
              styles={styles}
              colors={colors}
            />
          </View>
        </>
      )}
    </GestureHandlerRootView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  styles,
  colors,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <MaterialIcons name={icon} size={20} color={colors.onSurfaceVariant} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { ...FILL },
  backdrop: { ...FILL, backgroundColor: '#000' },
  strip: { flexDirection: 'row', height: '100%' },
  page: { width: W, height: '100%', alignItems: 'center', justifyContent: 'center' },
  media: { width: W, height: '86%' },
  videoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainer },
  playBadge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlay: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    marginTop: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  counter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  shareFab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 26,
    backgroundColor: colors.primary,
  },
  shareFabText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  infoScrim: { ...FILL, backgroundColor: 'rgba(0,0,0,0.35)' },
  infoSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  infoHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline, marginBottom: 12 },
  infoTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  infoLabel: { color: colors.onSurfaceVariant, fontSize: 14, flex: 1 },
  infoValue: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
});
