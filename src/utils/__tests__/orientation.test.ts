import { angleDelta, orientationFromAccel, uiRotationFor, type DeviceOrientation } from '../orientation';

describe('angleDelta', () => {
  it('replie dans [-180, 180]', () => {
    expect(angleDelta(0, 0)).toBe(0);
    expect(angleDelta(170, -170)).toBe(-20);
    expect(angleDelta(-170, 170)).toBe(20);
    // 180 et -180 representent le meme ecart : seul le module compte.
    expect(Math.abs(angleDelta(90, 270))).toBe(180);
  });
});

describe('orientationFromAccel', () => {
  const cases: { nom: string; x: number; y: number; prev: DeviceOrientation; attendu: DeviceOrientation }[] = [
    { nom: 'portrait droit', x: 0, y: 1, prev: 90, attendu: 0 },
    { nom: '90° horaire (bord droit en bas)', x: 1, y: 0, prev: 0, attendu: 90 },
    { nom: 'tête en bas', x: 0, y: -1, prev: 0, attendu: 180 },
    { nom: '270° (bord gauche en bas)', x: -1, y: 0, prev: 0, attendu: 270 },
  ];
  for (const c of cases) {
    it(c.nom, () => {
      expect(orientationFromAccel(c.x, c.y, c.prev)).toBe(c.attendu);
    });
  }

  it('hystérésis : à 45° pile on ne bascule pas', () => {
    // 45° entre portrait (0) et paysage (90) : hors de la fenêtre de ±30°.
    const x = Math.SQRT1_2;
    const y = Math.SQRT1_2;
    expect(orientationFromAccel(x, y, 0)).toBe(0);
    expect(orientationFromAccel(x, y, 90)).toBe(90);
  });

  it('bascule une fois la fenêtre de 30° atteinte', () => {
    // 65° depuis le portrait : à 25° de l'axe 90 -> bascule.
    const rad = (65 * Math.PI) / 180;
    expect(orientationFromAccel(Math.sin(rad), Math.cos(rad), 0)).toBe(90);
  });

  it('téléphone à plat : conserve l’orientation courante', () => {
    expect(orientationFromAccel(0.1, 0.1, 90)).toBe(90);
    expect(orientationFromAccel(0, 0, 180)).toBe(180);
  });
});

describe('uiRotationFor', () => {
  it('inverse la rotation du téléphone, représentant court', () => {
    expect(uiRotationFor(0)).toBe(0);
    expect(uiRotationFor(90)).toBe(-90);
    expect(uiRotationFor(180)).toBe(180);
    expect(uiRotationFor(270)).toBe(90);
  });
});
