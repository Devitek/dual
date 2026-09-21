import {
  applyCompletion,
  callsOfDay,
  computeStreak,
  dayStartOf,
  drawCallTimes,
  drawNextCallIfBelowCap,
  getActiveCall,
  groupCallsByDay,
  pruneFuturePending,
  resolveExpiredCalls,
  OTS_CAPTURE_WINDOW_MS,
  OTS_MIN_GAP_MS,
  type OtsCall,
} from '../onTheSpot';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory jest (pattern officiel du mock)
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-file-system (copie durable) n'existe pas sous Jest : mock minimal.
jest.mock('expo-file-system', () => ({
  Paths: { document: '/mock' },
  Directory: jest.fn(),
  File: jest.fn(),
}));

// expo-notifications n'a pas de module natif sous Jest : on ne teste ici que
// la logique PURE, le mock neutralise le setNotificationHandler d'import.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const DAY = 24 * 3_600_000;
const H = 3_600_000;

/** Un jour local de référence (le test est indépendant du fuseau : on dérive tout de dayStartOf). */
const DAY_START = dayStartOf(1_800_000_000_000);

describe('drawCallTimes', () => {
  const base = {
    windowStartHour: 9,
    windowEndHour: 19,
    dayStartMs: DAY_START,
    earliestMs: 0,
    random: () => 0.5,
  };

  it('tire le nombre demandé, trié, dans la plage', () => {
    const times = drawCallTimes({ ...base, count: 3 });
    expect(times).toHaveLength(3);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(DAY_START + 9 * H);
      expect(t).toBeLessThanOrEqual(DAY_START + 19 * H);
    }
  });

  it('espace les appels d’au moins OTS_MIN_GAP_MS', () => {
    const times = drawCallTimes({ ...base, count: 3, random: () => 0.99 });
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? Number.NaN));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(OTS_MIN_GAP_MS);
    }
  });

  it('respecte earliestMs (appel du jour jamais dans le passé)', () => {
    const earliest = DAY_START + 18 * H; // il ne reste qu'une heure de plage
    const times = drawCallTimes({ ...base, count: 1, earliestMs: earliest });
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThanOrEqual(earliest);
  });

  it('fenêtre restante trop courte : rend moins d’appels, jamais forcés', () => {
    // 30 min restantes : un seul appel possible malgré count=3.
    const earliest = DAY_START + 19 * H - 30 * 60_000;
    const times = drawCallTimes({ ...base, count: 3, earliestMs: earliest });
    expect(times.length).toBeLessThanOrEqual(1);
  });

  it('fenêtre déjà terminée : aucun appel', () => {
    expect(drawCallTimes({ ...base, count: 2, earliestMs: DAY_START + 20 * H })).toEqual([]);
  });

  it('déterministe à générateur fixé', () => {
    const a = drawCallTimes({ ...base, count: 2, random: () => 0.25 });
    const b = drawCallTimes({ ...base, count: 2, random: () => 0.25 });
    expect(a).toEqual(b);
  });
});

describe('callsOfDay', () => {
  const mk = (scheduledAt: number): OtsCall => ({ id: String(scheduledAt), scheduledAt, status: 'pending' });

  it('filtre par journée locale', () => {
    const journal = [mk(DAY_START + 10 * H), mk(DAY_START + DAY + 10 * H), mk(DAY_START - 1)];
    const today = callsOfDay(journal, DAY_START);
    expect(today).toHaveLength(1);
    expect(today[0]?.scheduledAt).toBe(DAY_START + 10 * H);
  });
});

describe('pruneFuturePending', () => {
  const NOW = DAY_START + 12 * H;
  const mk = (scheduledAt: number, status: OtsCall['status']): OtsCall => ({
    id: String(scheduledAt),
    scheduledAt,
    status,
  });

  it('retire les appels futurs en attente, garde tout le passé', () => {
    const journal = [
      mk(NOW - 2 * H, 'done'),
      mk(NOW - H, 'missed'),
      mk(NOW - 30 * 60_000, 'pending'), // passé mais pas encore statué : conservé
      mk(NOW + 2 * H, 'pending'), // futur annulé : purgé
    ];
    const pruned = pruneFuturePending(journal, NOW);
    expect(pruned).toHaveLength(3);
    expect(pruned.some((c) => c.scheduledAt === NOW + 2 * H)).toBe(false);
  });

  it('ne touche pas aux appels futurs déjà statués (cas théorique)', () => {
    const journal = [mk(NOW + H, 'done')];
    expect(pruneFuturePending(journal, NOW)).toHaveLength(1);
  });
});

