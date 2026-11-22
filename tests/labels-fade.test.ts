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

test('a label wanted at another spot crosses over: the old picture fades out where it stood while the new fades in where it stands, together, never sliding and never with nothing shown between', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  const trail: { x: number; a: number; from: number | null; mix: number }[] = [];
  for (let t = 0; t < 600; t += 16) { f.step(16, want(P(200, 40)), false); const s = f.frame.get('a')!; trail.push({ x: s.p.dx, a: s.alpha, from: s.from?.p.dx ?? null, mix: s.mix }); }
  assert.ok(trail.every((s) => s.x === 200), 'the label is at its new spot from the first frame: nothing else is ever a drawn spot but the old (the ghost) and the new');
  assert.ok(trail.every((s) => s.a === 1), 'the label itself never leaves: there is no moment with nothing shown');
  const crossing = trail.filter((s) => s.from !== null);
  assert.ok(crossing.length > 8, 'the old picture is held for the crossing');
  assert.ok(crossing.every((s) => s.from === 10), 'the old picture stays where it stood');
  assert.ok(crossing[0].mix < 0.05 && crossing[crossing.length - 1].mix > 0.9, 'the new picture takes over by easeMove');
  assert.ok(crossing.every((s, i) => i === 0 || s.mix >= crossing[i - 1].mix), 'monotonic');
  const ms = crossing.length * 16;
  assert.ok(Math.abs(ms - FADE.moveMs) <= 32, `the crossing takes ${ms} ms, 2D's D_SMALL ${FADE.moveMs}`);
  assert.equal(trail[trail.length - 1].from, null);
  assert.equal(trail[trail.length - 1].mix, 1);
});

test('a move of 3 px or less is no move; a move that leaves the old and the new box overlapping is taken at once (a number one pixel wider is never drawn twice)', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  f.step(16, want(P(12.5)), false);
  assert.equal(f.frame.get('a')!.from, null, '2.5 px: the same spot');
  assert.equal(f.frame.get('a')!.p.dx, 10);
  f.step(16, want(P(16, 4)), false);
  assert.equal(f.frame.get('a')!.from, null, 'overlapping boxes, a few px: taken at once');
  assert.equal(f.frame.get('a')!.p.dx, 16);
  f.step(16, want(P(40, 6)), false);
  assert.ok(f.frame.get('a')!.from, 'overlapping boxes but 30 px: crossed over, never jumped');
  f.step(16, want(P(40 + 130, 6)), false);
  assert.ok(f.frame.get('a')!.from, 'a box away: crossed over');
});

test('many small steps never add up to a slide: a label walked 2 px a re-solve crosses over once it has drifted past smallPx, and a dot slid along its vessel (au) is a crossing', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  let crossed = false;
  for (let i = 1; i <= 30; i++) {
    f.step(16, want(P(10 + 2 * i)), false);
    const s = f.frame.get('a')!;
    if (s.from) crossed = true;
    if (!crossed) assert.ok(Math.abs(s.p.dx - 10) <= FADE.smallPx, 'taken at once only inside smallPx of where it stood');
  }
  assert.ok(crossed, 'the walk became a crossing');
  const g = new LabelFader();
  run(g, 400, want(P(10)));
  g.step(16, want(P(10, 0, { au: 0.6 })), false);
  assert.ok(g.frame.get('a')!.from, 'same box, another point on the vessel: crossed over, not jumped');
});

test('new words (a unit, a change badge, a shorter name) cross over in place, and a label in the middle of a crossing keeps going to the newest place', () => {
  const f = new LabelFader();
  run(f, 400, new Map([['a', { p: P(10), dim: false, key: 'full', snap: 'w1' }]]));
  f.step(16, new Map([['a', { p: P(10), dim: false, key: 'full+unit', snap: 'w2' }]]), false);
  const s = f.frame.get('a')!;
  assert.ok(s.from && s.from.snap === 'w1' && s.snap === 'w2', 'the old words are kept to be drawn as they were');
  for (let t = 0; t < 100; t += 16) f.step(16, new Map([['a', { p: P(400), dim: false, key: 'full+unit', snap: 'w2' }]]), false);
  assert.equal(f.frame.get('a')!.p.dx, 400);
  run(f, 400, new Map([['a', { p: P(400), dim: false, key: 'full+unit', snap: 'w2' }]]));
  assert.equal(f.frame.get('a')!.from, null);
});

