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

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import { getFileSize } from '../utils/fileSystem';
import type { CapturedMedia } from '../vision/MultiCamController';

const { width: W, height: H } = Dimensions.get('window');
const DISMISS_Y = 140; // seuil de fermeture (glisser vers le bas)
const INFO_Y = 90; // seuil d'ouverture des infos (glisser vers le haut)
const NAV_X = W / 4; // seuil de navigation
const NAV_V = 700; // vélocité de flick pour naviguer

interface PhotoViewerProps {
  photos: CapturedMedia[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onShare: (item: CapturedMedia) => void;
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Visionneuse photo plein écran, gestes façon Google Photos :
 *  - glisser vers le BAS : fermer ;
 *  - glisser vers le HAUT : afficher les détails (métadonnées) ;
 *  - glisser GAUCHE/DROITE : photo précédente / suivante (carrousel continu) ;
 *  - toucher : afficher/masquer les commandes (bouton Partager).
 */
export function PhotoViewer({ photos, index, onIndexChange, onClose, onShare }: PhotoViewerProps): React.ReactElement | null {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [cur, setCur] = useState(index);
  const [chrome, setChrome] = useState(true);
  const [info, setInfo] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const curRef = useRef(index);
  // Décalage horizontal de la bande (source de vérité de la position).
  const offsetX = useRef(new Animated.Value(-index * W)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const axis = useRef<null | 'x' | 'y'>(null);

  const item = photos[cur] ?? null;

  // Dimensions réelles de la photo courante (pour l'écran d'infos).
  useEffect(() => {
    setDims(null);
    if (item == null) return;
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
      Animated.spring(offsetX, {
        toValue: -target * W,
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [offsetX, onIndexChange],
  );

  const resetY = useCallback(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }, [ty]);

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
        // Résistance aux extrémités (pas de photo au-delà).
        let dx = translationX;
        const atStart = curRef.current === 0 && dx > 0;
        const atEnd = curRef.current === photos.length - 1 && dx < 0;
        if (atStart || atEnd) dx *= 0.35;
        offsetX.setValue(-curRef.current * W + dx);
      } else {
        ty.setValue(translationY);
      }
    },
    [offsetX, ty, photos.length],
  );

  const onState = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      const { translationX, translationY, velocityX, velocityY } = e.nativeEvent;
      const a = axis.current;
      axis.current = null;

      if (a == null) {
        // Simple tap → bascule les commandes.
        setChrome((c) => !c);
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

      // Horizontal : décide la cible selon distance OU vélocité.
      const i = curRef.current;
      let target = i;
      if ((translationX < -NAV_X || velocityX < -NAV_V) && i < photos.length - 1) target = i + 1;
      else if ((translationX > NAV_X || velocityX > NAV_V) && i > 0) target = i - 1;
      goTo(target);
    },
    [goTo, onClose, photos.length, resetY, ty],
  );

  if (item == null) return null;

  const dateStr = new Date(item.createdAt).toLocaleString(i18n.language);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      <PanGestureHandler onGestureEvent={onGesture} onHandlerStateChange={onState}>
        <Animated.View
          style={[
            styles.strip,
            { width: photos.length * W, transform: [{ translateX: offsetX }, { translateY: ty }] },
          ]}
        >
          {photos.map((p) => (
            <View key={`${p.kind}-${p.createdAt}`} style={styles.page}>
              <Image source={{ uri: p.primaryUri }} style={styles.img} resizeMode="contain" />
            </View>
          ))}
        </Animated.View>
      </PanGestureHandler>

      {chrome && photos.length > 1 && (
        <View style={[styles.topBar, { top: Math.max(insets.top + 8, 40) }]} pointerEvents="none">
          <Text style={styles.counter}>
            {cur + 1} / {photos.length}
          </Text>
        </View>
      )}

      {chrome && (
        <Pressable
          style={[styles.shareFab, { bottom: Math.max(insets.bottom + 20, 36) }]}
          onPress={() => onShare(item)}
          accessibilityRole="button"
          accessibilityLabel={t('gallery.share')}
        >
          <MaterialIcons name="share" size={20} color={colors.onPrimary} />
          <Text style={styles.shareFabText}>{t('gallery.share')}</Text>
        </Pressable>
      )}

      {info && (
        <>
          <Pressable style={styles.infoScrim} onPress={() => setInfo(false)} />
          <View style={[styles.infoSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.infoHandle} />
            <Text style={styles.infoTitle}>{t('gallery.infoTitle')}</Text>
            <InfoRow icon="event" label={t('gallery.infoDate')} value={dateStr} styles={styles} colors={colors} />
            <InfoRow
              icon="aspect-ratio"
              label={t('gallery.infoResolution')}
              value={dims != null ? `${dims.w} × ${dims.h}` : '—'}
              styles={styles}
              colors={colors}
            />
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
  img: { width: W, height: '86%' },
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
