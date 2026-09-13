import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { computeStreak, groupCallsByDay, refreshJournal, type OtsCall, type OtsDayGroup } from '../services/onTheSpot';
import { shareCapture } from '../services/shareMedia';
import { MediaViewer } from './MediaViewer';
import type { CapturedMedia } from '../vision/MultiCamController';

interface OnTheSpotGalleryProps {
  /** L'onglet est affiché (le parent gère la visibilité du modal). */
  visible: boolean;
  /** Feature activée ? Sinon : écran de présentation + CTA. */
  active: boolean;
  /** Activation depuis l'écran de présentation (permission incluse). */
  onEnable: () => void;
  /** Ouvre « Autres réglages » scrollé sur la section « Sur le fait ». */
  onCustomize: () => void;
}

/** Média de visionneuse dérivé d'un appel réussi. */
function mediaOf(call: OtsCall): CapturedMedia {
  return { kind: 'photo', primaryUri: call.mediaUri ?? '', secondaryUri: null, createdAt: call.scheduledAt };
}

/**
 * Onglet galerie « Sur le fait » (#180, chantier 4) : historique par jour
 * (aperçu + badge réussite / placeholder manqué / à venir), série + record,
 * filtre « réussites uniquement », visionneuse plein écran sur les réussites.
 * Feature désactivée : écran de présentation incitatif (opt-in).
 */
