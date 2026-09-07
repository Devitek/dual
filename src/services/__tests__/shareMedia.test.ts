import { buildShareName } from '../shareMedia';
import type { CapturedMedia } from '../../vision/MultiCamController';

const photo = (uri: string): CapturedMedia => ({
  kind: 'photo',
  primaryUri: uri,
  secondaryUri: null,
  createdAt: new Date('2026-09-07T12:34:56Z').getTime(),
});

const video = (uri: string): CapturedMedia => ({ ...photo(uri), kind: 'video' });

describe('buildShareName — nom de partage lisible', () => {
  it("reprend l'extension de l'URI quand elle existe", () => {
    expect(buildShareName(photo('file:///a/b/IMG_123.jpeg'), 'Photo', 'fr')).toMatch(/\.jpeg$/);
    expect(buildShareName(video('content://media/x/clip.mp4'), 'Vidéo', 'fr')).toMatch(/\.mp4$/);
  });

  it('extensions par défaut : photo → jpg, vidéo → mp4 (URI MediaStore sans extension)', () => {
    expect(buildShareName(photo('content://media/external/images/media/42'), 'Photo', 'fr')).toMatch(/\.jpg$/);
    expect(buildShareName(video('content://media/external/video/media/42'), 'Vidéo', 'fr')).toMatch(/\.mp4$/);
  });

  it('nettoie les caractères interdits du label et de la date', () => {
    const name = buildShareName(photo('file:///x.jpg'), 'Boo/mer:ang*?', 'fr');
    expect(name).not.toMatch(/[\\/:*?"<>|,]/);
    expect(name.startsWith('Boo-mer-ang--')).toBe(true);
  });

  it('locale invalide → repli ISO sans crash', () => {
    const name = buildShareName(photo('file:///x.jpg'), 'Photo', 'xx-INVALID-@@');
    expect(name).toMatch(/^Photo - .+\.jpg$/);
  });
});
