import * as Haptics from 'expo-haptics';

/**
 * Retours haptiques (best-effort, jamais bloquants).
 * Sur Android, nécessite la vibration (activée par défaut).
 */
export const haptics = {
  selection: (): void => {
    void Haptics.selectionAsync().catch(() => {});
  },
  light: (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success: (): void => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: (): void => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
