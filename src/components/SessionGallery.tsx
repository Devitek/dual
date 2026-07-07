import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import type { CapturedMedia } from '../vision/MultiCamController';

interface SessionGalleryProps {
  visible: boolean;
  captures: CapturedMedia[];
  onClose: () => void;
}

const COLS = 3;
const PADDING = 20;
const GAP = 8;

/**
 * Galerie des médias capturés pendant la session (affichage seul).
 * Les fichiers sont déjà enregistrés dans la pellicule ; ceci est juste un aperçu.
 */
export function SessionGallery({ visible, captures, onClose }: SessionGalleryProps): React.ReactElement {
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<CapturedMedia | null>(null);

  const data = [...captures].reverse(); // plus récent d'abord
  const cellSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Médias de la session</Text>
          <View style={styles.count}>
            <Text style={styles.countText}>{captures.length}</Text>
          </View>
          <View style={styles.spacer} />
          <Pressable onPress={onClose} style={styles.closeIcon} accessibilityLabel="Fermer">
            <MaterialIcons name="close" size={24} color={colors.onSurface} />
          </Pressable>
        </View>

        {data.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="photo-library" size={40} color={colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>Aucune capture pour l’instant.</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => `${item.kind}-${item.createdAt}`}
            numColumns={COLS}
            columnWrapperStyle={styles.rowGap}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.cell, { width: cellSize, height: cellSize }]}
                onPress={() => {
                  if (item.kind === 'photo') setPreview(item);
                }}
              >
                {item.kind === 'photo' ? (
                  <Image source={{ uri: item.primaryUri }} style={styles.cellImg} />
                ) : (
                  <View style={[styles.cellImg, styles.videoCell]}>
                    <MaterialIcons name="videocam" size={26} color={colors.onSurfaceVariant} />
                  </View>
                )}
                {item.secondaryUri != null && (
                  <View style={styles.pipBadge}>
                    <Text style={styles.pipBadgeText}>PiP</Text>
                  </View>
                )}
              </Pressable>
            )}
          />
        )}
      </View>

      {preview != null && (
        <Pressable style={styles.fullscreen} onPress={() => setPreview(null)}>
          <Image source={{ uri: preview.primaryUri }} style={styles.fullImg} resizeMode="contain" />
          <Text style={styles.tapHint}>Toucher pour fermer</Text>
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PADDING,
    paddingTop: 54,
    paddingBottom: 14,
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: colors.onSurfaceVariant, fontSize: 15 },
  list: { padding: PADDING, gap: GAP },
  rowGap: { gap: GAP },
  cell: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceContainer },
  cellImg: { width: '100%', height: '100%' },
  videoCell: { alignItems: 'center', justifyContent: 'center' },
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
  tapHint: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 14 },
});
