const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Pose les drapeaux d'optimisation R8 dans le gradle.properties genere
 * (reco Play « Ameliorez la memoire et les performances », issue #173).
 *
 * - android.enableR8.fullMode : R8 en mode complet (non-compat). Defaut AGP 8+,
 *   mais on l'ecrit EXPLICITEMENT : le defaut peut changer sous nos pieds a
 *   chaque bump AGP par Expo/RN, et Play analyse le bundle produit.
 * - android.r8.optimizedResourceShrinking : reduction optimisee des ressources
 *   (le point explicitement liste par la reco Play).
 *
 * ATTENTION : le full mode est plus agressif sur la reflexion. Toute montee de
 * version de lib native (VisionCamera, Nitro) doit repasser par le smoke device
 * complet en build RELEASE (capture, PiP/FGS, boomerang) avant release.
 */
const PROPS = [
  { key: 'android.enableR8.fullMode', value: 'true' },
  { key: 'android.r8.optimizedResourceShrinking', value: 'true' },
];

module.exports = function withR8Optimization(config) {
  return withGradleProperties(config, (cfg) => {
    for (const { type, key, value } of PROPS.map((p) => ({ type: 'property', ...p }))) {
      cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === key));
      cfg.modResults.push({ type, key, value });
    }
    return cfg;
  });
};
