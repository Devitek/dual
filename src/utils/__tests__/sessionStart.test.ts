import { getSessionStartedAt, markSessionStart, resetSessionStartForTests } from '../sessionStart';

beforeEach(() => resetSessionStartForTests());

describe('sessionStart', () => {
  it("vaut null tant que le repère n'est pas posé", () => {
    expect(getSessionStartedAt()).toBeNull();
  });

  it('garde le premier repère posé (appels suivants ignorés)', () => {
    markSessionStart(1_000);
    markSessionStart(5_000);
    expect(getSessionStartedAt()).toBe(1_000);
  });
});
