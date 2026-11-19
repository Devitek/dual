/** Cycle de vie : verrouillage (#222) et écran maintenu allumé (#214). */
export default {
  name: 'lifecycle',
  title: 'Cycle de vie (verrouillage, veille)',
  cases: [
    {
      id: 'LCK-01',
      title: 'Verrouillage puis déverrouillage : les caméras repartent seules',
      refs: ['#222'],
      tags: ['interactive'],
      async run(t) {
        await t.dev.ensureViewfinder();
        t.dev.sleepScreen();
        await t.dev.sleep(4000);
        t.log(`écran éteint, caméras ouvertes : ${t.dev.openCameraClients()}`);
        t.dev.wake();
        await t.dev.sleep(1000);
        t.dev.dismissKeyguard();
        await t.dev.sleep(1500);
        if (t.dev.isKeyguardShowing()) {
          await t.prompt(
            "Déverrouille le téléphone (empreinte ou code), sans toucher à l'app",
            () => !t.dev.isKeyguardShowing(),
          );
        }
        // #222 : start() pouvait réussir sans relancer la session (aperçu figé,
        // statut « running »). Témoin : les caméras doivent être RÉELLEMENT rouvertes.
        const deadline = Date.now() + 25000;
        let cams = 0;
        while (Date.now() < deadline) {
          cams = t.dev.openCameraClients();
          if (cams > 0 && t.dev.present('camera-shutter') === true && t.dev.present('camera-error') !== true) break;
          await t.dev.sleep(1000);
        }
        t.log(`caméras ouvertes après déverrouillage : ${cams}`);
        t.expect(cams > 0, 'caméras rouvertes sans action');
        // Preuve fonctionnelle : une photo passe.
        await t.dev.setMode('photo');
        const since = t.dev.deviceNowMs();
        await t.dev.tap('camera-shutter');
        const media = await t.dev.waitMedia(since, { kind: 'image', timeoutMs: 60000 });
        t.log(`photo après déverrouillage : ${media.name}`);
      },
    },
    {
      id: 'AWK-01',
      title: 'Écran maintenu allumé au viseur, relâché en arrière-plan',
      refs: ['#214'],
      async run(t) {
        await t.dev.ensureViewfinder();
        t.expect(t.dev.keepsScreenOn(), 'KEEP_SCREEN_ON posé au viseur');
        t.dev.home();
        await t.dev.sleep(2500);
        t.expect(!t.dev.keepsScreenOn(), 'KEEP_SCREEN_ON retiré en arrière-plan');
      },
    },
  ],
};