export function OnTheSpotGallery({
  visible,
  active,
  onEnable,
  onCustomize,
}: OnTheSpotGalleryProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [journal, setJournal] = useState<readonly OtsCall[]>([]);
  const [onlyDone, setOnlyDone] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Recharge le journal à chaque ouverture de l'onglet (résout aussi les
  // manqués). setState en callback async : conforme à la règle #136.
  useEffect(() => {
    if (!visible || !active) return;
    let cancelled = false;
    void refreshJournal().then((j) => {
      if (!cancelled) setJournal(j);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, active]);

  const streak = useMemo(() => computeStreak(journal, Date.now()), [journal]);
  const days: OtsDayGroup[] = useMemo(() => {
    // Les appels FUTURS restent secrets (la surprise fait la feature) : on
    // n'affiche que le passé, réussi ou manqué.
    const past = journal.filter((c) => c.status !== 'pending');
    const groups = groupCallsByDay(past);
    if (!onlyDone) return groups;
    return groups
      .map((g) => ({ ...g, calls: g.calls.filter((c) => c.status === 'done') }))
      .filter((g) => g.calls.length > 0);
  }, [journal, onlyDone]);

  /** Réussites (ordre chronologique) : la liste que parcourt la visionneuse. */
  const doneMedia = useMemo(
    () =>
      journal
        .filter((c) => c.status === 'done' && c.mediaUri != null)
        .sort((a, b) => a.scheduledAt - b.scheduledAt)
        .map(mediaOf),
    [journal],
  );

  const openCall = useCallback(
    (call: OtsCall) => {
      const idx = doneMedia.findIndex((m) => m.createdAt === call.scheduledAt);
      if (idx >= 0) setPreviewIndex(idx);
    },
    [doneMedia],
  );

  const shareItem = useCallback(
    (item: CapturedMedia) => {
      void shareCapture(item, t('share.photo'), i18n.language);
    },
    [t, i18n.language],
  );

  const dayLabel = useCallback(
    (dayStartMs: number) =>
      new Date(dayStartMs).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
    [i18n.language],
  );

  // --- Feature désactivée : présentation + opt-in. ---
  if (!active) {
    return (
      <View style={styles.intro}>
        <View style={styles.introBadge}>
          <MaterialIcons name="notifications-active" size={34} color={colors.onPrimaryContainer} />
        </View>
        <Text style={styles.introTitle}>{t('ots.title')}</Text>
        <Text style={styles.introBody}>{t('ots.enableDesc')}</Text>
        <Text style={styles.introBody}>{t('ots.introStreak')}</Text>
        <Pressable
          style={styles.introCta}
          onPress={onEnable}
          accessibilityRole="button"
          accessibilityLabel={t('ots.enable')}
        >
          <Text style={styles.introCtaText}>{t('ots.enable')}</Text>
        </Pressable>
        <Pressable
          style={styles.introCtaSecondary}
          onPress={onCustomize}
          accessibilityRole="button"
          accessibilityLabel={t('ots.customize')}
        >
          <Text style={styles.introCtaSecondaryText}>{t('ots.customize')}</Text>
        </Pressable>
      </View>
    );
  }

  const timeOf = (ts: number): string =>
    new Date(ts).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.root}>
      {/* Série + record + filtre. */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <MaterialIcons name="local-fire-department" size={16} color={colors.primary} />
          <Text style={styles.statText}>
            {t('ots.streakCurrent')} {streak.current}
          </Text>
        </View>
        <View style={styles.statChip}>
          <MaterialIcons name="emoji-events" size={15} color={colors.onSurfaceVariant} />
          <Text style={styles.statText}>
            {t('ots.streakBest')} {streak.best}
          </Text>
        </View>
        <View style={styles.spacer} />
        <Pressable
          style={[styles.filterChip, onlyDone && styles.filterChipOn]}
          onPress={() => setOnlyDone((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: onlyDone }}
          accessibilityLabel={t('ots.filterCompleted')}
        >
          <MaterialIcons
            name="check-circle"
            size={15}
            color={onlyDone ? colors.onPrimaryContainer : colors.onSurfaceVariant}
          />
          <Text style={[styles.filterText, onlyDone && styles.filterTextOn]}>{t('ots.filterCompleted')}</Text>
        </Pressable>
      </View>

      {days.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="hourglass-top" size={40} color={colors.onSurfaceVariant} />
          <Text style={styles.emptyText}>{t('ots.emptyJournal')}</Text>
        </View>
      ) : (
        <FlatList
          data={days}
          keyExtractor={(g) => String(g.dayStartMs)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
          renderItem={({ item: group }) => (
            <View style={styles.day}>
              <Text style={styles.dayLabel}>{dayLabel(group.dayStartMs)}</Text>
              <View style={styles.dayRow}>
                {group.calls.map((call) => {
                  if (call.status === 'done' && call.mediaUri != null) {
                    return (
                      <Pressable
                        key={call.id}
                        style={styles.cell}
                        onPress={() => openCall(call)}
                        accessibilityRole="button"
                        accessibilityLabel={t('gallery.cellPhotoA11y', {
                          date: new Date(call.scheduledAt).toLocaleString(i18n.language),
                        })}
                      >
                        <Image
                          source={{ uri: call.mediaUri }}
                          style={styles.cellImg}
                          contentFit="cover"
                          recyclingKey={call.id}
                          transition={80}
                        />
                        <View style={styles.doneBadge}>
                          <MaterialIcons name="check" size={13} color={colors.onPrimaryContainer} />
                        </View>
                        <Text style={styles.cellTime}>{timeOf(call.scheduledAt)}</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <View
                      key={call.id}
                      style={[styles.cell, styles.cellPlaceholder]}
                      accessibilityLabel={t('ots.missedCell')}
                    >
                      <MaterialIcons name="motion-photos-off" size={26} color={colors.onSurfaceVariant} />
                      <Text style={styles.placeholderText}>{t('ots.missedCell')}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        />
      )}

      {previewIndex != null && (
        <MediaViewer
          media={doneMedia}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onShare={shareItem}
          posters={{}}
        />
      )}
    </View>
  );
}

const CELL = 104;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    // --- Présentation (feature désactivée) ---
    intro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
    introBadge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    introTitle: { color: colors.onSurface, fontSize: 24, fontWeight: '700' },
    introBody: { color: colors.onSurfaceVariant, fontSize: 15, lineHeight: 21, textAlign: 'center' },
    introCta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      borderRadius: 24,
      paddingHorizontal: 32,
      paddingVertical: 13,
    },
    introCtaText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    introCtaSecondary: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 24,
      paddingHorizontal: 32,
      paddingVertical: 12,
    },
    introCtaSecondaryText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
    // --- Historique ---
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    statChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statText: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
    spacer: { flex: 1 },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.outline,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterChipOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
    filterText: { color: colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '600' },
    filterTextOn: { color: colors.onPrimaryContainer },
    list: { paddingHorizontal: 20 },
    day: { marginBottom: 18 },
    dayLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'capitalize',
      marginBottom: 8,
    },
    dayRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    cell: {
      width: CELL,
      height: CELL,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.surfaceContainerHigh,
    },
    cellImg: { width: '100%', height: '100%' },
    cellTime: {
      position: 'absolute',
      bottom: 5,
      left: 7,
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      textShadowColor: 'rgba(0,0,0,0.7)',
      textShadowRadius: 4,
    },
    doneBadge: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.outlineVariant,
      backgroundColor: 'transparent',
    },
    placeholderText: { color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
    emptyText: { color: colors.onSurfaceVariant, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  });
