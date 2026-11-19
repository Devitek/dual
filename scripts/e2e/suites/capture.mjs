/** Captures nominales : chaque capture produit bien UN média dans la galerie. */
export default {
  name: 'capture',
  title: 'Captures nominales',
  cases: [
    {
      id: 'CAP-01',
      title: 'Photo : un média image arrive dans la galerie',
      async run({ dev, expect, log }) {
        await dev.ensureViewfinder();
        await dev.setMode('photo');
        const since = dev.deviceNowMs();
        await dev.tap('camera-shutter');
        const media = await dev.waitMedia(since, { kind: 'image', timeoutMs: 60000 });
        log(`média : ${media.name} (${media.mime})`);
        expect(media.name.startsWith('Dual_'), 'nom Dual_*');
      },
    },
    {
      id: 'CAP-02',
      title: 'Vidéo 5 s : un MP4 composé arrive dans la galerie',
      async run({ dev, expect, log }) {
        await dev.ensureViewfinder();
        await dev.setMode('video');
        await dev.startRecording();
        await dev.sleep(5000);
        const stop = await dev.stopRecording();
        const media = await dev.waitMedia(stop, { kind: 'video', timeoutMs: 120000 });
        log(`média : ${media.name}`);
        expect(media.mime === 'video/mp4', 'MP4');
      },
    },
    {
      id: 'CAP-03',
      title: 'Boomerang (appui long 3 s) : un média arrive dans la galerie',
      async run({ dev, log }) {
        await dev.ensureViewfinder();
        await dev.setMode('boomerang');
        const shutter = await dev.waitFor('camera-shutter');
        const since = dev.deviceNowMs();
        // Appui maintenu = swipe sur place.
        const { cx, cy } = shutter.bounds;
        dev.sh(`input swipe ${cx} ${cy} ${cx} ${cy} 3000`);
        const media = await dev.waitMedia(since, { timeoutMs: 120000 });
        log(`média : ${media.name} (${media.mime})`);
        await dev.setMode('photo');
      },
    },
  ],
};
