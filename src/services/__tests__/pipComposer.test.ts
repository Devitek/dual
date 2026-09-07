import {
  DEFAULT_PIP_LAYOUT,
  PIP_INSET_ASPECT,
  PIP_INSET_MAX_W,
  PIP_INSET_MIN_W,
  buildFfmpegPipCommand,
  pipRatioFactor,
} from '../pipComposer';

describe('pipRatioFactor — ratio hauteur/largeur du canvas', () => {
  it.each([
    ['full', 4 / 3],
    ['square', 1],
    ['tall', 16 / 9],
  ] as const)('%s → %p', (ratio, factor) => {
    expect(pipRatioFactor(ratio)).toBeCloseTo(factor, 10);
  });
});

describe('bornes de la vignette PiP (partagées preview ↔ composition)', () => {
  it('min < défaut < max, aspect portrait', () => {
    expect(PIP_INSET_MIN_W).toBeLessThan(DEFAULT_PIP_LAYOUT.insetWidthRatio);
    expect(DEFAULT_PIP_LAYOUT.insetWidthRatio).toBeLessThan(PIP_INSET_MAX_W);
    expect(PIP_INSET_ASPECT).toBeGreaterThan(1); // portrait
  });
});

describe('buildFfmpegPipCommand — commande de référence', () => {
  const params = {
    mainVideoPath: '/tmp/main.mp4',
    insetVideoPath: '/tmp/inset.mp4',
    outputPath: '/tmp/out.mp4',
  };

  it('inclut entrées, scale de la vignette et sortie', () => {
    const cmd = buildFfmpegPipCommand(params);
    expect(cmd).toContain('-i "/tmp/main.mp4"');
    expect(cmd).toContain('-i "/tmp/inset.mp4"');
    expect(cmd).toContain(`scale=iw*${DEFAULT_PIP_LAYOUT.insetWidthRatio.toFixed(3)}`);
    expect(cmd).toContain('"/tmp/out.mp4"');
  });

  it.each([
    ['top-left', /overlay=main_w\*0\.040:main_w\*0\.040/],
    ['top-right', /overlay=main_w-overlay_w-main_w\*0\.040:main_w\*0\.040/],
    ['bottom-left', /overlay=main_w\*0\.040:main_h-overlay_h-main_w\*0\.040/],
    ['bottom-right', /overlay=main_w-overlay_w-main_w\*0\.040:main_h-overlay_h-main_w\*0\.040/],
  ] as const)('coin %s → expression overlay correcte', (corner, rx) => {
    const cmd = buildFfmpegPipCommand({ ...params, layout: { ...DEFAULT_PIP_LAYOUT, corner } });
    expect(cmd).toMatch(rx);
  });
});
