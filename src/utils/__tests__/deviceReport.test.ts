import { buildDeviceReport } from '../deviceReport';

describe('buildDeviceReport — rapport support copiable (locale-neutre)', () => {
  it('sans diagnostics : en-tête + device + Android uniquement', () => {
    const r = buildDeviceReport(null);
    const lines = r.split('\n');
    expect(lines[0]).toBe('TwinLens · dual camera check');
    expect(lines[1]).toMatch(/^Device: /);
    expect(lines[2]).toMatch(/^Android: .+\(SDK .+\)$/);
    expect(lines).toHaveLength(3);
  });

  it('avec diagnostics : flags concurrent-camera formatés yes/no', () => {
    const r = buildDeviceReport({ concurrentFeature: false, comboCount: 0, frontBackCombo: false });
    expect(r).toContain('Concurrent feature: no');
    expect(r).toContain('Camera combinations: 0');
    expect(r).toContain('Front+back combo: no');
  });

  it('cas multi-cam supporté', () => {
    const r = buildDeviceReport({ concurrentFeature: true, comboCount: 2, frontBackCombo: true });
    expect(r).toContain('Concurrent feature: yes');
    expect(r).toContain('Camera combinations: 2');
    expect(r).toContain('Front+back combo: yes');
  });
});