describe('fenêtre de capture (chantier 2)', () => {
  const NOW = DAY_START + 12 * H;
  const mk = (scheduledAt: number, status: OtsCall['status'] = 'pending'): OtsCall => ({
    id: String(scheduledAt),
    scheduledAt,
    status,
  });

  describe('getActiveCall', () => {
    it('rend l’appel dont la fenêtre est ouverte', () => {
      const call = mk(NOW - 60_000);
      expect(getActiveCall([call], NOW)?.id).toBe(call.id);
    });
    it('null avant l’horaire, après la fenêtre, ou si statué', () => {
      expect(getActiveCall([mk(NOW + 1)], NOW)).toBeNull();
      expect(getActiveCall([mk(NOW - OTS_CAPTURE_WINDOW_MS)], NOW)).toBeNull();
      expect(getActiveCall([mk(NOW - 60_000, 'done')], NOW)).toBeNull();
    });
  });

  describe('resolveExpiredCalls', () => {
    it('statue « manqué » les fenêtres passées, même référence sinon', () => {
      const fresh = [mk(NOW - 60_000), mk(NOW + H)];
      expect(resolveExpiredCalls(fresh, NOW)).toBe(fresh);
      const expired = [mk(NOW - OTS_CAPTURE_WINDOW_MS - 1), mk(NOW - 60_000)];
      const resolved = resolveExpiredCalls(expired, NOW);
      expect(resolved).not.toBe(expired);
      expect(resolved[0]?.status).toBe('missed');
      expect(resolved[1]?.status).toBe('pending'); // fenêtre encore ouverte
    });
  });

  describe('applyCompletion', () => {
    it('statue « done » avec le média si la fenêtre est ouverte', () => {
      const call = mk(NOW - 60_000);
      const { journal, completed } = applyCompletion([call], call.id, 'file://x.jpg', NOW);
      expect(completed).toBe(true);
      expect(journal[0]?.status).toBe('done');
      expect(journal[0]?.mediaUri).toBe('file://x.jpg');
    });
    it('ignore si fenêtre close, appel inconnu ou déjà statué', () => {
      expect(
        applyCompletion([mk(NOW - OTS_CAPTURE_WINDOW_MS)], String(NOW - OTS_CAPTURE_WINDOW_MS), 'u', NOW).completed,
      ).toBe(false);
      expect(applyCompletion([], 'inconnu', 'u', NOW).completed).toBe(false);
      expect(applyCompletion([mk(NOW - 60_000, 'done')], String(NOW - 60_000), 'u', NOW).completed).toBe(false);
    });
  });

  describe('drawNextCallIfBelowCap (#199 : un manqué ne clôt plus la journée)', () => {
    const settings = { enabled: true, minPerDay: 1, maxPerDay: 3, windowStart: 9, windowEnd: 19 } as const;
    const midday = dayStartOf(NOW) + 12 * H;

    it('tire le suivant après un MANQUÉ, sous le plafond (le cas cœur)', () => {
      const next = drawNextCallIfBelowCap([mk(midday - 2 * H, 'missed')], settings, midday, () => 0.5);
      expect(next).not.toBeNull();
      expect(next?.status).toBe('pending');
      expect(next?.scheduledAt).toBeGreaterThan(midday);
      expect(next?.scheduledAt).toBeLessThanOrEqual(dayStartOf(midday) + 19 * H);
    });

    it('tire aussi après une réussite (mécanique unifiée)', () => {
      expect(drawNextCallIfBelowCap([mk(midday - 2 * H, 'done')], settings, midday, () => 0.5)).not.toBeNull();
    });

    it('rien au plafond quotidien', () => {
      const journal = [mk(midday - 4 * H, 'missed'), mk(midday - 3 * H, 'missed'), mk(midday - 2 * H, 'done')];
      expect(drawNextCallIfBelowCap(journal, settings, midday)).toBeNull();
    });

    it('rien si un appel du jour est encore en attente (au plus un pending)', () => {
      expect(drawNextCallIfBelowCap([mk(midday + 2 * H, 'pending')], settings, midday)).toBeNull();
      // pending ACTIF (fenêtre ouverte) : idem
      expect(drawNextCallIfBelowCap([mk(midday - 60_000, 'pending')], settings, midday)).toBeNull();
    });

    it('rien si la fenêtre du jour est finie', () => {
      const evening = dayStartOf(NOW) + 20 * H;
      expect(drawNextCallIfBelowCap([mk(evening - 5 * H, 'missed')], settings, evening)).toBeNull();
    });

    it('ne compte que les appels du jour', () => {
      const journal = [mk(midday - DAY, 'missed'), mk(midday - DAY - H, 'missed'), mk(midday - DAY - 2 * H, 'missed')];
      expect(drawNextCallIfBelowCap(journal, settings, midday)).not.toBeNull();
    });
  });
});

