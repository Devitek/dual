const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Retire du manifeste fusionné les permissions injectées par des dépendances
 * mais NON utilisées par TwinLens (AGENTS.md §3.3, ADR 0007 : app 100 % locale).
 *
 * COMMENT : on injecte `<uses-permission android:name="…" tools:node="remove"/>`
 * (+ le namespace `xmlns:tools`) dans le manifeste de l'app. Le manifest-merger
 * Gradle supprime alors la contribution de la lib au moment du build (invisible
 * dans le manifeste app post-prebuild, c'est normal ; vérifiable dans l'APK
 * final via `aapt dump permissions`).
 */
const PERMISSIONS_TO_REMOVE = [
  // `expo-sensors` (utilisé UNIQUEMENT pour l'accéléromètre du niveau) la
  // déclare pour son podomètre, dont on ne se sert pas. Google Play la classe
  // « santé/fitness » : sa présence force la déclaration « Applis de santé »
  // et fait échouer l'upload API Play (« You must let us know whether your app
  // includes any health features »).
  'android.permission.ACTIVITY_RECOGNITION',
  // `expo-image` la déclare pour le chargement d'images réseau (Glide). On ne
  // charge QUE des URIs locales (file://) : permission inutile pour nous.
  'android.permission.ACCESS_NETWORK_STATE',
];

module.exports = function withRemoveUnusedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Déclare le namespace `tools` sur <manifest> si absent.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const permission of PERMISSIONS_TO_REMOVE) {
      // Purge un éventuel ajout de la permission, puis pose l'entrée de suppression.
      manifest['uses-permission'] = manifest['uses-permission'].filter((p) => p?.$?.['android:name'] !== permission);
      manifest['uses-permission'].push({
        $: { 'android:name': permission, 'tools:node': 'remove' },
      });
    }

    return cfg;
  });
};
