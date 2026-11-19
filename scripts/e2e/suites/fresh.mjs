/**
 * Installation fraîche. DESTRUCTIF : `pm clear` efface les données ET le cache de
 * l'app (réglages, journal, enregistrements bruts orphelins). Opt-in uniquement
 * (--allow-destructive), jamais sur un téléphone dont on veut garder le cache.
 */
export default {
  name: 'fresh',
  title: 'Installation fraîche (destructif)',
  cases: [
    {
      id: 'FRS-01',
      title: 'Données effacées : permissions, onboarding, viseur prêt',
      tags: ['destructive'],
      async run({ dev, expect }) {
        dev.sh(`pm clear ${dev.PKG}`);
        dev.grant();
        await dev.ensureViewfinder({ timeoutMs: 45000 });
        expect(dev.openCameraClients() >= 1, 'caméras ouvertes après onboarding');
      },
    },
  ],
};
