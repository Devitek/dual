import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import { haptics } from '../utils/haptics';
import type { IntroMode } from '../hooks/useIntro';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface IntroItem {
  icon: IconName;
  titleKey: string;
  descKey: string;
}

const ONBOARDING_ITEMS: IntroItem[] = [
  { icon: 'flip-camera-android', titleKey: 'intro.dualTitle', descKey: 'intro.dualDesc' },
  { icon: 'dashboard', titleKey: 'intro.layoutsTitle', descKey: 'intro.layoutsDesc' },
  { icon: 'open-with', titleKey: 'intro.moveTitle', descKey: 'intro.moveDesc' },
  { icon: 'grid-on', titleKey: 'intro.guidesTitle', descKey: 'intro.guidesDesc' },
  { icon: 'share', titleKey: 'intro.shareTitle', descKey: 'intro.shareDesc' },
];

const WHATSNEW_ITEMS: IntroItem[] = [
  { icon: 'straighten', titleKey: 'intro.newGuidesTitle', descKey: 'intro.newGuidesDesc' },
  { icon: 'burst-mode', titleKey: 'intro.newBurstTitle', descKey: 'intro.newBurstDesc' },
];

interface IntroSheetProps {
  mode: IntroMode | null;
  onClose: () => void;
}

/**
 * Feuille modale d'intro, réutilisée pour l'onboarding (1er lancement) et pour
 * « Nouveautés » (après une mise à jour marquante). Contenu piloté par `mode` ;
 * la logique d'affichage/persistance vit dans {@link useIntro}.
 */
export function IntroSheet({ mode, onClose }: IntroSheetProps): React.ReactElement | null {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  if (mode == null) return null;
  const isOnboarding = mode === 'onboarding';
  const items = isOnboarding ? ONBOARDING_ITEMS : WHATSNEW_ITEMS;

  const close = () => {
    haptics.selection();
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.badge}>
            <MaterialIcons
              name={isOnboarding ? 'camera' : 'auto-awesome'}
              size={26}
              color={colors.onPrimaryContainer}
            />
          </View>
          <Text style={styles.title}>{t(isOnboarding ? 'intro.onboardTitle' : 'intro.whatsnewTitle')}</Text>
          <Text style={styles.subtitle}>
            {t(isOnboarding ? 'intro.onboardSubtitle' : 'intro.whatsnewSubtitle')}
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {items.map((it) => (
              <View key={it.titleKey} style={styles.item}>
                <View style={styles.itemIcon}>
                  <MaterialIcons name={it.icon} size={22} color={colors.primary} />
                </View>
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle}>{t(it.titleKey)}</Text>
                  <Text style={styles.itemDesc}>{t(it.descKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.cta} onPress={close} android_ripple={{ color: colors.onPrimary }}>
            <Text style={styles.ctaLabel}>{t(isOnboarding ? 'intro.start' : 'intro.gotIt')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    card: {
      backgroundColor: colors.surfaceContainerHigh,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 24,
      alignItems: 'center',
    },
    badge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    title: { color: colors.onSurface, fontSize: 22, fontWeight: '700', textAlign: 'center' },
    subtitle: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 12,
    },
    list: { alignSelf: 'stretch', maxHeight: 340 },
    listContent: { paddingVertical: 4 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    itemIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    itemText: { flex: 1 },
    itemTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
    itemDesc: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 2, lineHeight: 18 },
    cta: {
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    ctaLabel: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  });
