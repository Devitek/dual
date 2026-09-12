/**
 * Orientation physique du téléphone à partir de l'accéléromètre (issue #173).
 *
 * L'activité reste verrouillée portrait (app.json) : comme Google Camera, on ne
 * fait pivoter que le CONTENU des boutons. Ce module ne contient que la logique
 * pure (quantisation + hystérésis), testée dans orientation.test.ts ; le
 * capteur vit dans hooks/useDeviceOrientation.
 */

/** Rotation physique du téléphone, en degrés HORAIRES depuis le portrait. */
export type DeviceOrientation = 0 | 90 | 180 | 270;

/** En dessous de cette norme (en g) dans le plan écran, le téléphone est à plat
 *  (gravité sur z) : l'angle n'a plus de sens, on garde l'orientation courante. */
const FLAT_THRESHOLD = 0.35;

/** Marge d'hystérésis : on ne bascule vers un nouveau quadrant que si l'angle
 *  est à moins de (45 - 15)° de son axe, soit 30°. Évite le flottement à 45°. */
const SWITCH_WINDOW = 30;

/** Écart angulaire minimal signé, replié dans [-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Quantise une lecture d'accéléromètre en orientation 0/90/180/270.
 *
 * Convention expo-sensors (portrait, téléphone vertical) : x vers la droite de
 * l'écran, y vers le haut, valeurs en g. Téléphone droit -> (0, 1) ;
 * tourné de 90° horaire (bord droit vers le bas) -> (1, 0).
 *
 * @param x lecture accéléromètre axe x (g)
 * @param y lecture accéléromètre axe y (g)
 * @param prev orientation courante (conservée si lecture ambiguë)
 */
export function orientationFromAccel(x: number, y: number, prev: DeviceOrientation): DeviceOrientation {
  // Téléphone à plat : pas d'information fiable dans le plan écran.
  if (Math.sqrt(x * x + y * y) < FLAT_THRESHOLD) return prev;

  // Angle horaire de la gravité dans le plan écran : 0 = portrait droit.
  const angle = (Math.atan2(x, y) * 180) / Math.PI; // [-180, 180]

  for (const candidate of [0, 90, 180, 270] as const) {
    if (candidate === prev) continue;
    // 270 est aussi -90 dans la plage d'atan2 : angleDelta gère le repli.
    if (Math.abs(angleDelta(angle, candidate)) <= SWITCH_WINDOW) return candidate;
  }
  return prev;
}

/**
 * Rotation à APPLIQUER aux icônes (degrés, sens RN où positif = horaire) pour
 * qu'elles restent droites par rapport au monde : l'inverse de la rotation du
 * téléphone, en choisissant le représentant le plus court (-90 plutôt que 270).
 */
export function uiRotationFor(orientation: DeviceOrientation): number {
  switch (orientation) {
    case 90:
      return -90;
    case 180:
      return 180;
    case 270:
      return 90;
    default:
      return 0;
  }
}
