import { Platform } from 'react-native';

import type { MultiCamDiagnostics } from '../vision/MultiCamController';

/** Champs d'intérêt de `Platform.constants` côté Android (typage permissif). */
type AndroidConstants = {
  Brand?: string;
  Manufacturer?: string;
  Model?: string;
  Release?: string;
  Version?: number | string;
};

/**
 * Construit un rapport technique locale-neutre, copiable pour le support :
 * modèle, version Android, et (si dispo) le diagnostic de détection multi-caméra
 * (FEATURE_CAMERA_CONCURRENT + combinaisons `getConcurrentCameraIds`). Partagé
 * entre la bannière de repli et l'écran « Autres réglages ».
 */
export function buildDeviceReport(diagnostics?: MultiCamDiagnostics | null): string {
  const c = Platform.constants as AndroidConstants;
  const maker = c.Manufacturer ?? c.Brand ?? '?';
  const model = c.Model ?? '?';
  const lines = [
    'TwinLens · dual camera check',
    `Device: ${maker} ${model}`,
    `Android: ${c.Release ?? '?'} (SDK ${c.Version ?? '?'})`,
  ];
  if (diagnostics != null) {
    lines.push(
      `Concurrent feature: ${diagnostics.concurrentFeature ? 'yes' : 'no'}`,
      `Camera combinations: ${diagnostics.comboCount}`,
      `Front+back combo: ${diagnostics.frontBackCombo ? 'yes' : 'no'}`,
    );
  }
  return lines.join('\n');
}
