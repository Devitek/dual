/** Smoke : l'app démarre à froid jusqu'à un viseur réellement actif. */
export default {
  name: 'smoke',
  title: 'Démarrage',
  cases: [
    {
      id: 'SMK-01',
      title: 'Lancement à froid : viseur prêt, caméras ouvertes',
      async run({ dev, expect, log }) {
        dev.forceStop();
        await dev.ensureViewfinder();
        const cams = dev.openCameraClients();
        log(`caméras ouvertes : ${cams}`);
        expect(cams >= 1, 'au moins une caméra ouverte');
        expect(dev.present('camera-error') !== true, "pas d'écran d'erreur caméra");
      },
    },
  ],
};
