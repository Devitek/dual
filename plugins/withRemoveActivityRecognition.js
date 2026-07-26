const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Retire la permission `android.permission.ACTIVITY_RECOGNITION` du manifeste
 * fusionné.
 *
 * POURQUOI : `expo-sensors` (utilisé UNIQUEMENT pour l'accéléromètre du niveau)
 * déclare cette permission pour son podomètre — dont on ne se sert pas. Or Google
 * Play la classe comme fonctionnalité « santé/fitness » : sa présence force la
 * déclaration « Applis de santé » et fait échouer l'upload API Play avec
 * « You must let us know whether your app includes any health features ».
 *
 * COMMENT : on injecte `<uses-permission android:name="…ACTIVITY_RECOGNITION"
 * tools:node="remove"/>` (+ le namespace `xmlns:tools`) dans le manifeste de
 * l'app. Le manifest-merger Gradle supprime alors la contribution de la lib au
 * moment du build (invisible dans le manifeste app post-prebuild — c'est normal).
 *
 * Cf. AGENTS.md §3.3 : retirer toute permission inutile ajoutée par une dépendance.
 */
const PERMISSION = 'android.permission.ACTIVITY_RECOGNITION';

module.exports = function withRemoveActivityRecognition(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Déclare le namespace `tools` sur <manifest> si absent.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    manifest['uses-permission'] = manifest['uses-permission'] || [];

    // Purge un éventuel ajout de la permission, puis pose l'entrée de suppression.
    manifest['uses-permission'] = manifest['uses-permission'].filter(
      (p) => p?.$?.['android:name'] !== PERMISSION,
    );
    manifest['uses-permission'].push({
      $: { 'android:name': PERMISSION, 'tools:node': 'remove' },
    });

    return cfg;
  });
};
