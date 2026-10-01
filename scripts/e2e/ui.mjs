#!/usr/bin/env node
/**
 * Pilote UI minimal pour TwinLens, par `resource-id` (= `testID` React Native).
 *
 * Pourquoi : piloter l'app par coordonnées fixes est fragile (en dev build, la
 * bannière/overlay du debugger capte le tap avant la cible). On cible donc par
 * `resource-id` : on dumpe la hiérarchie uiautomator, on lit les `bounds` du
 * noeud et on tape son centre. Confirmé sur device : RN `testID` apparait bien
 * comme `resource-id`, y compris sur l'écran caméra (les overlays RN se rendent
 * par-dessus la SurfaceView/GL).
 *
 * Usage :
 *   node scripts/e2e/ui.mjs dump                 # liste les resource-id visibles
 *   node scripts/e2e/ui.mjs exists <id>          # exit 0 si present
 *   node scripts/e2e/ui.mjs wait <id> [ms]       # attend l'apparition (defaut 15s)
 *   node scripts/e2e/ui.mjs tap <id> [ms]        # attend puis tape le centre
 *   node scripts/e2e/ui.mjs grant                # accorde camera / micro / notifs
 *   node scripts/e2e/ui.mjs launch               # (re)lance l'activite
 *   node scripts/e2e/ui.mjs onboard              # fresh flow : grant + launch + ferme l'onboarding
 *   node scripts/e2e/ui.mjs desc <id>            # content-desc du noeud (etat du shutter...)
 *   node scripts/e2e/ui.mjs media-since <epochMs> [ms]  # attend la video MediaStore creee APRES epochMs
 *
 * PIEGE (vecu, #174) : apres un stop video, la composition tourne 10-20 s dans le
 * Foreground Service. "sleep N puis prendre la plus recente" recupere la sortie
 * du test PRECEDENT. Utiliser media-since avec l'heure du stop, jamais autre chose.
 *
 * Variable d'env : ADB_SERIAL pour cibler un device precis (sinon `adb` par defaut).
 */
import { execSync } from 'node:child_process';

const PKG = 'fr.devitek.twinlens';
const ACTIVITY = `${PKG}/.MainActivity`;
const RUNTIME_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
];