test('fades take the times of 2D: out 240 ms (D_SMALL), in 180 ms', () => {
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

// ── Plan 27b: no two equal copies; a crossing turned round never begins again ──
import { inWeight, outWeight } from '../src/scene/labels/fade.ts';

test('a crossing never shows two equal copies: at no moment are both pictures above 0.3, and together they never fall under 0.5', () => {
  let worst = 0, least = 9;
  for (let i = 0; i <= 1000; i++) { const u = i / 1000, a = outWeight(u), b = inWeight(u); worst = Math.max(worst, Math.min(a, b)); least = Math.min(least, a + b); }
  assert.ok(worst <= 0.3, `the strongest moment of the weaker picture is ${worst.toFixed(3)}`);
  assert.ok(least >= 0.5, `the two pictures together never fall under ${least.toFixed(3)}`);
  assert.equal(outWeight(0), 1); assert.equal(inWeight(0), 0); assert.equal(outWeight(1), 0); assert.equal(inWeight(1), 1);
  for (let i = 0; i <= 100; i++) assert.ok(Math.abs(outWeight(i / 100) - inWeight(1 - i / 100)) < 1e-12, 'mirror images: the turn round needs no jump');
});

test('wants that alternate A, B, A, B every 50 ms for 2 s: one ghost at most, no jump in either picture, and the two never show strongly together', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  let prev: Map<number, number> | null = null, both = 0, maxJump = 0;
  for (let t = 0; t < 2000; t += 16) {
    f.step(16, want(Math.floor(t / 50) % 2 ? P(200, 40) : P(10)), false);
    const s = f.frame.get('a')!;
    // each picture's share, by where it stands (the arriving one and the ghost swap parts when a crossing turns round)
    const cur = new Map<number, number>([[s.p.dx, s.mix]]);
    if (s.from) cur.set(s.from.p.dx, s.oldMix);
    if (s.from && s.oldMix > 0.3 && s.mix > 0.3) both++;
    if (prev && s.from) for (const [x, w] of cur) if (prev.has(x)) maxJump = Math.max(maxJump, Math.abs(w - prev.get(x)!));
    prev = s.from ? cur : null;
  }
  assert.equal(both, 0, 'no frame shows both pictures above 0.3');
  assert.ok(maxJump < 0.2, `a picture's share changes by ${maxJump.toFixed(3)} in a frame at most (a 16 ms step of a 240 ms crossing)`);
});

test('A, B, A: a want for the spot the ghost stands at turns the crossing round from where it is (u becomes 1 - u), it does not begin again', () => {
  const f = new LabelFader();
  run(f, 400, want(P(10)));
  for (let t = 0; t < 96; t += 16) f.step(16, want(P(200, 40)), false);
  const s = f.frame.get('a')!, u = s.u, newW = s.mix, oldW = s.oldMix;
  assert.ok(s.from && u > 0.2 && u < 0.8);
  f.step(0, want(P(10)), false);
  const r = f.frame.get('a')!;
  assert.equal(r.p.dx, 10, 'the picture arriving is the one that was leaving');
  assert.equal(r.from?.p.dx, 200, 'the one that was arriving is now the ghost');
  assert.ok(Math.abs(r.u - (1 - u)) < 1e-9, 'u turned round, not reset to 0');
  assert.ok(Math.abs(r.mix - oldW) < 1e-9 && Math.abs(r.oldMix - newW) < 1e-9, 'each picture keeps the share it had: no jump');
});
