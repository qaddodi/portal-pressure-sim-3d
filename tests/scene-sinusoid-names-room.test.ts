// The sinusoid's names in the room the camera really frames it in (Mohammad's Mac play-test: the Kupffer cell's name printed over the portal venule's reading at the left edge; Fenestrae, Bile
// canaliculus and Hepatocyte jammed against the screen edge and clipped). Root cause: the layer read the cards' plan (`boxes.free`), which free play never publishes (an empty rect), so every
// name was clamped into a zero-width room at the left edge. It now reads the figure's own room (cel.rig.targetRoom) through `namesFree`, 2D's freeRect margins. Pure numbers: no DOM, no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { NAMES_SIDE, NAMES_TOP, namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { type NameKey, type NamePlacement } from '../src/scene/sinusoid/names.ts';
import { KUP_CLEAR, KUP_HALF, SEED, nucAt } from '../src/scene/sinusoid/layout.ts';
import { isPortrait, restScale } from '../src/scene/sinusoid/portrait.ts';
import { acrossUm } from '../src/scene/sinusoid/portrait.ts';
import { freeRoom } from '../src/ui/shell/room.ts';
import { deviceClass, type Rect } from '../src/ui/layout/device.ts';
import { layoutClass } from '../src/ui/shell/room.ts';
import { M } from '../src/ui/shell/metrics.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
/** A name's size in px as the label type sets it (about 8 px a capital, 16 a line, 2D's padding). */
const measure = (_k: NameKey, name: string, value: string): [number, number] => {
  const lines = [...name.split('\n'), ...(value ? value.split(' · ') : [])];
  return [Math.max(...lines.map((l) => l.replace('~', ' ').length)) * 8 + 16, lines.length * 16 + 8];
};
const TEXT = readings({ P1: 17.2, P2: 10, P3: 3.9, lymph: 0.5, lyProt: 0.91 }, 1);

const SIZES: [string, number, number][] = [
  ['Mac 1440x900', 1440, 900], ['Mac 1280x800', 1280, 800], ['iPad landscape', 1024, 768], ['iPad portrait', 768, 1024], ['iPhone portrait', 390, 844], ['iPhone landscape', 844, 390],
];
/** The camera's room for a screen: free play (the screen less the top bar and the foot), or with a card taking the left column of a wide screen / the foot of a tall one. */
function roomFor(W: number, H: number, card: boolean): Rect {
  const vp = { w: W, h: H, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const r = freeRoom(vp, layoutClass(W < 700 || (W < 900 && H > W) ? true : false));
  if (!card) return r;
  return W < H * 0.95 ? { ...r, h: Math.max(160, r.h * 0.5) } : { ...r, x: r.x + Math.min(440, W * 0.4) + 16, w: r.w - Math.min(440, W * 0.4) - 16 };
}
function lay(W: number, H: number, card: boolean, kind: 'rest' | 'tight' = 'rest') {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.update(0);
  const room = roomFor(W, H, card), portrait = isPortrait(W, H);   // (2D: the STAGE's shape decides, not the room the cards leave)
  v.setPortrait(portrait);
  const free = namesFree(room, { w: W, h: H }), short = portrait ? room.w : room.h;
  // the camera's own scale is the room's short side over the µm it shows; the rest scale is that less the room's breathing space
  const k = kind === 'rest' ? restScale(short) : short / acrossUm(short);
  const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure });
  return { names, free, room, portrait, W, H };
}
const box = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });
const hit = (a: NamePlacement, b: NamePlacement) => { const p = box(a), q = box(b); return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1; };

