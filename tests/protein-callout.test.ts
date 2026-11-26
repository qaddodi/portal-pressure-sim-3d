// Rule (Mohammad, 26 Nov: "for sinusoid view, just callout the sinusoid somewhere with a leader and then move the protein legend to be a callout with a circle next to it"):
// a key entry that names a thing the figure draws is a CALLOUT on the figure, a name standing in a plate with a leader to that thing and the entry's circle at the leader's end; the top bar keeps
// only keys that name a scale. This pins the general rule (every entry of SINUSOID_CALLOUTS, at every screen size), the Sinusoid's own callout, the particle the Protein's leader follows, and that no
// legend bar for the sinusoid comes back. Pure numbers and source reading, node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { type NameKey, type NamePlacement } from '../src/scene/sinusoid/names.ts';
import { SINUSOID_CALLOUTS, calloutOf } from '../src/scene/sinusoid/legend.ts';
import { BLOOD_UM_S, FOLLOW_FADE_MS, LET_GO_S, ProteinFollow, type PickCtx, dwell, laneSpeed, pickProtein } from '../src/scene/sinusoid/protein-pick.ts';
import { isPortrait, restScale } from '../src/scene/sinusoid/portrait.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
const measure = (_k: NameKey, name: string, value: string): [number, number] => {
  const lines = [...name.split('\n'), ...(value ? value.split(' · ') : [])];
  return [Math.max(...lines.map((l) => l.replace('~', ' ').length)) * 8 + 16, lines.length * 16 + 8];
};
const TEXT = readings({ P1: 17.2, P2: 10, P3: 3.9, lymph: 0.5, lyProt: 0.91 }, 1);
const SIZES: [string, number, number][] = [
  ['Mac 1440x900', 1440, 900], ['Mac 1280x800', 1280, 800], ['iPad landscape', 1024, 768], ['iPad portrait', 768, 1024], ['iPhone 390x844', 390, 844], ['iPhone SE', 375, 667], ['iPhone landscape', 844, 390],
];
function lay(W: number, H: number) {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.update(0);
  const vp = { w: W, h: H, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const room = freeRoom(vp, layoutClass(W < 700 || (W < 900 && H > W)));
  const portrait = isPortrait(W, H); v.setPortrait(portrait);
  const free = namesFree(room, { w: W, h: H }), short = portrait ? room.w : room.h, k = restScale(short);
  const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure });
  return { v, names, free, k, C, portrait };
}
const box = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });

test('the general rule: every key entry of the sinusoid is a callout, at every screen size: a name off the lumen, in the room, with a leader that ends in the lumen', () => {
  assert.ok(SINUSOID_CALLOUTS.length >= 1);
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H), keys = [...SINUSOID_CALLOUTS.map((c) => c.key), 'sin' as const];
    for (const key of keys) {
      const n = L.names.find((x) => x.key === key);
      assert.ok(n, `${label}: ${key} is named`);
      const b = box(n!), hw = L.k * 5 * 1.03, axis = L.portrait ? L.C[0] : L.C[1];
      const centre = L.portrait ? n!.cx : n!.cy;
      assert.ok(Math.abs(centre - axis) > hw * 0.5, `${label}: ${key} stands off the lumen's middle, in a plate (${centre.toFixed(0)} against the axis ${axis.toFixed(0)})`);
      assert.ok(b.x0 >= L.free.l - 1 && b.x1 <= L.free.r + 1 && b.y0 >= L.free.t - 1 && b.y1 <= L.free.b + 1, `${label}: ${key} inside the room`);
      assert.ok(n!.leader, `${label}: ${key} has a leader`);
      const end = L.portrait ? n!.leader!.x2 : n!.leader!.y2;
      assert.ok(Math.abs(end - axis) < hw, `${label}: ${key}'s leader ends in the lumen (${end.toFixed(0)} against the axis ${axis.toFixed(0)}, half width ${hw.toFixed(0)})`);
    }
    // the callouts keep clear of every other name
    for (const key of keys) for (const o of L.names) {
      if (o.key === key) continue;
      const p = box(L.names.find((x) => x.key === key)!), q = box(o);
      if (L.free.b - L.free.t < 220) continue;   // (a room too short for eleven names: they stay in it)
      assert.ok(!(p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1), `${label}: ${key} and ${o.key} apart`);
    }
  }
});

