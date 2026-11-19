/**
 * Persistance des réglages (AGENTS.md §8) : un réglage modifié doit survivre à
 * la mort du processus. Chaque cas restaure l'état initial de l'utilisateur.
 */
const MODES = ['photo', 'video'];
const LAYOUTS = ['pip', 'sideBySide', 'topBottom'];

async function openSheet(dev) {
  await dev.tap('camera-settings-open');
  await dev.waitFor('setting-layout-pip');
}
const closeSheet = (dev) => dev.sh('input keyevent KEYCODE_BACK');

function selectedOf(dev, prefix, values) {
  const nodes = dev.dumpNodes();
  return values.find((v) => nodes.find((n) => n.id === `${prefix}-${v}`)?.selected) ?? null;
}

export default {
  name: 'settings',
  title: 'Persistance des réglages (§8)',
  cases: [
    {
      id: 'SET-01',
      title: 'Mode de capture conservé après arrêt forcé',
      async run({ dev, expect, log }) {
        await dev.ensureViewfinder();
        const initial = selectedOf(dev, 'mode', ['photo', 'video', 'boomerang']);
        const target = MODES.find((m) => m !== initial);
        log(`mode initial ${initial}, cible ${target}`);
        await dev.setMode(target);
        dev.forceStop();
        await dev.ensureViewfinder();
        const after = selectedOf(dev, 'mode', ['photo', 'video', 'boomerang']);
        if (initial) await dev.setMode(initial);
        expect(after === target, `mode ${target} restauré (lu : ${after})`);
      },
    },
    {
      id: 'SET-02',
      title: 'Disposition (réglages rapides) conservée après arrêt forcé',
      tags: ['multicam'],
      async run({ dev, expect, log }) {
        await dev.ensureViewfinder();
        await openSheet(dev);
        const initial = selectedOf(dev, 'setting-layout', LAYOUTS);
        const target = LAYOUTS.find((l) => l !== initial);
        log(`disposition initiale ${initial}, cible ${target}`);
        await dev.tap(`setting-layout-${target}`);
        await dev.sleep(500);
        closeSheet(dev);
        dev.forceStop();
        await dev.ensureViewfinder();
        await openSheet(dev);
        const after = selectedOf(dev, 'setting-layout', LAYOUTS);
        if (initial) await dev.tap(`setting-layout-${initial}`);
        closeSheet(dev);
        expect(after === target, `disposition ${target} restaurée (lue : ${after})`);
      },
    },
  ],
};
