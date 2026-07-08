import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import type { CapturedMedia } from '../vision/MultiCamController';

interface SessionGalleryProps {
  visible: boolean;
  captures: CapturedMedia[];
  onClose: () => void;
  /** Suppression d'une capture (session + galerie best-effort). */
  onDelete: (capture: CapturedMedia) => void | Promise<void>;
}

const COLS = 3;
const PADDING = 20;
const GAP = 8;

const keyOf = (item: CapturedMedia): string => `${item.kind}-${item.createdAt}`;

function formatDuration(ms?: number): string | null {
  if (ms == null || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Galerie des médias de la session : posters vidéo, lecture in-app, sélection
 * multiple (appui long) et actions Partager / Ouvrir / Supprimer.
 */
export function SessionGallery({ visible, captures, onClose, onDelete }: SessionGalleryProps): React.ReactElement {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [preview, setPreview] = useState<CapturedMedia | null>(null);
  const [playing, setPlaying] = useState<CapturedMedia | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [posters, setPosters] = useState<Record<string, string>>({});

  const data = [...captures].reverse(); // plus récent d'abord
  const cellSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  const player = useVideoPlayer(playing?.primaryUri ?? null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (playing != null) player.play();
  }, [playing, player]);

  // Réinitialise l'état transitoire à la fermeture de la galerie.
  useEffect(() => {
    if (visible) return;
    setPreview(null);
    setPlaying(null);
    setSelectMode(false);
    setSelected(new Set());
  }, [visible]);

  // Génère les posters des vidéos (best-effort).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      for (const item of captures) {
        if (item.kind !== 'video') continue;
        const k = keyOf(item);
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(item.primaryUri, { time: 500 });
          if (!active) return;
          setPosters((prev) => (prev[k] != null ? prev : { ...prev, [k]: uri }));
        } catch {
          /* fallback : carte neutre + icône */
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, captures]);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((item: CapturedMedia) => {
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const onCellPress = useCallback(
    (item: CapturedMedia) => {
      if (selectMode) {
        toggleSelect(item);
        return;
      }
      if (item.kind === 'photo') setPreview(item);
      else setPlaying(item);
    },
    [selectMode, toggleSelect],
  );

  const onCellLongPress = useCallback(
    (item: CapturedMedia) => {
      haptics.medium();
      setSelectMode(true);
      setSelected((prev) => new Set(prev).add(keyOf(item)));
    },
    [],
  );

  const selectedItems = data.filter((i) => selected.has(keyOf(i)));
  const firstSelected = selectedItems[0];

  const shareSelected = useCallback(async () => {
    if (firstSelected == null) return;
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(firstSelected.primaryUri);
    } catch {
      /* partage indisponible pour cette URI */
    }
  }, [firstSelected]);

  const openSelected = useCallback(async () => {
    if (firstSelected == null) return;
    const mime = firstSelected.kind === 'video' ? 'video/*' : 'image/*';
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: firstSelected.primaryUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: mime,
      });
    } catch {
      try {
        await Linking.openURL(firstSelected.primaryUri);
      } catch {
        /* aucun visualiseur disponible */
      }
    }
  }, [firstSelected]);

  const deleteSelected = useCallback(async () => {
    haptics.medium();
    const items = [...selectedItems];
    exitSelect();
    await Promise.all(items.map((i) => onDelete(i)));
  }, [selectedItems, exitSelect, onDelete]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 54) }]}>
          {selectMode ? (
            <>
              <Pressable onPress={exitSelect} style={styles.closeIcon} accessibilityLabel={t('gallery.cancelSelectionA11y')}>
                <MaterialIcons name="close" size={24} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.title}>{t('gallery.selected', { count: selected.size })}</Text>
              <View style={styles.spacer} />
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('gallery.title')}</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{captures.length}</Text>
              </View>
              <View style={styles.spacer} />
              <Pressable onPress={onClose} style={styles.closeIcon} accessibilityLabel={t('gallery.closeA11y')}>
                <MaterialIcons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </>
          )}
        </View>

        {!selectMode && data.length > 0 && (
          <View style={styles.savedChip}>
            <MaterialIcons name="cloud-done" size={15} color={colors.success} />
            <Text style={styles.savedChipText}>{t('gallery.savedChip')}</Text>
          </View>
        )}

        {data.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="photo-library" size={40} color={colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>{t('gallery.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={keyOf}
            numColumns={COLS}
            columnWrapperStyle={styles.rowGap}
            contentContainerStyle={styles.list}
            extraData={{ selectMode, sel: selected, posters }}
            renderItem={({ item }) => {
              const isSelected = selected.has(keyOf(item));
              const poster = item.kind === 'video' ? posters[keyOf(item)] : undefined;
              const dur = formatDuration(item.durationMs);
              return (
                <Pressable
                  style={[styles.cell, { width: cellSize, height: cellSize }, isSelected && styles.cellSelected]}
                  onPress={() => onCellPress(item)}
                  onLongPress={() => onCellLongPress(item)}
                  delayLongPress={300}
                >
                  {item.kind === 'photo' ? (
                    <Image source={{ uri: item.primaryUri }} style={styles.cellImg} />
                  ) : poster != null ? (
                    <Image source={{ uri: poster }} style={styles.cellImg} />
                  ) : (
                    <View style={[styles.cellImg, styles.videoCell]}>
                      <MaterialIcons name="videocam" size={26} color={colors.onSurfaceVariant} />
                    </View>
                  )}

                  {item.kind === 'video' && (
                    <>
                      <View style={styles.playBadge} pointerEvents="none">
                        <MaterialIcons name="play-arrow" size={22} color="#fff" />
                      </View>
                      {dur != null && (
                        <View style={styles.durBadge} pointerEvents="none">
                          <Text style={styles.durText}>{dur}</Text>
                        </View>
                      )}
                    </>
                  )}

                  {item.secondaryUri != null && (
                    <View style={styles.pipBadge} pointerEvents="none">
                      <Text style={styles.pipBadgeText}>PiP</Text>
                    </View>
                  )}

                  {selectMode && (
                    <View style={[styles.selMark, isSelected && styles.selMarkOn]} pointerEvents="none">
                      {isSelected && <MaterialIcons name="check" size={16} color={colors.onPrimary} />}
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {selectMode && selectedItems.length > 0 && (
          <View style={styles.actionBar}>
            <Pressable
              style={[styles.action, selectedItems.length !== 1 && styles.actionDim]}
              disabled={selectedItems.length !== 1}
              onPress={shareSelected}
            >
              <MaterialIcons name="share" size={22} color={colors.onSurface} />
              <Text style={styles.actionLabel}>{t('gallery.share')}</Text>
            </Pressable>
            <Pressable
              style={[styles.action, selectedItems.length !== 1 && styles.actionDim]}
              disabled={selectedItems.length !== 1}
              onPress={openSelected}
            >
              <MaterialIcons name="open-in-new" size={22} color={colors.onSurface} />
              <Text style={styles.actionLabel}>{t('gallery.open')}</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={deleteSelected}>
              <MaterialIcons name="delete-outline" size={22} color={colors.danger} />
              <Text style={[styles.actionLabel, styles.actionDanger]}>{t('gallery.delete')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Aperçu photo plein écran */}
      {preview != null && (
        <Pressable style={styles.fullscreen} onPress={() => setPreview(null)}>
          <Image source={{ uri: preview.primaryUri }} style={styles.fullImg} resizeMode="contain" />
          <Text style={styles.tapHint}>{t('gallery.closePhotoHint')}</Text>
        </Pressable>
      )}

      {/* Lecture vidéo plein écran */}
      {playing != null && (
        <View style={styles.fullscreen}>
          <VideoView style={styles.fullVideo} player={player} contentFit="contain" nativeControls />
          <Pressable
            style={styles.videoClose}
            onPress={() => {
              player.pause();
              setPlaying(null);
            }}
            accessibilityLabel={t('gallery.closeVideoA11y')}
          >
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PADDING,
    paddingTop: 54,
    paddingBottom: 12,
  },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '700' },
  count: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },
  spacer: { flex: 1 },
  closeIcon: { padding: 4 },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: PADDING,
    marginBottom: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(125,217,143,0.14)',
  },
  savedChipText: { color: colors.success, fontSize: 11.5, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: colors.onSurfaceVariant, fontSize: 15 },
  list: { padding: PADDING, gap: GAP },
  rowGap: { gap: GAP },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellSelected: { borderColor: colors.primary },
  cellImg: { width: '100%', height: '100%' },
  videoCell: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 34,
    height: 34,
    marginTop: -17,
    marginLeft: -17,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  durText: { color: '#fff', fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
  selMark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selMarkOn: { backgroundColor: colors.primary },
  actionBar: {
    flexDirection: 'row',
    marginHorizontal: PADDING,
    marginBottom: 28,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
  },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  actionDim: { opacity: 0.4 },
  actionLabel: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },
  actionDanger: { color: colors.danger },
  fullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImg: { width: '100%', height: '82%' },
  fullVideo: { width: '100%', height: '82%' },
  tapHint: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 14 },
  videoClose: {
    position: 'absolute',
    top: 46,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