const serial = process.env.ADB_SERIAL ? `-s ${process.env.ADB_SERIAL}` : '';
const adb = (args) => execSync(`adb ${serial} ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dump la hierarchie uiautomator et renvoie le XML (string). */
function dumpXml() {
  // Dump vers un fichier puis cat : plus fiable que `exec-out .../dev/tty`.
  adb('shell uiautomator dump /sdcard/tl-uidump.xml');
  return adb('shell cat /sdcard/tl-uidump.xml');
}

/** Extrait les bounds [x1,y1,x2,y2] d'un noeud par resource-id, ou null. */
function boundsOf(xml, id) {
  // Un noeud = fragment commencant par "<node" ; on cherche celui qui porte le
  // resource-id voulu, puis on lit son attribut bounds (ordre d'attributs libre).
  for (const frag of xml.split('<node').slice(1)) {
    if (!frag.includes(`resource-id="${id}"`)) continue;
    const m = frag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    const [x1, y1, x2, y2] = [+m[1], +m[2], +m[3], +m[4]];
    return { x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
  }
  return null;
}

/** Liste tous les resource-id non vides visibles. */
function listIds(xml) {
  const ids = new Set();
  for (const m of xml.matchAll(/resource-id="([^"]+)"/g)) {
    if (m[1] && !m[1].startsWith('android:') && !m[1].includes(':id/')) ids.add(m[1]);
  }
  return [...ids].sort();
}

/** Attend qu'un resource-id apparaisse, renvoie ses bounds (throw au timeout). */
async function waitFor(id, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = boundsOf(dumpXml(), id);
      if (last) return last;
    } catch {
      // dump transitoire (ecran en cours de rendu) : on retente.
    }
    await sleep(600);
  }
  throw new Error(`timeout: resource-id "${id}" introuvable apres ${timeoutMs}ms`);
}

async function tap(id, timeoutMs) {
  const b = await waitFor(id, timeoutMs);
  adb(`shell input tap ${b.cx} ${b.cy}`);
  console.log(`tap ${id} @ (${b.cx},${b.cy})`);
}

/** Vrai si le resource-id est visible a l'instant t (sans throw). */
function isPresent(id) {
  try {
    return boundsOf(dumpXml(), id) != null;
  } catch {
    return false;
  }
}

/** content-desc d'un noeud par resource-id (ou null). */
function descOf(id) {
  for (const frag of dumpXml().split('<node').slice(1)) {
    if (!frag.includes(`resource-id="${id}"`)) continue;
    const m = frag.match(/content-desc="([^"]*)"/);
    return m ? m[1] : '';
  }
  return null;
}

/**
 * Attend qu'une video apparaisse dans MediaStore avec date_added STRICTEMENT
 * posterieure a `sinceMs`, et renvoie son chemin. C'est la SEULE facon fiable
 * d'attraper la sortie d'une composition (le Foreground Service met 10-20 s ;
 * "la plus recente" tout de suite apres le stop = la sortie du test d'avant).
 */
async function mediaSince(sinceMs, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const out = adb(
        `shell "content query --uri content://media/external/video/media --projection _data:date_added --sort \\"date_added DESC\\""`,
      );
      const m = out.match(/_data=([^,]+), date_added=(\d+)/);
      if (m && +m[2] * 1000 > sinceMs) return m[1].trim();
    } catch {
      // MediaStore occupe : on retente.
    }
    await sleep(2000);
  }
  throw new Error(`timeout: aucune video MediaStore creee apres ${new Date(sinceMs).toISOString()}`);
}

function grant() {
  for (const p of RUNTIME_PERMISSIONS) {
    try {
      adb(`shell pm grant ${PKG} ${p}`);
      console.log(`grant ${p} OK`);
    } catch {
      // Permission non-runtime sur cette version d'Android, ou deja refusee dur : on continue.
      console.log(`grant ${p} skip (non applicable)`);
    }
  }
}

function launch() {
  adb(`shell am start -n ${ACTIVITY}`);
  console.log(`launch ${ACTIVITY}`);
}

async function onboard() {
  grant();
  launch();
  // Cold start apres une install/clear : le bundle dev met quelques secondes a
  // se charger, et le tout premier tap post-demarrage peut ne pas enregistrer
  // (overlay dev / sheet en cours d'animation). On tape donc l'onboarding en
  // boucle jusqu'a ce que l'ecran camera apparaisse reellement.
  await sleep(3500);
  for (let i = 0; i < 6; i++) {
    if (isPresent('camera-shutter')) break;
    if (isPresent('onboarding-cta')) {
      try {
        await tap('onboarding-cta', 2000);
      } catch {
        // noeud disparu entre le check et le tap : on reboucle.
      }
    }
    await sleep(1500);
  }
  await waitFor('camera-shutter', 15000);
  console.log('camera prete (camera-shutter visible)');
}

const [cmd, arg, arg2] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'dump':
      console.log(listIds(dumpXml()).join('\n'));
      break;
    case 'exists':
      process.exit(boundsOf(dumpXml(), arg) ? 0 : 1);
      break;
    case 'wait': {
      const b = await waitFor(arg, arg2 ? +arg2 : undefined);
      console.log(`${arg} @ (${b.cx},${b.cy})`);
      break;
    }
    case 'tap':
      await tap(arg, arg2 ? +arg2 : undefined);
      break;
    case 'grant':
      grant();
      break;
    case 'launch':
      launch();
      break;
    case 'onboard':
      await onboard();
      break;
    case 'desc': {
      const d = descOf(arg);
      if (d == null) {
        console.error(`resource-id "${arg}" introuvable`);
        process.exit(1);
      }
      console.log(d);
      break;
    }
    case 'media-since':
      console.log(await mediaSince(+arg, arg2 ? +arg2 : undefined));
      break;
    default:
      console.error('commande inconnue. Voir l entete du fichier pour l usage.');
      process.exit(2);
  }
} catch (e) {
  console.error(`ERREUR: ${e.message}`);
  process.exit(1);
}
