import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../theme/colors';
import type { MultiCamPermissionsState } from '../hooks/useMultiCamPermissions';

interface PermissionRowProps {
  label: string;
  granted: boolean;
}

function PermissionRow({ label, granted }: PermissionRowProps): React.ReactElement {
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
  if (permissions.allGranted) {
    return <>{children}</>;
  }

  const { canAskAgain, isRequesting } = permissions;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Autorisations requises</Text>
      <Text style={styles.subtitle}>
        Dual a besoin d’accéder à vos caméras, à votre micro et à votre galerie
        pour capturer et enregistrer vos médias avant / arrière.
      </Text>

      <View style={styles.rows}>
        <PermissionRow label="Caméra" granted={permissions.hasCameraPermission} />
        <PermissionRow label="Microphone" granted={permissions.hasMicrophonePermission} />
        <PermissionRow label="Galerie (écriture)" granted={permissions.hasMediaLibraryPermission} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        disabled={isRequesting}
        onPress={() => {
          if (canAskAgain) void permissions.requestAll();
          else void Linking.openSettings();
        }}
      >
        {isRequesting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            {canAskAgain ? 'Autoriser' : 'Ouvrir les Réglages'}
          </Text>
        )}
      </Pressable>

      {!canAskAgain && (
        <Text style={styles.hint}>
          Certaines autorisations ont été refusées. Activez-les manuellement dans
          les Réglages du téléphone.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '600' },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
    textAlign: 'center',
  },
});
