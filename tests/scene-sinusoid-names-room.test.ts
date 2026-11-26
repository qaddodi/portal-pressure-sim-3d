// The sinusoid's names in the room the camera really frames it in (Mohammad's Mac play-test: the Kupffer cell's name printed over the portal venule's reading at the left edge; Fenestrae, Bile
// canaliculus and Hepatocyte jammed against the screen edge and clipped). Root cause: the layer read the cards' plan (`boxes.free`), which free play never publishes (an empty rect), so every
// name was clamped into a zero-width room at the left edge. It now reads the figure's own room (cel.rig.targetRoom) through `namesFree`, 2D's freeRect margins. Pure numbers: no DOM, no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { NAMES_SIDE, NAMES_TOP, namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { END_GAP, type NameKey, type NamePlacement, vesselReach } from '../src/scene/sinusoid/names.ts';
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
for (const card of [false, true]) test(`the Kupffer cell stands on bare lining near the middle, the Sinusoid name in the middle of the vessel, and nothing of the names over the cell (${card ? 'a card open' : 'free play'})`, () => {
  for (const [label, W, H] of SCREENS) {
    const L = layScreen(W, H, card), tag = `${label}${card ? ' + card' : ''}`;
    const sin = L.names.find((n) => n.key === 'sin')!, inn = L.names.find((n) => n.key === 'in')!, out = L.names.find((n) => n.key === 'out')!;
    const mid = (box(inn).x1 + box(out).x0) / 2;
    assert.ok(Math.abs(sin.cx - mid) < 0.5 * sin.w + 40 || Math.abs(sin.cx - L.cell.x0) < 0.5 * sin.w + 40, `${tag}: Sinusoid name in the middle between the ends (${sin.cx.toFixed(0)} against ${mid.toFixed(0)})`);
    for (let n = -6; n <= 6; n++) assert.ok(Math.abs(L.xk - nucAt(n, SEED.nucDn)) >= KUP_CLEAR - 1e-9, `${tag}: the cell clear of every endothelial cell`);
    assert.ok(Math.abs(L.xk) <= 13.5, `${tag}: the cell stands near the middle (${L.xk.toFixed(1)} µm), leaving the room's right end to the central vein`);
    for (const n of L.names) {
      if (n.key === 'kup' || (L.k < 8 && L.room.w < 520)) continue;   // (a phone on its side with a card: a lumen 50 px tall and 118 px between the ends' names has no place for a name and a cell apart)
      const b = box(n), c = L.cell;
      assert.ok(!(b.x0 < c.x1 && c.x0 < b.x1 && b.y0 < c.y1 && c.y0 < b.y1), `${tag}: ${n.key} (${b.x0.toFixed(0)}..${b.x1.toFixed(0)}, ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}) is off the Kupffer cell (${c.x0.toFixed(0)}..${c.x1.toFixed(0)}, ${c.y0.toFixed(0)}..${c.y1.toFixed(0)})`);
    }
    if (process.env.DBG) console.log(tag, 'xk', L.xk.toFixed(1), 'cell px', L.cell.x0.toFixed(0), L.cell.x1.toFixed(0), 'in', box(inn).x0.toFixed(0), box(inn).x1.toFixed(0), 'sin', sin.cx.toFixed(0), 'out', box(out).x0.toFixed(0), box(out).x1.toFixed(0), 'free', L.free.l, L.free.r);
  }
});

for (const card of [false, true]) test(`the central vein's name and arrow stand at the room's right end, the portal venule's at its left, on every wide screen (${card ? 'a card open' : 'free play'}; Mohammad, 25 Nov)`, () => {
  for (const [label, W, H] of SCREENS) {
    const L = layScreen(W, H, card), tag = `${label}${card ? ' + card' : ''}`;
    const out = L.names.find((n) => n.key === 'out')!, inn = L.names.find((n) => n.key === 'in')!;
    // (a phone on its side with a card has 466 px for two ends, a cell and a name: the names step aside there)
    if (L.k < 8 && L.room.w < 520) continue;
    // the name's room is the free room less the arrow's share (A = 48) at the right, and the arrow's own 36 px beyond the name
    assert.ok(Math.abs(box(out).x1 - (L.free.r - 48)) < 1, `${tag}: Central vein ends at ${box(out).x1.toFixed(0)}, the room's end less its arrow's share is ${L.free.r - 48}`);
    assert.ok(Math.abs(box(inn).x0 - (L.free.l + 12 + 8 + 48)) < 1, `${tag}: Portal venule stands at the room's left end (${box(inn).x0.toFixed(0)})`);
  }
});

// A talk slide (Circulation 6, Mac): the words card on the left, the presenter bar in the lower right. The figure's room (the largest rectangle the cards leave) stops left of the bar, to hold the
// tallest figure, so the end names must not read it: they stand at the vessel's visible ends along its own band, where the bar never is.
test('the ends\' names stand at the visible ends of the vessel along its band, not at the figure room\'s side (a presenter bar in the corner narrowed the room; Mohammad, 25 Nov)', () => {
  const W = 1884, H = 1167, card = { x: 22, y: 190, w: 635, h: 520 }, bar = { x: 1573, y: 1090, w: 264, h: 44 };
  const roomX = card.x + card.w + 16, roomR = bar.x - 16, room = { x: roomX, y: 64, w: roomR - roomX, h: H - 64 - 24 };
  const free = namesFree(room, { w: W, h: H }), k = restScale(room.h);
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.setPortrait(false); v.update(0);
  const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const at = (walls: { x: number; y: number; w: number; h: number }[]) => v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure, edge: { l: 0, r: W }, walls });
  const names = at([card, bar]), out = names.find((n) => n.key === 'out')!, inn = names.find((n) => n.key === 'in')!;
  assert.equal(Math.round(box(out).x1), W - 12 - 48, 'Central vein ends 48 px (its arrow and gap) inside the screen\'s right margin');
  assert.equal(Math.round(box(inn).x0), card.x + card.w + 16 + 24 + 8 + 48, 'Portal venule stands just clear of the card');
  // a box that does cross the vessel's band on the right holds the name back
  const blocked = at([card, { x: 1500, y: C[1] - 100, w: 300, h: 200 }]).find((n) => n.key === 'out')!;
  assert.equal(Math.round(box(blocked).x1), 1500 - 16 - 12 - 48, 'a box on the band holds it back');
  // no walls given: the free room's sides, as before
  const old = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure }).find((n) => n.key === 'out')!;
  assert.equal(Math.round(box(old).x1), free.r - 48);
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