test('namesFree: the figure\'s room kept 12 px in at the sides and 8 under the top (2D freeRect); an unset room falls back to the stage', () => {
  assert.deepEqual(namesFree({ x: 0, y: 64, w: 1440, h: 706 }, { w: 1440, h: 900 }), { l: NAMES_SIDE, t: 64 + NAMES_TOP, r: 1440 - NAMES_SIDE, b: 770 });
  assert.deepEqual(namesFree(null, { w: 800, h: 600 }), { l: 12, t: 8, r: 788, b: 600 });
  assert.deepEqual(namesFree({ x: 0, y: 0, w: 0, h: 0 }, { w: 800, h: 600 }), { l: 12, t: 8, r: 788, b: 600 }, 'the empty rect the cards\' plan holds in free play is no room');
});

for (const card of [false, true]) for (const kind of ['rest', 'tight'] as const) {
  test(`every name stands inside the room, none on another (${card ? 'a card open' : 'free play'}, ${kind} scale)`, () => {
    for (const [label, W, H] of SIZES) {
      const L = lay(W, H, card, kind), tag = `${label}${card ? ' + card' : ''} ${kind} (${L.portrait ? 'tall' : 'wide'})`;
      assert.ok(L.names.length >= 9, `${tag}: names placed`);
      for (const n of L.names) {
        const b = box(n);
        assert.ok(b.x0 >= L.free.l - 1 && b.x1 <= L.free.r + 1, `${tag}: ${n.key} inside the room across (${b.x0.toFixed(0)}..${b.x1.toFixed(0)} in ${L.free.l}..${L.free.r})`);
        assert.ok(b.y0 >= L.free.t - 1 && b.y1 <= L.free.b + 1, `${tag}: ${n.key} inside the room down (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} in ${L.free.t}..${L.free.b})`);
      }
      // (a room under 220 px tall, an iPhone on its side with a card, has no place for ten names and two readings: they stay in it, and clear of each other where a place exists)
      if (L.free.b - L.free.t < 220) continue;
      for (let i = 0; i < L.names.length; i++) for (let j = i + 1; j < L.names.length; j++) assert.ok(!hit(L.names[i]!, L.names[j]!), `${tag}: ${L.names[i]!.key} and ${L.names[j]!.key} do not overlap`);
    }
  });
}

test('the Kupffer cell\'s name and the portal venule\'s reading are apart, at every size', () => {
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H, false), kup = L.names.find((n) => n.key === 'kup')!, inn = L.names.find((n) => n.key === 'in')!;
    assert.ok(!hit(kup, inn), `${label}: Kupffer cell and Portal venule`);
  }
});
test('a phone upright stays top to bottom with a card at its foot (2D decides on the stage, W < H * 0.95, not on the room the cards leave)', () => {
  const room = roomFor(390, 844, true);
  assert.ok(room.w >= room.h * 0.95, 'the room left is wider than tall');
  assert.equal(lay(390, 844, true).portrait, true);
  assert.equal(isPortrait(1440, 900), false);
});
void M;

test('a tall screen\'s names stay in the room down even where the picture is carried past its foot (Kupffer cell half under the story card, Ascites 9.2, build 572259fd)', () => {
  const W = 390, H = 844;
  const room = roomFor(W, H, true), portrait = isPortrait(W, H);
  for (const [dy, mul] of [[0, 1], [160, 1], [320, 1], [0, 2], [240, 1.6], [-200, 1.6]] as const) {
    const v = new SinusoidView(createShared());
    v.setVisible(true); v.snapTargets(targets()); v.update(0); v.setPortrait(portrait);
    const free = namesFree(room, { w: W, h: H });
    const k = restScale(portrait ? room.w : room.h) * mul;
    const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2 + dy];
    for (const n of v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure })) {
      if (n.end) continue;
      const b = box(n);
      assert.ok(b.y0 >= free.t - 1 && b.y1 <= free.b + 1, `${n.key} down (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} in ${free.t}..${free.b}) at dy ${dy}, x${mul}`);
    }
  }
});

