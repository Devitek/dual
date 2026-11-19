#!/usr/bin/env node
/**
 * Runner des suites de test device TwinLens (issue #263).
 *
 *   node scripts/e2e/run.mjs --list                    # liste suites et cas
 *   node scripts/e2e/run.mjs                           # toutes les suites non destructives
 *   node scripts/e2e/run.mjs --suite capture,interruption
 *   node scripts/e2e/run.mjs --case INT-03
 *   node scripts/e2e/run.mjs --interactive             # cas avec action humaine (consigne affichée, action DÉTECTÉE)
 *   node scripts/e2e/run.mjs --allow-destructive       # autorise pm clear (vide AUSSI le cache de l'app)
 *   node scripts/e2e/run.mjs --report <dir>            # dossier du rapport (défaut /tmp/twinlens-e2e/<horodatage>)
 *
 * Statuts : PASS, FAIL, SKIP, KNOWN (échec attendu, lié à une issue ouverte) et
 * XPASS (un cas KNOWN qui passe : l'issue est peut-être corrigée, à vérifier).
 * Un crash de l'app (buffer logcat crash) fait échouer le cas même s'il « passe ».
 *
 * Après chaque cas : attente de la fin des compositions, puis suppression des
 * médias créés par l'app pendant le cas (aucun média de test laissé en galerie).
 *
 * Les identifiants de cas sont ceux du cahier de test (docs-dev/test-plan.md).
 * Variable d'env : ADB_SERIAL pour cibler un device précis.
 */
import fs from 'node:fs';
import path from 'node:path';

import * as dev from './lib/device.mjs';
import { SUITES } from './suites/index.mjs';

class SkipError extends Error {}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const allCases = SUITES.flatMap((s) => s.cases.map((c) => ({ ...c, suite: s.name })));

if (flag('list')) {
  for (const s of SUITES) {
    console.log(`\n${s.name} : ${s.title}`);
    for (const c of s.cases) {
      const tags = [...(c.tags ?? []), ...(c.known ? [`known ${c.known.issue}`] : [])];
      console.log(`  ${c.id.padEnd(9)} ${c.title}${tags.length ? `  [${tags.join(', ')}]` : ''}`);
    }
  }
  process.exit(0);
}

const wantedSuites = opt('suite')?.split(',');
const wantedCases = opt('case')?.split(',');
const selected = allCases.filter(
  (c) => (!wantedSuites || wantedSuites.includes(c.suite)) && (!wantedCases || wantedCases.includes(c.id)),
);
if (selected.length === 0) {
  console.error('aucun cas sélectionné (voir --list)');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportDir = opt('report') ?? path.join('/tmp', 'twinlens-e2e', stamp);
fs.mkdirSync(reportDir, { recursive: true });

const interactive = flag('interactive');

function deviceInfo() {
  const prop = (k) => dev.sh(`getprop ${k}`).trim();
  const pkg = dev.sh(`dumpsys package ${dev.PKG}`);
  return {
    model: prop('ro.product.model'),
    android: prop('ro.build.version.release'),
    app: `${pkg.match(/versionName=(\S+)/)?.[1] ?? '?'} (${pkg.match(/versionCode=(\d+)/)?.[1] ?? '?'})`,
    installer: pkg.match(/installerPackageName=(\S+)/)?.[1] ?? '?',
  };
}

/** Contexte passé à chaque cas. */
function makeContext(c, lines) {
  const log = (msg) => {
    const line = `    ${msg}`;
    lines.push(line);
    console.log(line);
  };
  return {
    dev,
    log,
    sleep: dev.sleep,
    expect(cond, msg) {
      if (!cond) throw new Error(`attendu : ${msg}`);
    },
    skip(reason) {
      throw new SkipError(reason);
    },
    /**
     * Action humaine : affiche la consigne puis attend que `until()` devienne
     * vrai (détection, pas de touche Entrée). Sans --interactive : SKIP.
     */
    async prompt(msg, until, timeoutMs = 180000) {
      if (!interactive) throw new SkipError(`action humaine requise (relancer avec --interactive) : ${msg}`);
      console.log(`\n  >>> ACTION : ${msg}\n`);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await until()) return;
        await dev.sleep(1000);
      }
      throw new Error(`action humaine non détectée en ${Math.round(timeoutMs / 1000)} s : ${msg}`);
    },
  };
}

const info = deviceInfo();
console.log(`Device : ${info.model}, Android ${info.android} | TwinLens ${info.app} (installeur ${info.installer})`);
console.log(`Rapport : ${reportDir}\n`);