// The root rule for the ends' names on a wide screen (Mohammad, 26 Nov, iPhone on its side, Circulation 6: the central vein's name stood mid-vessel, stepped left of the Kupffer cell onto the
// portal venule's: "Portal ver|Central vein"). The portal venule's name is at the vessel's visible left end, the central vein's at the visible right end, in that order and never touching, at every
// size, safe area, card and zoom (so at every place the fixed Kupffer cell can land relative to the ends).
const CASES: { tag: string; W: number; H: number; safe: number; walls: { x: number; y: number; w: number; h: number }[]; roomX: number }[] = [
  { tag: 'iPhone landscape + words and data cards + bar (the capture)', W: 956, H: 440, safe: 62, roomX: 437, walls: [{ x: 62, y: 0, w: 359, h: 115 }, { x: 62, y: 129, w: 359, h: 182 }, { x: 570, y: 368, w: 185, h: 43 }] },
  { tag: 'iPhone landscape, no card', W: 956, H: 440, safe: 62, roomX: 62, walls: [{ x: 570, y: 368, w: 185, h: 43 }] },
  { tag: 'iPad landscape + card', W: 1194, H: 834, safe: 0, roomX: 480, walls: [{ x: 22, y: 150, w: 440, h: 500 }, { x: 460, y: 770, w: 264, h: 44 }] },
  { tag: 'Mac + card', W: 1884, H: 1167, safe: 0, roomX: 673, walls: [{ x: 22, y: 190, w: 635, h: 520 }, { x: 1573, y: 1090, w: 264, h: 44 }] },
  { tag: 'Mac, no card', W: 1440, H: 900, safe: 0, roomX: 0, walls: [] },
];
test('the ends\' names stand at the vessel\'s visible ends, in order and never touching, at every screen, card and zoom', () => {
  for (const c of CASES) for (const k of [6, 8, 9.7, 12, 16, 24]) for (const ctr of [-0.3, 0, 0.3]) {
    const room = { x: c.roomX, y: 50, w: c.W - c.safe - c.roomX, h: c.H - 60 };
    const v = new SinusoidView(createShared());
    v.setVisible(true); v.snapTargets(targets()); v.setPortrait(false); v.setScreen(k, room.w, c.W, 0); v.update(0);
    const free = namesFree(room, { w: c.W, h: c.H }), C: [number, number] = [room.x + room.w * (0.5 + ctr * 0.3), room.y + room.h / 2];
    const edge = { l: c.safe, r: c.W - c.safe };
    const names = v.names({ W: c.W, H: c.H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure, edge, walls: c.walls });
    const inn = names.find((n) => n.key === 'in')!, out = names.find((n) => n.key === 'out')!, tag = `${c.tag}, ${k} px/µm, centre ${ctr}`;
    assert.ok(box(inn).x1 + END_GAP <= box(out).x0 + 1e-6, `${tag}: Portal venule (…${box(inn).x1.toFixed(0)}) then Central vein (${box(out).x0.toFixed(0)}…), apart`);
    const reach = vesselReach(C[0], box(out).y0 - 4, box(out).y1 + 4, edge, c.walls);
    // the central vein is at the right end, unless the cell holds it back and the room between the ends lets it step left of the cell
    const cellL = C[0] + k * (v.kupfferGoal - KUP_HALF) - 8;
    const atEnd = Math.abs(box(out).x1 - (reach.r - 48)) < 1, leftOfCell = box(out).x1 + 36 <= cellL + 1;
    assert.ok(atEnd || leftOfCell, `${tag}: Central vein at the right end (${box(out).x1.toFixed(0)} against ${(reach.r - 48).toFixed(0)}) or left of the cell`);
    if (atEnd) assert.ok(box(out).x1 > box(inn).x1, `${tag}: Central vein right of the Portal venule`);
  }
});

test('iPhone on its side with the cards up (the capture): the central vein stands at the right end, lifted clear of the Kupffer cell, off the portal venule', () => {
  const c = CASES[0]!, k = 9.7, room = { x: c.roomX, y: 50, w: c.W - c.safe - c.roomX, h: c.H - 60 };
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.setPortrait(false); v.setScreen(k, room.w, c.W, 0); v.update(0);
  const free = namesFree(room, { w: c.W, h: c.H }), C: [number, number] = [room.x + room.w / 2, 222];
  const names = v.names({ W: c.W, H: c.H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure, edge: { l: c.safe, r: c.W - c.safe }, walls: c.walls });
  const inn = names.find((n) => n.key === 'in')!, out = names.find((n) => n.key === 'out')!;
  const cellX1 = C[0] + k * (v.kupfferGoal + KUP_HALF);
  assert.equal(Math.round(box(out).x1), c.W - c.safe - 12 - 48, 'at the right end');
  assert.ok(box(out).x0 > box(inn).x1, 'right of the portal venule\'s name');
  assert.ok(box(out).x1 > cellX1, 'beyond the Kupffer cell');
});
