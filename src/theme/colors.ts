/**
 * Palette centralisée (thème sombre, immersif « caméra »).
 */
export const colors = {
  background: '#000000',
  surface: '#111114',
  surfaceElevated: '#1C1C22',
  overlay: 'rgba(0, 0, 0, 0.55)',
  overlayStrong: 'rgba(0, 0, 0, 0.75)',
  primary: '#4F8CFF',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FFB020',
  text: '#FFFFFF',
  textMuted: 'rgba(235, 235, 245, 0.6)',
  border: 'rgba(255, 255, 255, 0.9)',
  borderSubtle: 'rgba(255, 255, 255, 0.15)',
} as const;

export type AppColor = keyof typeof colors;
