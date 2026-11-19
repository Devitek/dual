/**
 * Registre des suites device (issue #263). Identifiants de cas = ceux du cahier
 * de test (docs-dev/test-plan.md). Un cas :
 *   { id, title, refs?, tags?: ['interactive' | 'destructive' | 'multicam'],
 *     known?: { issue, reason },   // échec attendu tant que l'issue est ouverte
 *     run: async (t) => { ... } }  // t = { dev, log, expect, skip, prompt, sleep }
 */
import capture from './capture.mjs';
import fresh from './fresh.mjs';
import interruption from './interruption.mjs';
import lifecycle from './lifecycle.mjs';
import settings from './settings.mjs';
import smoke from './smoke.mjs';

export const SUITES = [smoke, capture, interruption, lifecycle, settings, fresh];
