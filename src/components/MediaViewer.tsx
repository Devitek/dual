import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type DimensionValue,
  Image,
  PanResponder,
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
import { useEvent } from 'expo';

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

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Visionneuse média plein écran (photos, vidéos, boomerangs), gestes façon
 * Google Photos : bas = fermer, haut = détails, gauche/droite = naviguer. La
 * vidéo se lit en ligne avec des contrôles custom (play/pause + barre de
 * progression seekable) qui n'interceptent pas les gestes ; un toucher affiche/
 * masque les contrôles.
 */
export function MediaViewer({ media, index, onIndexChange, onClose, onShare, posters }: MediaViewerProps): React.ReactElement | null {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [cur, setCur] = useState(index);
  const [info, setInfo] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const curRef = useRef(index);
  const offsetX = useRef(new Animated.Value(-index * W)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const axis = useRef<null | 'x' | 'y'>(null);

  const item = media[cur] ?? null;
  const isVideo = item?.kind === 'video';

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });

  const timeEvent = useEvent(player, 'timeUpdate');
  const playEvent = useEvent(player, 'playingChange', { isPlaying: false, oldIsPlaying: false });
  const isPlaying = playEvent.isPlaying;
  const pos = timeEvent?.currentTime ?? 0;
  const dur = player.duration || 0;

  // Charge/lit la vidéo courante ; met en pause quand la page courante est une photo.
  useEffect(() => {
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
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  // Barre de progression seekable (overlay hors du PanGestureHandler → pas de
  // conflit avec les gestes de navigation).
  const trackW = useRef(1);
  const scrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const d = player.duration;
        if (d > 0) player.currentTime = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackW.current)) * d;
      },
      onPanResponderMove: (e) => {
        const d = player.duration;
        if (d > 0) player.currentTime = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackW.current)) * d;
      },
    }),
  ).current;

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
        setChrome((c) => !c); // tap → affiche/masque les contrôles
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
    [goTo, media.length, onClose, resetY, ty],
  );

  if (item == null) return null;

  const dateStr = new Date(item.createdAt).toLocaleString(i18n.language);
  const progressPct: DimensionValue = dur > 0 ? `${Math.min(100, (pos / dur) * 100)}%` : '0%';

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

      {/* Barre du haut : compteur (centre) + partager (droite). */}
      {chrome && (
        <View style={[styles.topBar, { top: Math.max(insets.top + 8, 40) }]}>
          <View style={styles.topSide} />
          {media.length > 1 ? (
            <Text style={styles.counter}>
              {cur + 1} / {media.length}
            </Text>
          ) : (
            <View />
          )}
          <View style={styles.topSide}>
            <Pressable
              onPress={() => onShare(item)}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('gallery.share')}
            >
              <MaterialIcons name="share" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {/* Contrôles vidéo : play/pause + barre de progression seekable. */}
      {chrome && isVideo && (
        <View style={[styles.controls, { bottom: Math.max(insets.bottom + 16, 30) }]}>
          <Pressable onPress={togglePlay} style={styles.playBtn} hitSlop={8} accessibilityRole="button">
            <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={26} color="#fff" />
          </Pressable>
          <View
            style={styles.track}
            onLayout={(e) => {
              trackW.current = e.nativeEvent.layout.width || 1;
            }}
            {...scrubPan.panHandlers}
          >
            <View style={styles.trackBg} />
            <View style={[styles.trackFill, { width: progressPct }]} />
          </View>
          <Text style={styles.time}>
            {fmtTime(pos)} / {fmtTime(dur)}
          </Text>
        </View>
      )}

      {info && (
        <>
          <Pressable style={styles.infoScrim} onPress={() => setInfo(false)} />
          <View style={[styles.infoSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.infoHandle} />
            <Text style={styles.infoTitle}>{t('gallery.infoTitle')}</Text>
            <InfoRow icon="event" label={t('gallery.infoDate')} value={dateStr} styles={styles} colors={colors} />
            {item.kind === 'video' ? (
              <InfoRow icon="schedule" label={t('gallery.infoDuration')} value={fmtTime((item.durationMs ?? 0) / 1000)} styles={styles} colors={colors} />
            ) : (
              <InfoRow
                icon="aspect-ratio"
                label={t('gallery.infoResolution')}
                value={dims != null ? `${dims.w} × ${dims.h}` : '—'}
                styles={styles}
                colors={colors}
              />
            )}
            <InfoRow icon="sd-storage" label={t('gallery.infoSize')} value={formatBytes(getFileSize(item.primaryUri))} styles={styles} colors={colors} />
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
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topSide: { minWidth: 44, alignItems: 'flex-end' },
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
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  playBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 34, justifyContent: 'center' },
  trackBg: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  time: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 74, textAlign: 'right' },
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
