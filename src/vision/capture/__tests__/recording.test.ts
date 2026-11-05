// Finalisation d'un enregistrement double : composition au premier plan, et
// repli sur les originaux si la composition échoue (app quittée pendant la prise).
import type { CameraVideoOutput } from 'react-native-vision-camera';

import { waitForForeground } from '../../../utils/appState';
import type { MultiCamSnapshot } from '../../types';
import type { ActiveRecorders, CaptureContext, RecordingAggregate } from '../context';
import { startRecording } from '../recording';

jest.mock('../../../i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../../utils/appState', () => ({ waitForForeground: jest.fn() }));

type FinishedCb = (filePath: string) => void;
type ErrorCb = (error: Error) => void;

/** Sortie vidéo factice : mémorise les callbacks passés à startRecording. */
function fakeVideoOutput(callbacks: { onFinished?: FinishedCb; onError?: ErrorCb }): CameraVideoOutput {
  const recorder = {
    startRecording: jest.fn(async (onFinished: FinishedCb, onError: ErrorCb) => {
      callbacks.onFinished = onFinished;
      callbacks.onError = onError;
    }),
    stopRecording: jest.fn(async () => undefined),
  };
  return { createRecorder: jest.fn(async () => recorder) } as unknown as CameraVideoOutput;
}

function setup(composer: jest.Mock | null) {
  const back: { onFinished?: FinishedCb; onError?: ErrorCb } = {};
  const front: { onFinished?: FinishedCb; onError?: ErrorCb } = {};
  const jobs: (() => Promise<void>)[] = [];
  let recAgg: RecordingAggregate | null = null;
  const recorders: ActiveRecorders = { back: null, front: null };
  const snapshot = {
    mode: 'concurrent',
    isRecording: false,
    isBusy: false,
    videoSaveMode: 'pip',
    pipCorner: 'top-right',
    layout: 'pip',
    pipInset: { x: 0, y: 0, w: 0.3 },
    watermark: false,
    outputRatio: 'full',
    boomerangGif: false,
  } as unknown as MultiCamSnapshot;

  const ctx = {
    getSnapshot: () => snapshot,
    update: jest.fn((patch: Partial<MultiCamSnapshot>) => Object.assign(snapshot, patch)),
    notify: jest.fn(),
    pushCapture: jest.fn(),
    enqueue: jest.fn((job: () => Promise<void>) => jobs.push(job)),
    persist: jest.fn(async (path: string) => `content://media/${path.split('/').pop()}`),
    getQuality: () => ({ videoBitrate: 8_000_000 }),
    getCaptureRotationDegrees: () => 0,
    getPrimarySlot: () => 'back',
    getBoomerangMode: () => false,
    getBackVideo: () => fakeVideoOutput(back),
    getFrontVideo: () => fakeVideoOutput(front),
    getVideoComposer: () => composer,
    getRecorders: () => recorders,
    getRecAgg: () => recAgg!,
    setRecAgg: (agg: RecordingAggregate) => {
      recAgg = agg;
    },
    getRecStartedAt: () => 1,
    setRecStartedAt: jest.fn(),
  } as unknown as CaptureContext & {
    notify: jest.Mock;
    pushCapture: jest.Mock;
    persist: jest.Mock;
  };

  /** Démarre puis simule la fin des deux recorders : renvoie le job de fond mis en file. */
  const record = async (): Promise<() => Promise<void>> => {
    await startRecording(ctx);
    back.onFinished!('/cache/VisionCamera_back.mp4');
    front.onFinished!('/cache/VisionCamera_front.mp4');
    expect(jobs).toHaveLength(1);
    return jobs[0]!;
  };
  const recordAndFinalize = async (): Promise<void> => {
    const job = await record();
    await job();
  };

  return { ctx, record, recordAndFinalize };
}

const mockedWait = waitForForeground as jest.Mock;
const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockedWait.mockReset().mockResolvedValue(undefined);
});

describe('finalisation vidéo', () => {
  it('compose la vidéo PiP une fois au premier plan', async () => {
    const composer = jest.fn().mockResolvedValue('content://media/Dual_PiP.mp4');
    const { ctx, recordAndFinalize } = setup(composer);

    await recordAndFinalize();

    expect(mockedWait).toHaveBeenCalledTimes(1);
    expect(mockedWait.mock.invocationCallOrder[0]!).toBeLessThan(composer.mock.invocationCallOrder[0]!);
    expect(composer).toHaveBeenCalledWith(
      'file:///cache/VisionCamera_back.mp4',
      'file:///cache/VisionCamera_front.mp4',
      expect.objectContaining({ saveOriginals: false }),
    );
    expect(ctx.persist).not.toHaveBeenCalled();
    expect(ctx.pushCapture).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video', primaryUri: 'content://media/Dual_PiP.mp4' }),
    );
    expect(ctx.notify).toHaveBeenCalledWith('success', 'notices.videoSaved');
  });

  it("n'appelle pas le composeur tant que l'app n'est pas revenue au premier plan", async () => {
    let backToForeground: () => void = () => undefined;
    mockedWait.mockReturnValue(new Promise<void>((resolve) => (backToForeground = resolve)));
    const composer = jest.fn().mockResolvedValue('content://media/Dual_PiP.mp4');
    const { record } = setup(composer);

    const job = await record();
    const done = job();
    await flushPromises();
    expect(composer).not.toHaveBeenCalled();

    backToForeground();
    await done;
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('sauvegarde les deux originaux si la composition échoue', async () => {
    const composer = jest.fn().mockRejectedValue(new Error('ForegroundServiceStartNotAllowedException'));
    const { ctx, recordAndFinalize } = setup(composer);

    await recordAndFinalize();

    expect(ctx.persist).toHaveBeenCalledWith('/cache/VisionCamera_back.mp4');
    expect(ctx.persist).toHaveBeenCalledWith('/cache/VisionCamera_front.mp4');
    expect(ctx.pushCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'video',
        primaryUri: 'content://media/VisionCamera_back.mp4',
        secondaryUri: 'content://media/VisionCamera_front.mp4',
      }),
    );
    expect(ctx.notify).toHaveBeenCalledWith('error', 'notices.pipFallbackOriginals');
    expect(ctx.notify).not.toHaveBeenCalledWith('success', expect.anything());
  });
});
