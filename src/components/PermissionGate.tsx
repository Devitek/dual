import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useColors, useThemedStyles, type Palette } from '../theme/theme';
import type { MultiCamPermissionsState } from '../hooks/useMultiCamPermissions';

interface PermissionRowProps {
  label: string;
  granted: boolean;
}

function PermissionRow({ label, granted }: PermissionRowProps): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={[styles.badge, granted ? styles.badgeOk : styles.badgeKo]}>
        <Text style={styles.badgeText}>{granted ? '✓' : '!'}</Text>
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
  );
}

interface PermissionGateProps {
  permissions: MultiCamPermissionsState;
  children: React.ReactNode;
}

/**
 * Affiche les enfants uniquement si les 3 permissions sont accordées.
 * Sinon, présente un écran d'onboarding clair avec un bouton d'action
 * (redemander, ou ouvrir les Réglages si refus définitif).
 */
export function PermissionGate({
  permissions,
  children,
}: PermissionGateProps): React.ReactElement {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  if (permissions.allGranted) {
    return <>{children}</>;
  }

  const { canAskAgain, isRequesting } = permissions;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Autorisations requises</Text>
      <Text style={styles.subtitle}>
        TwinLens a besoin d’accéder à vos caméras, à votre micro et à votre galerie
        pour capturer et enregistrer vos médias avant / arrière.
      </Text>

      <View style={styles.rows}>
        <PermissionRow label="Caméra" granted={permissions.hasCameraPermission} />
        <PermissionRow label="Microphone" granted={permissions.hasMicrophonePermission} />
        <PermissionRow label="Galerie (écriture)" granted={permissions.hasMediaLibraryPermission} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isRequesting && styles.buttonDim]}
        disabled={isRequesting}
        onPress={() => void permissions.requestAll()}
      >
        {isRequesting ? (
          <>
            <ActivityIndicator color={colors.onPrimary} />
            <Text style={styles.buttonText}>Demande en cours…</Text>
          </>
        ) : (
          <Text style={styles.buttonText}>Autoriser l’accès</Text>
        )}
      </Pressable>

      {/* Toujours proposé : indispensable si une autorisation a été refusée
          définitivement (Android ne réaffiche alors plus le dialogue). */}
      <Pressable
        style={({ pressed }) => [styles.settingsBtn, pressed && styles.buttonPressed]}
        onPress={() => void Linking.openSettings()}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir les réglages de l'application"
      >
        <MaterialIcons name="settings" size={18} color={colors.primary} />
        <Text style={styles.settingsText}>Ouvrir les réglages de l’application</Text>
      </Pressable>

      <Text style={styles.hint}>
        {canAskAgain
          ? 'Touchez « Autoriser l’accès » puis acceptez chaque demande (caméra, micro, galerie).'
          : 'Une autorisation a été refusée. Activez-la manuellement via les réglages de l’application.'}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  rows: { marginBottom: 32, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOk: { backgroundColor: colors.success },
  badgeKo: { backgroundColor: colors.warning },
  badgeText: { color: colors.background, fontWeight: '800', fontSize: 14 },
  rowLabel: { color: colors.text, fontSize: 16 },
  button: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDim: { opacity: 0.7 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '600' },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
  },
  settingsText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
    textAlign: 'center',
  },
});