describe('groupCallsByDay (chantier 4)', () => {
  const mk = (scheduledAt: number): OtsCall => ({ id: String(scheduledAt), scheduledAt, status: 'pending' });

  it('groupe par jour local, jours décroissants, appels croissants', () => {
    const journal = [mk(DAY_START + 15 * H), mk(DAY_START + DAY + 10 * H), mk(DAY_START + 9 * H)];
    const groups = groupCallsByDay(journal);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.dayStartMs).toBe(dayStartOf(DAY_START + DAY)); // le plus récent d'abord
    expect(groups[1]?.calls.map((c) => c.scheduledAt)).toEqual([DAY_START + 9 * H, DAY_START + 15 * H]);
  });

  it('journal vide : aucun groupe', () => {
    expect(groupCallsByDay([])).toEqual([]);
  });
});

describe('computeStreak (chantier 3)', () => {
  const NOW = DAY_START + 15 * H; // en journée
  const done = (dayOffset: number): OtsCall => ({
    id: `d${dayOffset}`,
    scheduledAt: dayStartOf(DAY_START - dayOffset * DAY) + 10 * H,
    status: 'done',
  });
  const missed = (dayOffset: number): OtsCall => ({ ...done(dayOffset), id: `m${dayOffset}`, status: 'missed' });

  it('journal vide : zéro partout', () => {
    expect(computeStreak([], NOW)).toEqual({ current: 0, best: 0 });
  });

  it('réussite aujourd’hui : série de 1', () => {
    expect(computeStreak([done(0)], NOW)).toEqual({ current: 1, best: 1 });
  });

  it('pas encore de réussite aujourd’hui : la série d’hier tient (journée en cours)', () => {
    expect(computeStreak([done(1), done(2)], NOW).current).toBe(2);
  });

  it('un jour manqué casse la série en cours, pas le record', () => {
    // réussites J-1..J-3, trou à J-4, réussites J-5..J-9 (série de 5)
    const journal = [done(1), done(2), done(3), missed(4), done(5), done(6), done(7), done(8), done(9)];
    const s = computeStreak(journal, NOW);
    expect(s.current).toBe(3);
    expect(s.best).toBe(5);
  });

  it('plusieurs réussites le même jour comptent pour un seul jour', () => {
    const twice: OtsCall = { ...done(0), id: 'bis', scheduledAt: done(0).scheduledAt + 2 * H };
    expect(computeStreak([done(0), twice], NOW)).toEqual({ current: 1, best: 1 });
  });

  it('les manqués seuls ne comptent jamais', () => {
    expect(computeStreak([missed(0), missed(1)], NOW)).toEqual({ current: 0, best: 0 });
  });

  it('avant-hier sans hier : série cassée malgré la journée en cours', () => {
    expect(computeStreak([done(2), done(3)], NOW).current).toBe(0);
  });
});

describe('dayStartOf', () => {
  it('minuit local, idempotent', () => {
    const start = dayStartOf(1_800_000_000_000);
    expect(dayStartOf(start)).toBe(start);
    expect(dayStartOf(start + 5 * H)).toBe(start);
  });
});