/** Wide screens, the camera's own scale and the room as the scene tells the view (setScreen): where the Kupffer cell stands and what its arms and the names touch. */
function layScreen(W: number, H: number, card: boolean) {
  const room = roomFor(W, H, card), short = room.h, k = restScale(short);
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.setPortrait(false); v.setScreen(k, room.w, W, 0); v.update(0);
  const free = namesFree(room, { w: W, h: H }), C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure });
  const xk = v.kupfferGoal, halfW = v.nameGeom.halfW(xk);
  const cell = { x0: C[0] + k * (xk - KUP_HALF), x1: C[0] + k * (xk + KUP_HALF), y0: C[1] + k * (halfW - 4.2), y1: C[1] + k * halfW };
  return { names, free, room, k, C, xk, cell };
}
const SCREENS: [string, number, number][] = [['Mac 1440x900', 1440, 900], ['Mac 1280x800', 1280, 800], ['iPad landscape', 1024, 768], ['iPhone landscape', 844, 390]];
for (const card of [false, true]) test(`the Kupffer cell stands just right of an endothelial nucleus where the room has the space, the Sinusoid name in the middle of the vessel, and nothing of the names over the cell (${card ? 'a card open' : 'free play'})`, () => {
  for (const [label, W, H] of SCREENS) {
    const L = layScreen(W, H, card), tag = `${label}${card ? ' + card' : ''}`;
    const sin = L.names.find((n) => n.key === 'sin')!, inn = L.names.find((n) => n.key === 'in')!, out = L.names.find((n) => n.key === 'out')!;
    const mid = (box(inn).x1 + box(out).x0) / 2;
    assert.ok(Math.abs(sin.cx - mid) < 0.5 * sin.w + 40 || Math.abs(sin.cx - L.cell.x0) < 0.5 * sin.w + 40, `${tag}: Sinusoid name in the middle between the ends (${sin.cx.toFixed(0)} against ${mid.toFixed(0)})`);
    for (let n = -6; n <= 6; n++) assert.ok(Math.abs(L.xk - nucAt(n, SEED.nucDn)) >= KUP_CLEAR - 1e-9, `${tag}: the cell clear of every endothelial cell`);
    assert.ok(Math.abs(L.xk - (nucAt(0, SEED.nucDn) + KUP_CLEAR)) < 1e-9, `${tag}: the cell stands just right of the nucleus past the middle, whatever the room`);
    for (const n of L.names) {
      if (n.key === 'kup' || (L.k < 8 && L.room.w < 520)) continue;   // (a phone on its side with a card: a lumen 50 px tall and 118 px between the ends' names has no place for a name and a cell apart)
      const b = box(n), c = L.cell;
      assert.ok(!(b.x0 < c.x1 && c.x0 < b.x1 && b.y0 < c.y1 && c.y0 < b.y1), `${tag}: ${n.key} (${b.x0.toFixed(0)}..${b.x1.toFixed(0)}, ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}) is off the Kupffer cell (${c.x0.toFixed(0)}..${c.x1.toFixed(0)}, ${c.y0.toFixed(0)}..${c.y1.toFixed(0)})`);
    }
    if (process.env.DBG) console.log(tag, 'xk', L.xk.toFixed(1), 'cell px', L.cell.x0.toFixed(0), L.cell.x1.toFixed(0), 'in', box(inn).x0.toFixed(0), box(inn).x1.toFixed(0), 'sin', sin.cx.toFixed(0), 'out', box(out).x0.toFixed(0), box(out).x1.toFixed(0), 'free', L.free.l, L.free.r);
  }
});

test('the Kupffer cell is fixed in the tissue: its place does not move with the zoom, the room or a card (it slid while he zoomed)', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.setPortrait(false);
  const seen = new Set<number>();
  for (const k of [6, 9, 12, 16, 24, 40]) for (const w of [600, 1000, 1400]) for (const c of [-20, 0, 20]) { v.setScreen(k, w, 1440, c); v.update(1000 + k * w); seen.add(v.kupfferGoal); }
  assert.equal(seen.size, 1, 'one place');
  const { geo } = v as unknown as { geo: { xk: number } };
  assert.equal(geo.xk, [...seen][0], 'the cell itself stands there at once');
});
