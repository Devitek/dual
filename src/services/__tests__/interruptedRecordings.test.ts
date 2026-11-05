// Récupération des enregistrements bruts restés dans le cache.
import { Directory, File } from 'expo-file-system';

import { findInterruptedRecordings, recoverInterruptedRecordings } from '../interruptedRecordings';

// jest.mock est remonté au-dessus des imports : seules les variables `mock*` y sont accessibles.
const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    name: string;
    size: number | null;
    modificationTime: number | null;
    constructor(uri: string, size: number | null = 1, modificationTime: number | null = 0) {
      this.uri = uri;
      this.name = uri.split('/').pop() ?? '';
      this.size = size;
      this.modificationTime = modificationTime;
    }
    delete(): void {
      mockDeleted.push(this.uri);
    }
  }
  class Directory {
    uri: string;
    name: string;
    constructor(uri: string) {
      this.uri = uri;
      this.name = uri.split('/').pop() ?? '';
    }
  }
  return { File, Directory, Paths: { cache: { list: () => [] } } };
});
jest.mock('expo-media-library/legacy', () => ({ saveToLibraryAsync: jest.fn() }));

const SESSION = 1_000_000;
const CacheFile = File as unknown as new (uri: string, size?: number | null, mtime?: number | null) => File;
const CacheDir = Directory as unknown as new (uri: string) => Directory;

const deps = (entries: (File | Directory)[], save = jest.fn().mockResolvedValue(undefined)) => ({
  listCache: () => entries,
  save,
  sessionStartedAt: SESSION,
});

beforeEach(() => {
  mockDeleted.length = 0;
});

describe('findInterruptedRecordings', () => {
  it("ne garde que les VisionCamera_*.mp4 non vides d'une session précédente", () => {
    const entries = [
      new CacheFile('file:///cache/VisionCamera_2.mp4', 200, SESSION - 10),
      new CacheFile('file:///cache/VisionCamera_1.mp4', 100, SESSION - 20),
      new CacheFile('file:///cache/VisionCamera_live.mp4', 300, SESSION + 5), // session en cours
      new CacheFile('file:///cache/VisionCamera_empty.mp4', 0, SESSION - 5), // vide
      new CacheFile('file:///cache/pip_123.mp4', 400, SESSION - 5), // autre fichier
      new CacheDir('file:///cache/VisionCamera_dir.mp4'), // dossier
    ];
    const found = findInterruptedRecordings(deps(entries));
    expect(found.map((r) => r.name)).toEqual(['VisionCamera_1.mp4', 'VisionCamera_2.mp4']);
    expect(found[0]).toMatchObject({ size: 100, modifiedAt: SESSION - 20 });
  });

  it('renvoie une liste vide si le cache est illisible', () => {
    const failing = {
      ...deps([]),
      listCache: () => {
        throw new Error('EACCES');
      },
    };
    expect(findInterruptedRecordings(failing)).toEqual([]);
  });
});

describe('recoverInterruptedRecordings', () => {
  it('sauvegarde puis supprime chaque fichier ; garde ceux en échec', async () => {
    const save = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('MediaStore'));
    const recordings = [
      { uri: 'file:///cache/VisionCamera_1.mp4', name: 'VisionCamera_1.mp4', size: 1, modifiedAt: 1 },
      { uri: 'file:///cache/VisionCamera_2.mp4', name: 'VisionCamera_2.mp4', size: 1, modifiedAt: 2 },
    ];
    const result = await recoverInterruptedRecordings(recordings, { save });
    expect(result).toEqual({ saved: 1, failed: 1 });
    expect(save).toHaveBeenCalledTimes(2);
    expect(mockDeleted).toEqual(['file:///cache/VisionCamera_1.mp4']);
  });
});
