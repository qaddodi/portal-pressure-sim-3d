import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LabelFader, type Want } from '../src/scene/labels/fade.ts';
import { DIM_ALPHA, FADE, labelOpacity } from '../src/scene/labels/alpha.ts';
import type { Placement } from '../src/scene/labels/solver.ts';

const P = (dx: number, dy = 0, extra: Partial<Placement> = {}): Placement => ({ id: 'a', form: 0, dx, dy, w: 100, h: 26, leader: false, au: 0.5, ...extra });
const want = (p: Placement, dim = false): ReadonlyMap<string, Want> => new Map([[p.id, { p, dim }]]);
const run = (f: LabelFader, ms: number, w: ReadonlyMap<string, Want>, hold = false, log?: (s: { x: number; a: number } | null) => void) => {
  for (let t = 0; t < ms; t += 16) { f.step(16, w, hold); const s = f.frame.get('a'); log?.(s ? { x: s.p.dx, a: s.alpha } : null); }
};

test('a label that appears fades in where it will stand: it never starts moving from somewhere else', () => {
  const f = new LabelFader();
  const seen: number[] = [];
  run(f, 400, want(P(10)), false, (s) => { if (s) seen.push(s.x); });
  assert.ok(seen.length > 0 && seen.every((x) => x === 10));
  assert.equal(f.frame.get('a')!.alpha, 1);
});

test('a label wanted at another spot fades out where it stands, then fades in at the new spot: it never slides', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  const trail: { x: number; a: number }[] = [];
  run(f, 800, want(P(200, 40)), false, (s) => { if (s) trail.push(s); });
  const xs = new Set(trail.map((s) => s.x));
  assert.deepEqual([...xs].sort((a, b) => a - b), [10, 200], 'only the old and the new spot are ever drawn');
  const swap = trail.findIndex((s) => s.x === 200);
  assert.ok(trail[swap].a <= 0.2, 'it is invisible at the moment it takes the new spot');
  assert.ok(trail.slice(0, swap).some((s) => s.a < 1), 'it faded out first');
  assert.equal(trail[trail.length - 1].a, 1);
});

test('linear fades take the times of the motion table: out 120 ms, in 180 ms', () => {
  const f = new LabelFader();
  let t = 0;
  while (f.step(10, want(P(0)), false) || (f.frame.get('a')?.alpha ?? 0) < 1) { t += 10; if (t > 2000) break; }
  assert.ok(Math.abs(t - FADE.inMs) <= 20, `faded in over ${t} ms`);
  t = 0;
  while ((f.frame.get('a')?.alpha ?? 0) > 0) { f.step(10, want(P(0)), true); t += 10; if (t > 2000) break; }
  assert.ok(Math.abs(t - FADE.outMs) <= 20, `faded out over ${t} ms`);
});

test('while the picture moves (hold) everything fades out at once and nothing new appears; it comes back after the hold', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  run(f, 300, want(P(10)), true);
  assert.equal(f.visible, false);
  const f2 = new LabelFader();
  run(f2, 300, want(P(10)), true);
  assert.equal(f2.frame.size, 0, 'a label that was never shown does not start during a hold');
  run(f, 400, want(P(10)), false);
  assert.equal(f.frame.get('a')!.alpha, 1);
});

test('a label the solver no longer wants fades out and is forgotten', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  run(f, 400, new Map());
  assert.equal(f.frame.size, 0);
});

test('dimming eases between bright and dim, and the opacity is the fade times the dim value (65 %)', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10), false));
  const seen: number[] = [];
  run(f, 400, want(P(10), true), false, () => seen.push(f.frame.get('a')!.dim));
  assert.ok(seen.some((d) => d > 0 && d < 1), 'dimming is eased, not a jump');
  assert.equal(f.frame.get('a')!.dim, 1);
  assert.equal(labelOpacity(1, 1), DIM_ALPHA);
  assert.equal(labelOpacity(1, 0), 1);
  assert.equal(labelOpacity(0.5, 1), 0.5 * DIM_ALPHA);
  assert.equal(DIM_ALPHA, 0.65);
});

// ── "set in one place": no second copy of the dim value, no opacity but 0 and 1 in the label stylesheet ──
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
test('the dim value lives only in alpha.ts', () => {
  const bad: string[] = [];
  for (const f of walk('src').filter((p) => /\.(ts|tsx|css)$/.test(p))) {
    if (f.includes(join('src', 'engine', 'hales')) || f.includes(join('src', 'engine', 'host')) || f.endsWith(join('labels', 'alpha.ts')) || f.endsWith('names.copied.ts')) continue;
    const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/DIM_ALPHA\s*=/.test(text) || /(?:opacity|alpha)\s*[:=]\s*0?\.65\b/.test(text)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'import DIM_ALPHA / labelOpacity from src/scene/labels/alpha.ts');
  const css = readFileSync('src/scene/labels/labels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const opacities = [...css.matchAll(/opacity\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(opacities.filter((o) => o !== '0' && o !== '1'), [], 'the label stylesheet holds no opacity of its own');
});
