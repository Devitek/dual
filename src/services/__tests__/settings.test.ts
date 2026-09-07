/**
 * Tests de l'INVARIANT AGENTS.md §8 : `settings.ts` est la source de vérité
 * unique de la persistance. Toute clé écrite doit être relue et validée par
 * `loadPersistedSettings()` — le bug historique (« la disposition était écrite
 * mais jamais restaurée ») ne doit jamais revenir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BURST_VALUES,
  SETTINGS_KEYS,
  TIMER_VALUES,
  loadPersistedSettings,
  parsePipInset,
  saveSetting,
  type PersistedSettings,
  type SettingKey,
} from '../settings';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory jest (pattern officiel du mock)
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** Une valeur PERSISTÉE (chaîne AsyncStorage) valide pour chaque réglage. */
const VALID_RAW: Record<SettingKey, string> = {
  stabilization: '1',
  captureSpeed: 'balanced',
  timerSeconds: '3',
  shutterSound: '0',
  layout: 'sideBySide',
  pipInset: JSON.stringify({ x: 0.1, y: 0.2, w: 0.3 }),
  watermark: '1',
  volumeKeyAction: 'shutter',
  photoSaveMode: 'pip',
  videoSaveMode: 'originals',
  pipCorner: 'bottom-left',
  captureQuality: 'max',
  showSecondaryPreview: '0',
  photoFlash: 'auto',
  mode: 'video',
  grid: '1',
  level: '0',
  burstCount: '5',
  outputRatio: 'tall',
  videoFps: '60',
  boomerangGif: '1',
  mirrorFront: '0',
};

/** La valeur ATTENDUE côté app après lecture/validation. */
const EXPECTED: PersistedSettings = {
  stabilization: true,
  captureSpeed: 'balanced',
  timerSeconds: 3,
  shutterSound: false,
  layout: 'sideBySide',
  pipInset: { x: 0.1, y: 0.2, w: 0.3 },
  watermark: true,
  volumeKeyAction: 'shutter',
  photoSaveMode: 'pip',
  videoSaveMode: 'originals',
  pipCorner: 'bottom-left',
  captureQuality: 'max',
  showSecondaryPreview: false,
  photoFlash: 'auto',
  mode: 'video',
  grid: true,
  level: false,
  burstCount: 5,
  outputRatio: 'tall',
  videoFps: 60,
  boomerangGif: true,
  mirrorFront: false,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('invariant §8 — chaque clé écrite est relue', () => {
  it('loadPersistedSettings relit TOUTES les clés de SETTINGS_KEYS', async () => {
    await AsyncStorage.multiSet(
      (Object.keys(SETTINGS_KEYS) as SettingKey[]).map((k) => [SETTINGS_KEYS[k], VALID_RAW[k]]),
    );
    const out = await loadPersistedSettings();
    // Toute clé déclarée doit ressortir (aucun réglage « écrit mais jamais relu »).
    expect(Object.keys(out).sort()).toEqual(Object.keys(SETTINGS_KEYS).sort());
    expect(out).toEqual(EXPECTED);
  });

  it('VALID_RAW couvre exactement SETTINGS_KEYS (le test casse si on ajoute une clé sans le mettre à jour)', () => {
    expect(Object.keys(VALID_RAW).sort()).toEqual(Object.keys(SETTINGS_KEYS).sort());
  });

  it('stockage vide → objet vide (tout repart aux défauts)', async () => {
    await expect(loadPersistedSettings()).resolves.toEqual({});
  });
});

describe('validation — les valeurs corrompues sont ignorées, jamais propagées', () => {
  it.each([
    ['captureSpeed', 'turbo'],
    ['timerSeconds', '7'],
    ['layout', 'diagonal'],
    ['pipInset', '{"x":9,"y":0,"w":0.3}'],
    ['pipInset', 'pas-du-json'],
    ['volumeKeyAction', 'selfie'],
    ['photoSaveMode', 'cloud'],
    ['pipCorner', 'center'],
    ['captureQuality', 'ultra'],
    ['photoFlash', 'strobe'],
    ['mode', 'panorama'],
    ['burstCount', '4'],
    ['outputRatio', '21:9'],
    ['videoFps', '24'],
  ] as [SettingKey, string][])('%s = %p → absent du résultat', async (key, raw) => {
    await AsyncStorage.setItem(SETTINGS_KEYS[key], raw);
    const out = await loadPersistedSettings();
    expect(out).not.toHaveProperty(key);
  });

  it('un échec AsyncStorage ne crashe pas (retourne {})', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(loadPersistedSettings()).resolves.toEqual({});
  });
});

describe('saveSetting — sérialisation', () => {
  it('booléens → "1"/"0"', () => {
    saveSetting('grid', true);
    saveSetting('level', false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SETTINGS_KEYS.grid, '1');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SETTINGS_KEYS.level, '0');
  });

  it('nombres → décimal, objets → JSON', () => {
    saveSetting('videoFps', 60);
    saveSetting('pipInset', { x: 0.5, y: 0.5, w: 0.25 });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SETTINGS_KEYS.videoFps, '60');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_KEYS.pipInset,
      JSON.stringify({ x: 0.5, y: 0.5, w: 0.25 }),
    );
  });

  it('null → suppression de la clé (retour au coin)', () => {
    saveSetting('pipInset', null);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SETTINGS_KEYS.pipInset);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('aller-retour : ce que saveSetting écrit, loadPersistedSettings le relit', async () => {
    saveSetting('layout', 'topBottom');
    saveSetting('burstCount', 10);
    saveSetting('showSecondaryPreview', false);
    await new Promise((r) => setTimeout(r, 0)); // écritures async best-effort
    const out = await loadPersistedSettings();
    expect(out.layout).toBe('topBottom');
    expect(out.burstCount).toBe(10);
    expect(out.showSecondaryPreview).toBe(false);
  });
});

describe('parsePipInset — bornes', () => {
  it.each([
    [{ x: 0, y: 0, w: 0.18 }, true],
    [{ x: 1, y: 1, w: 1 }, true],
    [{ x: -0.01, y: 0, w: 0.3 }, false],
    [{ x: 0, y: 1.01, w: 0.3 }, false],
    [{ x: 0, y: 0, w: 0 }, false],
    [{ x: 0, y: 0, w: 1.01 }, false],
  ])('%p → %p', (inset, ok) => {
    expect(parsePipInset(JSON.stringify(inset))).toEqual(ok ? inset : null);
  });

  it('constantes exportées cohérentes', () => {
    expect(TIMER_VALUES).toEqual([0, 3, 10]);
    expect(BURST_VALUES).toEqual([1, 3, 5, 10]);
  });
});
