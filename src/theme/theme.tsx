import React, { createContext, useContext, useMemo } from 'react';
import { useMaterial3Theme, type Material3Scheme } from '@pchmn/expo-material3-theme';

import { colors as staticColors } from './colors';

/**
 * Palette applicative : mêmes rôles que {@link staticColors} mais en valeurs
 * `string` (elles deviennent dynamiques avec Material You).
 */
export type Palette = { [K in keyof typeof staticColors]: string };

/** Palette statique de repli (schéma sombre violet de marque). */
const STATIC_PALETTE: Palette = { ...staticColors };

/**
 * Projette un schéma Material 3 (dynamique système, ou dérivé d'une couleur
 * source de repli) sur notre palette. On conserve les tokens hors-spec
 * (success / warning / overlays / scrim) de la palette statique.
 */
function paletteFromScheme(scheme: Material3Scheme): Palette {
  return {
    ...STATIC_PALETTE,
    // Surfaces (neutres teintés par la couleur système)
    background: scheme.background,
    surface: scheme.surface,
    surfaceContainerLowest: scheme.surfaceContainerLowest,
    surfaceContainer: scheme.surfaceContainer,
    surfaceContainerHigh: scheme.surfaceContainerHigh,
    surfaceContainerHighest: scheme.surfaceContainerHighest,
    surfaceElevated: scheme.surfaceContainerHigh,
    // Accent (le cœur de « Material You »)
    primary: scheme.primary,
    onPrimary: scheme.onPrimary,
    primaryContainer: scheme.primaryContainer,
    onPrimaryContainer: scheme.onPrimaryContainer,
    secondaryContainer: scheme.secondaryContainer,
    onSecondaryContainer: scheme.onSecondaryContainer,
    tertiary: scheme.tertiary,
    // Erreur / texte / contours
    danger: scheme.error,
    onDanger: scheme.onError,
    text: scheme.onSurface,
    onSurface: scheme.onSurface,
    textMuted: scheme.onSurfaceVariant,
    onSurfaceVariant: scheme.onSurfaceVariant,
    outline: scheme.outline,
    outlineVariant: scheme.outlineVariant,
    border: scheme.onSurface,
  };
}

const ThemeContext = createContext<Palette>(STATIC_PALETTE);

/**
 * Fournit la palette Material You au sous-arbre. Sur Android 12+, les couleurs
 * proviennent du fond d'écran système ; ailleurs (ou sans module natif), on
 * dérive un schéma depuis la couleur de marque — sans jamais échouer.
 * L'app étant en thème sombre, on n'expose que le schéma `dark`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { theme } = useMaterial3Theme({ fallbackSourceColor: staticColors.primaryContainer });
  const palette = useMemo(() => paletteFromScheme(theme.dark), [theme.dark]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

/** Palette courante (dynamique). À utiliser à la place de l'ancien `colors`. */
export function useColors(): Palette {
  return useContext(ThemeContext);
}

/**
 * Crée des styles dépendant de la palette. `factory` reçoit la palette courante
 * et le résultat est mémoïsé tant qu'elle ne change pas.
 *
 * @example
 * const styles = useThemedStyles(makeStyles);
 * // ...
 * const makeStyles = (colors: Palette) => StyleSheet.create({ box: { backgroundColor: colors.surface } });
 */
export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors, factory]);
}
