/**
 * Interruptions d'un enregistrement vidéo (#243). Deux chemins de perte connus :
 *  1. Android refuse de démarrer la composition hors délai de grâce (non
 *     reproductible à la demande, couvert par le correctif de #244) ;
 *  2. le processus meurt PENDANT la composition : perte silencieuse, couverte
 *     par la reprise automatique (#261). INT-03 / INT-04 sont KNOWN d'ici là.
 */
const RECORD_MS = 20000; // assez long pour que la composition dure quelques secondes

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
  ],
};