const results = [];
for (const c of selected) {
  const tags = c.tags ?? [];
  const header = `${c.id} ${c.title}`;
  if (tags.includes('destructive') && !flag('allow-destructive')) {
    results.push({ ...c, status: 'SKIP', detail: 'destructif (relancer avec --allow-destructive)', ms: 0 });
    console.log(`SKIP  ${header} (destructif)`);
    continue;
  }
  // Sauté AVANT exécution : un cas interactif commencé puis abandonné laisserait
  // le téléphone dans un état bloquant (ex. verrouillé) pour les cas suivants.
  if (tags.includes('interactive') && !interactive) {
    results.push({ ...c, status: 'SKIP', detail: 'action humaine requise (relancer avec --interactive)', ms: 0 });
    console.log(`SKIP  ${header} (interactif)`);
    continue;
  }
  console.log(`>>>   ${header}`);
  const lines = [];
  const startMs = dev.deviceNowMs();
  const since = dev.deviceLogcatTime();
  const t0 = Date.now();
  let status;
  let detail = '';
  try {
    await c.run(makeContext(c, lines));
    status = c.known ? 'XPASS' : 'PASS';
  } catch (e) {
    if (e instanceof SkipError) {
      status = 'SKIP';
    } else {
      status = c.known ? 'KNOWN' : 'FAIL';
    }
    detail = e.message;
  }
  if (status !== 'PASS' && status !== 'SKIP') {
    try {
      dev.screenshot(path.join(reportDir, `${c.id}.png`));
    } catch {
      // capture impossible (écran éteint...) : sans gravité.
    }
  }
  const crash = dev.crashesSince(since);
  if (crash) {
    status = 'FAIL';
    detail = `CRASH de l'app. ${detail}`;
    fs.writeFileSync(path.join(reportDir, `${c.id}.crash.log`), crash);
  }
  fs.writeFileSync(path.join(reportDir, `${c.id}.log`), [...lines, '', dev.logcatSince(since)].join('\n'));

  // Nettoyage : jamais de média de test laissé dans la galerie de l'utilisateur.
  try {
    await dev.waitComposingDone();
    const created = dev.mediaAddedSince(startMs);
    dev.deleteMedia(created.map((m) => m.id));
    if (created.length) console.log(`    nettoyage : ${created.map((m) => m.name).join(', ')} supprimé(s)`);
  } catch (e) {
    console.log(`    nettoyage incomplet : ${e.message}`);
  }

  const ms = Date.now() - t0;
  results.push({ ...c, status, detail, ms });
  const ref = c.known && (status === 'KNOWN' || status === 'XPASS') ? ` (cf. ${c.known.issue})` : '';
  console.log(`${status.padEnd(5)} ${header} [${Math.round(ms / 1000)} s]${ref}${detail ? `\n      ${detail}` : ''}\n`);

  // Garde-fou : téléphone resté verrouillé = tous les cas suivants échoueraient.
  dev.wake();
  if (dev.isKeyguardShowing()) {
    dev.dismissKeyguard();
    await dev.sleep(1500);
    if (dev.isKeyguardShowing()) {
      console.log('ARRÊT : téléphone verrouillé (verrouillage sécurisé), les cas suivants ne peuvent pas tourner.');
      break;
    }
  }
}

const count = (s) => results.filter((r) => r.status === s).length;
const summary = ['PASS', 'FAIL', 'KNOWN', 'XPASS', 'SKIP'].map((s) => `${s} ${count(s)}`).join(' | ');
const md = [
  `# Rapport e2e TwinLens (${stamp})`,
  '',
  `Device : ${info.model}, Android ${info.android}. App : ${info.app}, installeur ${info.installer}.`,
  '',
  `**${summary}**`,
  '',
  '| Cas | Titre | Statut | Durée | Détail |',
  '|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.status}${r.known ? ` (${r.known.issue})` : ''} | ${Math.round(r.ms / 1000)} s | ${(r.detail ?? '').replace(/\|/g, '/')} |`,
  ),
].join('\n');
fs.writeFileSync(path.join(reportDir, 'report.md'), `${md}\n`);
fs.writeFileSync(
  path.join(reportDir, 'report.json'),
  JSON.stringify({ stamp, device: info, results: results.map(({ run, ...r }) => r) }, null, 2),
);
console.log(summary);
console.log(`Rapport : ${path.join(reportDir, 'report.md')}`);
process.exit(count('FAIL') > 0 ? 1 : 0);
