// Repère de début de session, posé explicitement au démarrage de l'app (index.ts).
//
// Sert à distinguer les fichiers bruts d'une session précédente (récupérables)
// de ceux de la session en cours (encore référencés, ou en attente de
// composition). Un horodatage pris au chargement d'un module serait trop
// tardif si ce module est évalué paresseusement.
// Volontairement sans dépendance : importé en tête d'index.ts.

let sessionStartedAt: number | null = null;

/** Pose le repère une seule fois par process JS. Les appels suivants sont ignorés. */
export function markSessionStart(now: number = Date.now()): void {
  if (sessionStartedAt == null) sessionStartedAt = now;
}

/** Début de la session en cours, ou null si le repère n'a pas été posé. */
export function getSessionStartedAt(): number | null {
  return sessionStartedAt;
}

/** Tests uniquement. */
export function resetSessionStartForTests(): void {
  sessionStartedAt = null;
}
