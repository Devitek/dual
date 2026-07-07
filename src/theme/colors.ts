/**
 * Material 3 — schéma sombre (baseline "expressive" violet).
 * Rôles M3 exposés + alias hérités pour compatibilité avec les composants.
 * Réf. tokens : https://m3.material.io/styles/color/roles
 */
export const colors = {
  // Surfaces
  background: '#141218',
  surface: '#141218',
  surfaceContainerLowest: '#0F0D13',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  surfaceElevated: '#2B2930', // alias hérité

  // Scrim / overlays au-dessus du flux caméra
  scrim: 'rgba(0, 0, 0, 0.6)',
  overlay: 'rgba(28, 27, 31, 0.62)',
  overlayStrong: 'rgba(0, 0, 0, 0.78)',

  // Primary
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',

  // Secondary / tertiary
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',
  tertiary: '#EFB8C8',

  // Sémantique
  success: '#7DD98F',
  danger: '#FFB4AB', // = error (M3 dark)
  onDanger: '#690005',
  warning: '#F5C77E',

  // Texte / contours
  text: '#E6E0E9', // onSurface
  onSurface: '#E6E0E9',
  textMuted: '#CAC4D0', // onSurfaceVariant
  onSurfaceVariant: '#CAC4D0',
  outline: '#938F99',
  outlineVariant: '#49454F',
  border: '#E6E0E9',
  borderSubtle: 'rgba(147, 143, 153, 0.4)',
} as const;

export type AppColor = keyof typeof colors;
