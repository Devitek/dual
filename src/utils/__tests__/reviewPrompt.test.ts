import { shouldRequestReview, REVIEW_MIN_CAPTURES, REVIEW_MIN_DAYS } from '../reviewPrompt';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

/** État qui remplit TOUTES les conditions ; chaque test en casse une seule. */
const ok = {
  captureCount: REVIEW_MIN_CAPTURES,
  firstLaunchAt: NOW - REVIEW_MIN_DAYS * DAY_MS,
  alreadyRequested: false,
  sessionHadError: false,
  now: NOW,
};

describe('shouldRequestReview', () => {
  it('déclenche quand toutes les conditions sont réunies', () => {
    expect(shouldRequestReview(ok)).toBe(true);
  });

  it('jamais deux fois (marqueur alreadyRequested)', () => {
    expect(shouldRequestReview({ ...ok, alreadyRequested: true })).toBe(false);
  });

  it('jamais après une erreur de capture dans la session', () => {
    expect(shouldRequestReview({ ...ok, sessionHadError: true })).toBe(false);
  });

  it('pas avant le seuil de captures', () => {
    expect(shouldRequestReview({ ...ok, captureCount: REVIEW_MIN_CAPTURES - 1 })).toBe(false);
  });

  it('pas avant le délai depuis le premier lancement', () => {
    expect(shouldRequestReview({ ...ok, firstLaunchAt: NOW - (REVIEW_MIN_DAYS * DAY_MS - 1) })).toBe(false);
  });

  it('premier lancement inconnu : jamais solliciter', () => {
    expect(shouldRequestReview({ ...ok, firstLaunchAt: null })).toBe(false);
  });

  it('les seuils sont bien 10 captures / 7 jours (contrat #179)', () => {
    expect(REVIEW_MIN_CAPTURES).toBe(10);
    expect(REVIEW_MIN_DAYS).toBe(7);
  });
});
