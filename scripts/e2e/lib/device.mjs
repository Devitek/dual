/**
 * Bibliothèque de pilotage device pour TwinLens (issue #263).
 *
 * Deux sources de vérité, à combiner :
 *  - l'UI, ciblée par `resource-id` (= `testID` React Native) via uiautomator ;
 *  - des TÉMOINS SYSTÈME (dumpsys, MediaStore, logcat), indépendants de l'UI.
 *
 * Pourquoi les témoins système : quand l'écran n'est jamais au repos (pendant un
 * enregistrement, le compteur REC et le point pulsé émettent des événements
 * d'accessibilité en continu), `uiautomator dump` échoue (« could not get idle
 * state ») à chaque fois. L'ancien driver relisait alors en silence le dump
 * PRÉCÉDENT (état périmé : un obturateur qui enregistrait lu « Démarrer »).
 * Ici, un dump raté lève `UiNotIdleError`, jamais de lecture périmée, et
 * l'état d'enregistrement se lit dans `dumpsys audio`.
 *
 * Aucun shell local : tout passe par execFileSync('adb', [...]) (pas de
 * problème de guillemets, et `adb` ne consomme jamais le stdin du script).
 *
 * Variable d'env : ADB_SERIAL pour cibler un device précis.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const PKG = 'fr.devitek.twinlens';
export const ACTIVITY = `${PKG}/.MainActivity`;
const RUNTIME_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
];
const DUMP_PATH = '/sdcard/tl-uidump.xml';

export class UiNotIdleError extends Error {
  constructor() {
    super('UI jamais au repos : uiautomator ne peut pas dumper (enregistrement en cours ?)');
    this.name = 'UiNotIdleError';
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exécute `adb [-s serial] ...args` et renvoie stdout. */
export function adb(args, { timeout = 30000 } = {}) {
  const serial = process.env.ADB_SERIAL ? ['-s', process.env.ADB_SERIAL] : [];
  return execFileSync('adb', [...serial, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Commande shell DEVICE (une seule chaîne, interprétée par le sh d'Android). */
export const sh = (cmd, opts) => adb(['shell', cmd], opts);

// ------------------------------------------------------------------- UI ----

/** Parse un dump uiautomator en noeuds { id, text, desc, selected, checked, enabled, bounds }. */
export function parseNodes(xml) {
  const nodes = [];
  for (const frag of xml.split('<node').slice(1)) {
    const attr = (name) => {
      const m = frag.match(new RegExp(`\\s${name}="([^"]*)"`));
      return m ? m[1] : null;
    };
    const b = (attr('bounds') ?? '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    const bounds = b
      ? {
          x1: +b[1],
          y1: +b[2],
          x2: +b[3],
          y2: +b[4],
          cx: Math.round((+b[1] + +b[3]) / 2),
          cy: Math.round((+b[2] + +b[4]) / 2),
        }
      : null;
    nodes.push({
      id: attr('resource-id') ?? '',
      text: attr('text') ?? '',
      desc: attr('content-desc') ?? '',
      selected: attr('selected') === 'true',
      checked: attr('checked') === 'true',
      enabled: attr('enabled') !== 'false',
      bounds,
    });
  }
  return nodes;
}

/**
 * Dump FRAIS de la hiérarchie : le fichier est supprimé avant, et l'échec
 * (UI jamais au repos) lève UiNotIdleError au lieu de relire l'ancien dump.
 */
export function dumpNodes({ attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const out = sh(`rm -f ${DUMP_PATH}; uiautomator dump ${DUMP_PATH} 2>&1`);
    if (out.includes('dumped to')) {
      const xml = sh(`cat ${DUMP_PATH}`);
      sh(`rm -f ${DUMP_PATH}`);
      return parseNodes(xml);
    }
  }
  throw new UiNotIdleError();
}

/** Positions mémorisées (un bouton fixe reste tapable quand l'UI n'est pas au repos). */
const lastBounds = new Map();

/** Noeud par resource-id (ou null). Lève UiNotIdleError si l'UI n'est pas au repos. */
export function find(id) {
  const node = dumpNodes().find((n) => n.id === id) ?? null;
  if (node?.bounds) lastBounds.set(id, node.bounds);
  return node;
}

/** Vrai/faux si l'UI est dumpable ; null si on ne peut pas savoir (UI pas au repos). */
export function present(id) {
  try {
    return find(id) != null;
  } catch (e) {
    if (e instanceof UiNotIdleError) return null;
    throw e;
  }
}

/** Attend l'apparition d'un resource-id (tolère les dumps ratés), renvoie le noeud. */
export async function waitFor(id, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const node = find(id);
      if (node) return node;
    } catch (e) {
      if (!(e instanceof UiNotIdleError)) throw e;
    }
    await sleep(500);
  }
  throw new Error(`timeout : "${id}" introuvable après ${timeoutMs} ms`);
}

/** Attend la disparition d'un resource-id. */
export async function waitGone(id, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (present(id) === false) return;
    await sleep(500);
  }
  throw new Error(`timeout : "${id}" toujours présent après ${timeoutMs} ms`);
}

/** Attend le noeud puis tape son centre. */
export async function tap(id, timeoutMs) {
  const node = await waitFor(id, timeoutMs);
  sh(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  return node;
}

/**
 * Tape à la dernière position CONNUE d'un id (sans dump). Pour les boutons fixes
 * quand l'UI n'est pas dumpable (ex. arrêter un enregistrement).
 */
export function tapCached(id) {
  const b = lastBounds.get(id);
  if (!b) throw new Error(`aucune position mémorisée pour "${id}" (faire un find/waitFor avant)`);
  sh(`input tap ${b.cx} ${b.cy}`);
}

// ------------------------------------------------------- témoins système ----

/** PID de l'app (ou null si pas de processus). */
export function pid() {
  const out = sh(`pidof ${PKG} || true`).trim();
  return out ? out.split(/\s+/)[0] : null;
}

/** Vrai si l'app enregistre (micro CAMCORDER actif côté AudioService). */
export function isRecording() {
  const out = sh('dumpsys audio');
  const section = out.split('RecordActivityMonitor')[1] ?? '';
  // Bloc « riid N; active? true » suivi de sa ligne de détail (source, pack).
  for (const block of section.split(/\n(?=riid )/)) {
    if (/active\? true/.test(block) && block.includes(`pack:${PKG}`) && /CAMCORDER/.test(block)) return true;
  }
  return false;
}

/** Nombre de caméras ouvertes par l'app (2 en multi-cam). 0 = session morte (#222). */
export function openCameraClients() {
  const out = sh('dumpsys media.camera');
  const section = out.split('Active Camera Clients')[1]?.split('Active Client listener')[0] ?? '';
  return (section.match(new RegExp(`Client Package Name: ${PKG.replace(/\./g, '\\.')}`, 'g')) ?? []).length;
}

/** Activité au premier plan (composant), ou ''. */
export function topActivity() {
  const out = sh('dumpsys activity activities');
  return out.match(/topResumedActivity=ActivityRecord\{\S+ \S+ (\S+)/)?.[1] ?? '';
}

/** Capture d'écran PNG du device vers un fichier local. */
export function screenshot(localPath) {
  const serial = process.env.ADB_SERIAL ? ['-s', process.env.ADB_SERIAL] : [];
  const png = execFileSync('adb', [...serial, 'exec-out', 'screencap', '-p'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(localPath, png);
}

/** Vrai si le Foreground Service de composition tourne. */
export function isComposing() {
  return /PipComposerService/.test(sh(`dumpsys activity services ${PKG}`));
}

/** Vrai si la fenêtre de l'app demande à garder l'écran allumé (#214). */
export function keepsScreenOn() {
  const out = sh('dumpsys window windows');
  const idx = out.indexOf(`${PKG}/${PKG}.MainActivity`);
  if (idx < 0) return false;
  return out
    .slice(idx, idx + 4000)
    .split(/\n {2}Window #/)[0]
    .includes('KEEP_SCREEN_ON');
}

export const isScreenOn = () => /mWakefulness=Awake/.test(sh('dumpsys power'));
export const isKeyguardShowing = () => /isKeyguardShowing=true/.test(sh('dumpsys window'));

/** Heure DEVICE en ms (précision seconde, comme date_added de MediaStore). */
export const deviceNowMs = () => Number(sh('date +%s').trim()) * 1000;

/** Horodatage device au format logcat (-T). */
export const deviceLogcatTime = () => sh("date +'%m-%d %H:%M:%S.000'").trim();

/** Crashs de l'app depuis `since` (format logcat), lus dans le buffer crash. */
export function crashesSince(since) {
  try {
    const out = adb(['logcat', '-d', '-b', 'crash', '-T', since]);
    return out.includes(`Process: ${PKG}`) ? out : null;
  } catch {
    return null;
  }
}

/** Logcat filtré (app, composition, caméra, cycle de vie) depuis `since`. */
export function logcatSince(since) {
  try {
    const out = adb(['logcat', '-d', '-v', 'time', '-T', since], { timeout: 60000 });
    return out
      .split('\n')
      .filter((l) =>
        /twinlens|PipComposer|VideoEncoder|ForegroundService|FGS|CameraService|AndroidRuntime|ReactNativeJS/.test(l),
      )
      .join('\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- médias ----

/**
 * Médias de l'app ajoutés à MediaStore après `sinceMs` (photos, vidéos, GIF),
 * finalisés seulement (is_pending=0). Filtre : app propriétaire OU préfixe Dual_.
 */
export function mediaAddedSince(sinceMs) {
  const since = Math.floor(sinceMs / 1000);
  const where = `(owner_package_name='${PKG}' OR _display_name LIKE 'Dual_%') AND date_added>=${since} AND is_pending=0`;
  const out = sh(
    `content query --uri content://media/external/file --projection _id:_display_name:_data:date_added:mime_type --where "${where}"`,
  );
  const rows = [];
  for (const line of out.split('\n')) {
    const get = (k) => line.match(new RegExp(`${k}=([^,]*)`))?.[1]?.trim();
    const id = get('_id');
    if (!id) continue;
    rows.push({
      id,
      name: get('_display_name'),
      path: get('_data'),
      addedMs: Number(get('date_added')) * 1000,
      mime: get('mime_type'),
    });
  }
  return rows.sort((x, y) => x.addedMs - y.addedMs);
}

/**
 * Attend un NOUVEAU média de l'app après `sinceMs` (piège « one-behind » de #174 :
 * après un stop, la composition dure ; « le plus récent » = celui du test d'avant).
 */
export async function waitMedia(sinceMs, { kind = 'any', timeoutMs = 180000, exclude = [] } = {}) {
  const deadline = Date.now() + timeoutMs;
  const match = (m) =>
    !exclude.includes(m.id) &&
    (kind === 'any' || (kind === 'video' ? /^video\//.test(m.mime) : /^image\//.test(m.mime)));
  while (Date.now() < deadline) {
    const found = mediaAddedSince(sinceMs).find(match);
    if (found) return found;
    await sleep(2000);
  }
  throw new Error(`timeout : aucun média (${kind}) de l'app après ${new Date(sinceMs).toISOString()}`);
}

/** Supprime des médias (fichier + entrée MediaStore) par _id. */
export function deleteMedia(ids) {
  for (const id of ids) sh(`content delete --uri content://media/external/file --where "_id=${id}"`);
}

// ------------------------------------------------------ cycle de vie app ----

export function grant() {
  for (const p of RUNTIME_PERMISSIONS) {
    try {
      sh(`pm grant ${PKG} ${p}`);
    } catch {
      // Permission non runtime sur cette version d'Android : sans objet.
    }
  }
}

export const launch = () => sh(`am start -n ${ACTIVITY}`);
export const forceStop = () => sh(`am force-stop ${PKG}`);
export const home = () => sh('input keyevent KEYCODE_HOME');
export const wake = () => sh('input keyevent KEYCODE_WAKEUP');
export const sleepScreen = () => sh('input keyevent KEYCODE_SLEEP');
/** Ouvre une AUTRE app (Paramètres) : l'app passe en arrière-plan. */
export const openOtherApp = () => sh('am start -a android.settings.SETTINGS');
/** Tente de lever un verrouillage NON sécurisé (sans effet sur empreinte/code). */
export const dismissKeyguard = () => sh('wm dismiss-keyguard');

/**
 * Amène l'app au viseur prêt : réveil, lancement, fermeture de l'onboarding /
 * des nouveautés, puis caméras réellement ouvertes (témoin système).
 */
export async function ensureViewfinder({ timeoutMs = 30000 } = {}) {
  wake();
  // Relancer une activité DÉJÀ au premier plan peut la mettre en pause/reprise
  // (singleTask) et fermer les caméras : on ne lance que si nécessaire.
  if (!topActivity().startsWith(PKG)) launch();
  const deadline = Date.now() + timeoutMs;
  let state = {};
  while (Date.now() < deadline) {
    let nodes;
    try {
      nodes = dumpNodes();
    } catch (e) {
      if (!(e instanceof UiNotIdleError)) throw e;
      state = { dump: 'UI pas au repos', top: topActivity(), cameras: openCameraClients() };
      await sleep(500);
      continue;
    }
    const has = (id) => nodes.find((n) => n.id === id);
    for (const cta of ['onboarding-cta', 'whatsnew-cta']) {
      const node = has(cta);
      if (node?.bounds) sh(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
    }
    const shutter = has('camera-shutter');
    const cameras = openCameraClients();
    state = {
      top: topActivity(),
      shutter: Boolean(shutter),
      error: Boolean(has('camera-error')),
      starting: Boolean(has('camera-starting')),
      cameras,
    };
    if (shutter?.bounds && !state.error && !state.starting && cameras > 0) {
      lastBounds.set('camera-shutter', shutter.bounds);
      return;
    }
    if (!state.top.startsWith(PKG)) launch();
    await sleep(800);
  }
  throw new Error(`viseur pas prêt après ${timeoutMs / 1000} s, dernier état : ${JSON.stringify(state)}`);
}

/** Sélectionne un mode de capture et vérifie qu'il est sélectionné. */
export async function setMode(mode) {
  await tap(`mode-${mode}`);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if (find(`mode-${mode}`)?.selected) return;
    } catch (e) {
      if (!(e instanceof UiNotIdleError)) throw e;
    }
    await sleep(400);
  }
  throw new Error(`mode ${mode} non sélectionné`);
}

/**
 * Démarre un enregistrement et le PROUVE (micro CAMCORDER actif). Retente le tap
 * (warm-up : le premier tap après ouverture peut ne rien déclencher).
 */
export async function startRecording() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await tap('camera-shutter');
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (isRecording()) return deviceNowMs();
    }
  }
  throw new Error("l'enregistrement n'a pas démarré (micro CAMCORDER jamais actif)");
}

/** Arrête l'enregistrement (tap à la position mémorisée) et le PROUVE. Renvoie l'heure du stop. */
export async function stopRecording() {
  const stopMs = deviceNowMs();
  tapCached('camera-shutter');
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (!isRecording()) return stopMs;
  }
  throw new Error("l'enregistrement ne s'est pas arrêté");
}

/** Attend la fin de toute composition en cours (avant nettoyage des médias). */
export async function waitComposingDone(timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isComposing()) return;
    await sleep(3000);
  }
  throw new Error('composition toujours en cours');
}
