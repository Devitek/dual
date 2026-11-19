// Codes d'erreur du composeur natif (VideoPipComposerModule.kt).
// Fichier sans dépendance native : importable partout, y compris dans les tests.

/**
 * Android 12+ a refusé de démarrer le Foreground Service de composition
 * (`ForegroundServiceStartNotAllowedException`) : l'app est passée en arrière-plan
 * et la finalisation CameraX a dépassé le délai de grâce accordé par le système.
 */
export const E_FGS_NOT_ALLOWED = 'E_FGS_NOT_ALLOWED';

/** Vrai si l'erreur est un refus de démarrage du service depuis l'arrière-plan. */
export function isForegroundServiceNotAllowed(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === E_FGS_NOT_ALLOWED;
}
