import { AppState, type AppStateStatus } from 'react-native';

import { waitForForeground } from '../appState';

type Listener = (state: AppStateStatus) => void;

describe('waitForForeground', () => {
  let listeners: Listener[];
  let remove: jest.Mock;

  beforeEach(() => {
    listeners = [];
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as Listener);
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setCurrentState = (state: AppStateStatus): void => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
  };

  it("résout tout de suite si l'app est déjà active", async () => {
    setCurrentState('active');
    await expect(waitForForeground()).resolves.toBeUndefined();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  it("attend le retour à l'état active, puis se désabonne", async () => {
    setCurrentState('background');
    let resolved = false;
    const pending = waitForForeground().then(() => {
      resolved = true;
    });

    listeners.forEach((l) => l('inactive'));
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(remove).not.toHaveBeenCalled();

    listeners.forEach((l) => l('active'));
    await pending;
    expect(resolved).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
