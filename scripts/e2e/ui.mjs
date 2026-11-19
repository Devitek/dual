#!/usr/bin/env node
/**
 * CLI de pilotage TwinLens par `resource-id` (= `testID` React Native).
 * Toute la logique vit dans ./lib/device.mjs (partagée avec le runner run.mjs).
 *
 * Usage :
 *   node scripts/e2e/ui.mjs dump                 # resource-id visibles (dump FRAIS, jamais périmé)
 *   node scripts/e2e/ui.mjs exists <id>          # exit 0 présent, 1 absent, 3 UI pas au repos
 *   node scripts/e2e/ui.mjs wait <id> [ms]       # attend l'apparition (défaut 15 s)
 *   node scripts/e2e/ui.mjs tap <id> [ms]        # attend puis tape le centre
 *   node scripts/e2e/ui.mjs desc <id>            # content-desc du noeud
 *   node scripts/e2e/ui.mjs grant                # accorde caméra / micro / notifications
 *   node scripts/e2e/ui.mjs launch               # (re)lance l'activité
 *   node scripts/e2e/ui.mjs onboard              # grant + viseur prêt (ferme onboarding / nouveautés)
 *   node scripts/e2e/ui.mjs media-since <epochMs> [ms]  # attend le média de l'app ajouté APRÈS epochMs
 *   node scripts/e2e/ui.mjs status               # témoins système (enregistrement, caméras, composition...)
 *
 * PIÈGE (#174) : après un stop vidéo, la composition dure (10 s à plusieurs
 * minutes). « Le média le plus récent » = celui du test PRÉCÉDENT. Toujours
 * media-since avec l'heure device prise AVANT le stop.
 *
 * PIÈGE (#263) : pendant un enregistrement, uiautomator ne peut pas dumper (UI
 * jamais au repos). Lire l'état via `status` (témoins système), pas via l'UI.
 *
 * Variable d'env : ADB_SERIAL pour cibler un device précis.
 */
import * as dev from './lib/device.mjs';

const [cmd, arg, arg2] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'dump':
      console.log(
        [...new Set(dev.dumpNodes().map((n) => n.id))]
          .filter((id) => id && !id.includes(':id/'))
          .sort()
          .join('\n'),
      );
      break;
    case 'exists': {
      const p = dev.present(arg);
      process.exit(p == null ? 3 : p ? 0 : 1);
      break;
    }
    case 'wait': {
      const n = await dev.waitFor(arg, arg2 ? +arg2 : undefined);
      console.log(`${arg} @ (${n.bounds.cx},${n.bounds.cy})`);
      break;
    }
    case 'tap': {
      const n = await dev.tap(arg, arg2 ? +arg2 : undefined);
      console.log(`tap ${arg} @ (${n.bounds.cx},${n.bounds.cy})`);
      break;
    }
    case 'desc': {
      const n = dev.find(arg);
      if (!n) {
        console.error(`resource-id "${arg}" introuvable`);
        process.exit(1);
      }
      console.log(n.desc);
      break;
    }
    case 'grant':
      dev.grant();
      break;
    case 'launch':
      dev.launch();
      break;
    case 'onboard':
      dev.grant();
      await dev.ensureViewfinder();
      console.log('viseur prêt');
      break;
    case 'media-since':
      console.log((await dev.waitMedia(+arg, { timeoutMs: arg2 ? +arg2 : undefined })).path);
      break;
    case 'status':
      console.log(
        JSON.stringify(
          {
            pid: dev.pid(),
            recording: dev.isRecording(),
            openCameras: dev.openCameraClients(),
            composing: dev.isComposing(),
            keepScreenOn: dev.keepsScreenOn(),
            screenOn: dev.isScreenOn(),
            keyguard: dev.isKeyguardShowing(),
          },
          null,
          2,
        ),
      );
      break;
    default:
      console.error("commande inconnue. Voir l'en-tête du fichier pour l'usage.");
      process.exit(2);
  }
} catch (e) {
  console.error(`ERREUR: ${e.message}`);
  process.exit(e instanceof dev.UiNotIdleError ? 3 : 1);
}