test('the Protein callout\'s word is the key\'s word, and a tap on it explains it like every other name', () => {
  assert.equal(calloutOf('alb')?.word, 'Protein');
  const L = lay(1440, 900);
  assert.equal(L.names.find((n) => n.key === 'alb')!.name, 'Protein');
});

test('no sinusoid legend bar comes back: nothing the app makes wears .sv-legend, and the top bar draws no Protein word', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}${e.name}/`) : [`${d}${e.name}`]);
  const own = walk('src/').filter((f) => /\.(tsx?|js)$/.test(f) && !f.includes('/engine/') && !f.includes('/debug/'));
  for (const f of own) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /className=\{?[`'"][^`'"]*\bsv-legend\b/, `${f} makes an sv-legend`);
    assert.doesNotMatch(t, /ProteinLegend|legendOn|SINUSOID_KEY/, `${f} brings back the Protein legend`);
  }
});

test('the layer draws the Protein\'s leader to the followed particle and its circle on it, every frame, from the callout list', () => {
  const src = readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8');
  assert.match(src, /new ProteinFollow\(\)/);
  assert.match(src, /follow\.step\(sv\.albumin, sv\.spriteCount,/);
  assert.match(src, /proj\(follow\.x, follow\.y\)/);
  assert.match(src, /e\.mark\.style\.transform = `translate3d\(/, 'the circle is moved by a transform');
  assert.match(src, /follow\.shown/, 'and eased in and out by the share shown');
});

// ── the particle the leader follows ──────────────────────────────────────────────────────────────────────────────────────────────────
const halfW = () => 5;
const ctx = (o: Partial<PickCtx> = {}): PickCtx => ({ halfW, ax: 0, ay: 3, reach: 12, flowDir: 1, speed: 1, ...o });
const sprites = (rows: [number, number][]): Float32Array => Float32Array.from(rows.flatMap(([x, y]) => [x, y, 0.36, 1, 0]));

test('the picker takes a protein in the stream, in reach, that will stay in reach the longest, and none that is in the lining, out of reach or turned back', () => {
  // 0: in the lining (|y| 4.5 of 5), 1: out of reach, 2: fast at the axis, 3: slow near the wall, 4: faint
  const pts = sprites([[0, 4.5], [30, 0], [-10, 0], [-10, 3], [-10, 3]]);
  pts[4 * 5 + 3] = 0.4;
  assert.equal(pickProtein(pts, 5, ctx()), 3, 'the slow one near the wall, upstream: it stays the longest');
  assert.equal(pickProtein(pts, 2, ctx()), -1, 'none that is in reach and in the stream');
  assert.equal(pickProtein(new Float32Array(0), 0, ctx()), -1);
  const turned = sprites([[-5, 0]]); turned[4] = 2;
  assert.equal(pickProtein(turned, 1, ctx()), -1, 'the flash at a sealed wall is no protein');
});

test('a still blood keeps the particle for good, and a reversed one runs the other way', () => {
  assert.equal(dwell(0, 0, ctx({ speed: 0 })), 30);
  assert.ok(dwell(5, 0, ctx({ flowDir: -1 })) > dwell(5, 0, ctx({ flowDir: 1 })), 'going back toward the portal end it has the room to its left');
});

test('following: the leader eases in on a particle, goes with it, eases out before it leaves reach, and a new one eases in only after that: nothing jumps', () => {
  const f = new ProteinFollow(), dt = 16, stepUm = laneSpeed(2.5 / 4.5) * BLOOD_UM_S * 0.3 * dt / 1000;   // (the blood at 0.3 of healthy: a particle crosses the 24 µm of reach in about 4 s)
  let x = -11, last = { x: 0, y: 0, shown: 0 }, seenIn = false, handed = 0, prevIdx = -1;
  for (let i = 0; i < 1200; i++) {
    // a stream of particles, each entering at the left and running right at one lane's speed; a new one every 0.9 s
    const rows: [number, number][] = [];
    for (let j = 0; j < 8; j++) rows.push([((x + 11 + j * 3.1 * 1.0) % 24) - 12, 2.5]);
    x += stepUm;
    const pts = sprites(rows);
    f.step(pts, rows.length, ctx({ speed: 0.3 }), dt);
    assert.ok(f.shown >= 0 && f.shown <= 1);
    assert.ok(Math.abs(f.shown - last.shown) <= dt / FOLLOW_FADE_MS + 1e-9, 'the share shown moves at the fade\'s pace, never by a jump');
    if (f.shown > 0 && last.shown > 0 && f.idx >= 0 && f.idx === prevIdx) assert.ok(Math.abs(f.x - last.x) < 2, 'on one particle the leader\'s end moves with it');
    if (f.idx >= 0) { seenIn = true; assert.ok(Math.abs(f.x - 0) <= 12 + 1e-9, 'a followed particle is in reach'); }
    if (f.idx >= 0 && prevIdx >= 0 && f.idx !== prevIdx) handed++;
    if (f.idx >= 0 && prevIdx < 0) assert.equal(last.shown, 0, 'a new particle is taken only once the old leader has faded out');
    prevIdx = f.idx; last = { x: f.x, y: f.y, shown: f.shown };
  }
  assert.ok(seenIn, 'a particle was followed');
  assert.equal(handed, 0, 'a particle is let go (the leader eases out) before another is taken, never swapped in one step');
  assert.ok(LET_GO_S > 0);
});

test('the follower lets go when the particle is gone from the list (the traffic closed up or wrapped it) instead of jumping to another', () => {
  const f = new ProteinFollow();
  for (let i = 0; i < 10; i++) f.step(sprites([[-8, 3], [8, 3]]), 2, ctx({ speed: 0.3 }), 16);
  assert.ok(f.idx >= 0 && f.shown > 0.5);
  const was = f.idx;
  // the list closes up: the followed index now holds a particle far away
  f.step(sprites([[9, -3]]), 1, ctx({ speed: 0.3 }), 16);
  assert.equal(f.idx, -1, `index ${was} no longer the same particle: let go`);
  assert.ok(f.shown > 0 && f.shown < 1, 'and its leader eases out from where it was');
});

// ── the mirror of the traffic's own numbers ──────────────────────────────────────────────────────────────────────────────────────────
test('the lanes\' speed here is the traffic\'s own: a stream particle moves by laneSpeed(share) x 24 µm/s x v (traffic.copied.js)', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.trafficSpeed = 1; v.update(0); v.update(16);
  const a = Float32Array.from(v.albumin.subarray(0, v.spriteCount * 5)), n = v.spriteCount;
  v.update(16 + 100);
  const b = v.albumin, dt = 0.1;
  let checked = 0;
  for (let i = 0; i < Math.min(n, v.spriteCount, 150); i++) {
    const y = a[i * 5 + 1]!, x0 = a[i * 5]!, x1 = b[i * 5]!, share = Math.abs(y) / (v.g.halfW(x0) - 0.5);
    if (share > 0.6 || Math.abs(x1 - x0) > 20 || a[i * 5 + 4] !== 0) continue;
    const want = laneSpeed(share) * BLOOD_UM_S * v.state.v;
    assert.ok(Math.abs((x1 - x0) / dt - want) <= 0.25 * want + 0.5, `particle ${i}: ${((x1 - x0) / dt).toFixed(2)} µm/s against ${want.toFixed(2)}`);
    checked++;
  }
  assert.ok(checked >= 10, `${checked} stream particles checked`);
});

test('at every screen size the Protein callout finds a particle that stays in reach long enough to be worth following', () => {
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H), alb = L.names.find((n) => n.key === 'alb')!, v = L.v;
    const reach = Math.min(30, Math.max(8, 200 / Math.max(1, L.k)));
    const c: PickCtx = { halfW: v.g.halfW, ax: alb.x, ay: alb.leader!.ty, reach, flowDir: v.flowDir, speed: 1 };
    v.trafficSpeed = 1; v.update(16); v.update(32);
    const i = pickProtein(v.albumin, v.spriteCount, c);
    assert.ok(i >= 0, `${label}: a protein is in reach of the callout`);
    assert.ok(dwell(v.albumin[i * 5]!, v.albumin[i * 5 + 1]!, c) > LET_GO_S + 0.4, `${label}: and it stays`);
  }
});
