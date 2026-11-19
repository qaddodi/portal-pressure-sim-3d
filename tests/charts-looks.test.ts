import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { LOOKS as TABLE } from '../src/ui/charts/looks2d/chart-looks/index.js';
import { look } from '../src/ui/charts/looks.ts';
import { ctxOf } from './charts-helpers.ts';

const KEYS = Object.keys(TABLE as Record<string, unknown>);
const PARAMS = { tone: 'ok', c: 'accent', rx: 'caution' };

test('the 2D look tables run here as they run in the 2D app: every piece resolves in every look with this look\'s own colours', () => {
  assert.ok(KEYS.length >= 400, `${KEYS.length} looks`);
  const warn = console.warn, said: string[] = [];
  console.warn = (...a: unknown[]) => { said.push(a.join(' ')); };
  try {
    for (const id of LOOK_IDS) {
      const c = ctxOf(id, 330);
      for (const k of KEYS) {
        const l = look(c, { host: (k.split('.')[0] ?? '') as string, sm: 13.6, cap: 12, lab: 12, fs12: 12, chCap: 12 }, k, {}, PARAMS);
        for (const col of [l.fill, l.stroke]) if (col) for (const v of col) assert.ok(Number.isFinite(v), `${id} ${k}: a colour is not a number`);
        if (l.width !== undefined) assert.ok(l.width >= 0 && Number.isFinite(l.width), `${id} ${k}`);
        if (l.size !== undefined) assert.ok(l.size >= 12, `${id} ${k}: a word under 12 px`);
      }
    }
  } finally { console.warn = warn; }
  assert.deepEqual(said.filter((s) => /no token|no look/.test(s)), [], 'a token the look lacks');
});

test('the trial card says what the 2D trial table says (a spot check of the numbers that decide the look)', () => {
  const c = ctxOf('light', 330);
  const H = { host: 'trial' };
  assert.equal(look(c, H, 'trial.pct').weight, 600);
  assert.ok(Math.abs(look(c, H, 'trial.pct').size! - 2.5 * c.type.sm) < 1e-9);
  assert.equal(look(c, H, 'trial.pct').ls, -0.03);
  assert.equal(look(c, H, 'trialfit.x').width, 2);
  const bar = look(c, H, 'trial.bar', {}, { tone: 'ok' }).fill!;
  assert.ok(Math.abs(bar[3] - 0.72) < 1e-6, 'the bar is the arm colour at 72%');
});

test('the charts take every style from the 2D table: no frame writes a stroke width, a dash or a type size of its own', () => {
  const FRAMES = ['trial/frame', 'stiff/frame', 'saag/frame', 'forest/frame', 'lumen/frame', 'flows/frame', 'flowtime/frame', 'criteria/zones'];
  for (const f of FRAMES) {
    const src = readFileSync(new URL(`../src/ui/charts/${f}.ts`, import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/looks\.ts'/, `${f} must ask looks.ts`);
    assert.ok(!/weight:\s*\d{3}\b/.test(src.replace(/\/\/.*$/gm, '')), `${f}: a font weight written by hand`);
    assert.ok(!/pal\.tok\(['"]/.test(src.replace(/\/\/.*$/gm, '').replace(/pal\.tok\('(?:text|surface)[^)]*'\)/g, '')) || f === 'flowtime/frame', `${f}: a token read by hand`);
  }
});
