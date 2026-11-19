/**
 * Interruptions d'un enregistrement vidéo (#243). Deux chemins de perte connus :
 *  1. Android refuse de démarrer la composition hors délai de grâce : rendu
 *     reproductible en forçant le délai à 0 (astuce de @the40n8, #244) : INT-06 ;
 *  2. le processus meurt PENDANT la composition : perte silencieuse, couverte
 *     par la reprise automatique (#261). INT-03 / INT-04 sont KNOWN d'ici là ;
 *     la récupération manuelle des bruts (#244) est INT-07.
 */
const RECORD_MS = 20000; // assez long pour que la composition dure quelques secondes

/** Délai de grâce Android avant refus d'un Foreground Service lancé depuis l'arrière-plan. */
const GRACE_KEY = 'activity_manager fg_to_bg_fgs_grace_duration';

async function recordThen(t, seconds) {
  await t.dev.ensureViewfinder();
  await t.dev.setMode('video');
  await t.dev.startRecording();
  await t.dev.sleep(seconds);
}

/** Attend que le service de composition tourne (preuve qu'on tue PENDANT la compo). */
async function waitComposing(t, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (t.dev.isComposing()) return;
    await t.dev.sleep(500);
  }
  throw new Error("la composition n'a jamais démarré");
}

export default {
  name: 'interruption',
  title: "Interruptions d'un enregistrement (#243)",
  cases: [
    {
      id: 'INT-01',
      title: "Accueil pendant l'enregistrement : vidéo sauvegardée sans revenir dans l'app",
      refs: ['#243'],
      async run(t) {
        await recordThen(t, 4000);
        const leave = t.dev.deviceNowMs();
        t.dev.home();
        await t.dev.sleep(3000);
        t.expect(!t.dev.isRecording(), "l'enregistrement s'arrête en quittant l'app");
        const media = await t.dev.waitMedia(leave, { kind: 'video', timeoutMs: 180000 });
        t.log(`média : ${media.name}`);
      },
    },
    {
      id: 'INT-02',
      title: "Passage à une autre app pendant l'enregistrement : vidéo sauvegardée",
      refs: ['#243'],
      async run(t) {
        await recordThen(t, 4000);
        const leave = t.dev.deviceNowMs();
        t.dev.openOtherApp();
        await t.dev.sleep(3000);
        t.expect(!t.dev.isRecording(), "l'enregistrement s'arrête en quittant l'app");
        const media = await t.dev.waitMedia(leave, { kind: 'video', timeoutMs: 180000 });
        t.log(`média : ${media.name}`);
        t.dev.home();
      },
    },
    {
      id: 'INT-03',
      title: 'Arrêt normal puis arrêt forcé pendant la composition : vidéo reprise au lancement suivant',
      refs: ['#243', '#261'],
      known: { issue: '#261', reason: 'pas de reprise automatique des compositions interrompues' },
      async run(t) {
        await recordThen(t, RECORD_MS);
        const stop = await t.dev.stopRecording();
        await waitComposing(t);
        t.dev.forceStop();
        t.log('arrêt forcé pendant la composition');
        await t.dev.sleep(2000);
        await t.dev.ensureViewfinder();
        const media = await t.dev.waitMedia(stop, { kind: 'video', timeoutMs: 240000 });
        t.log(`média : ${media.name}`);
      },
    },
    {
      id: 'INT-04',
      title: 'Accueil puis arrêt forcé pendant la composition : vidéo reprise au lancement suivant',
      refs: ['#243', '#261'],
      known: { issue: '#261', reason: 'pas de reprise automatique des compositions interrompues' },
      async run(t) {
        await recordThen(t, RECORD_MS);
        const leave = t.dev.deviceNowMs();
        t.dev.home();
        await waitComposing(t);
        t.dev.forceStop();
        t.log('arrêt forcé pendant la composition');
        await t.dev.sleep(2000);
        await t.dev.ensureViewfinder();
        const media = await t.dev.waitMedia(leave, { kind: 'video', timeoutMs: 240000 });
        t.log(`média : ${media.name}`);
      },
    },
    {
      id: 'INT-06',
      title: "Composition refusée par Android (délai de grâce à 0) : vidéo composée au retour dans l'app",
      refs: ['#243', '#244'],
      async run(t) {
        t.dev.sh(`device_config put ${GRACE_KEY} 0`);
        try {
          await recordThen(t, 4000);
          const since = t.dev.deviceLogcatTime();
          const leave = t.dev.deviceNowMs();
          t.dev.home();
          await t.dev.sleep(8000);
          // Preuve que le scénario a lieu : Android a bien refusé le démarrage.
          const refused = /startForegroundService\(\) not allowed|Background started FGS: Disallowed/.test(
            t.dev.logcatSince(since),
          );
          t.log(`démarrage refusé par Android : ${refused}`);
          t.expect(refused, "refus du service constaté (sinon le délai forcé à 0 n'a pas pris)");
          t.expect(t.dev.mediaAddedSince(leave).length === 0, "aucune vidéo tant que l'app est en arrière-plan");
          await t.dev.ensureViewfinder(); // retour au premier plan : nouvel essai (#244)
          const media = await t.dev.waitMedia(leave, { kind: 'video', timeoutMs: 180000 });
          t.log(`média composé au retour : ${media.name}`);
        } finally {
          t.dev.sh(`device_config delete ${GRACE_KEY}`);
        }
      },
    },
    {
      id: 'INT-07',
      title: 'Récupération manuelle des bruts orphelins (réglages, Vidéos interrompues)',
      refs: ['#243', '#244'],
      // Enregistre TOUS les bruts récupérables (y compris ceux des anciennes
      // versions) puis les retire du cache : consomme le banc de test du téléphone.
      tags: ['destructive'],
      async run(t) {
        // Crée un orphelin : arrêt forcé pendant la composition (tant que #261 n'est pas livré).
        await recordThen(t, RECORD_MS);
        await t.dev.stopRecording();
        await waitComposing(t);
        t.dev.forceStop();
        await t.dev.sleep(2000);
        await t.dev.ensureViewfinder();
        await t.dev.tap('camera-settings-open');
        await t.dev.tap('settings-more');
        await t.dev.scrollUntil('more-recover-recordings');
        const since = t.dev.deviceNowMs();
        await t.dev.tap('more-recover-recordings');
        const first = await t.dev.waitMedia(since, { kind: 'video', timeoutMs: 120000 });
        await t.dev.sleep(5000);
        const saved = t.dev.mediaAddedSince(since);
        t.log(`bruts récupérés : ${saved.length} (premier : ${first.name})`);
        t.expect(saved.length >= 2, 'au moins les deux bruts (avant et arrière) récupérés');
        t.dev.sh('input keyevent KEYCODE_BACK');
      },
    },
  ],
};
