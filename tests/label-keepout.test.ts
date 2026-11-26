// Rule (Mohammad, 26 Nov, the Protein callout "sits inside the bile duct ... it has to be in a clean area"; fixed at the root for EVERY sinusoid-view name): no name stands on a structure the scene draws.
// The keep-out set (structures.ts: the hepatocytes' nuclei, the bile canaliculi, the Kupffer and stellate cells' bodies, the cell borders) is the one place that says what a label keeps off; the
// layout (names.ts) steps every name in a plate clear of it, and a key entry's callout (the Protein) picks the shallowest clean spot. This holds the layout to it on every screen size, with and
// without a card, at both scales, with the bile canaliculus named or not. Pure numbers and source reading, node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { type NameKey, type NamePlacement } from '../src/scene/sinusoid/names.ts';
import { CANAL_R, KUP_SCALE, HSC_REACH, KUP_REACH, bordersHit, circlesHit, structuresOf, toPx } from '../src/scene/sinusoid/structures.ts';
import { CANAL_R as SCENE_CANAL_R, KUP_SCALE as SCENE_KUP_SCALE } from '../src/scene/micro3d/sinusoid3d.ts';
import { KUP_HALF, UM } from '../src/scene/sinusoid/layout.ts';
import { acrossUm, isPortrait, restScale } from '../src/scene/sinusoid/portrait.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import type { Rect } from '../src/ui/layout/device.ts';
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
function roomFor(W: number, H: number, card: boolean): Rect {
  const vp = { w: W, h: H, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const r = freeRoom(vp, layoutClass(W < 700 || (W < 900 && H > W)));
  if (!card) return r;
  return W < H * 0.95 ? { ...r, h: Math.max(160, r.h * 0.5) } : { ...r, x: r.x + Math.min(440, W * 0.4) + 16, w: r.w - Math.min(440, W * 0.4) - 16 };
}
function lay(W: number, H: number, o: { card?: boolean; kind?: 'rest' | 'tight'; act?: number; lit?: string[] } = {}) {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets({ act: o.act ?? 0 })); v.update(0);
  const room = roomFor(W, H, !!o.card), portrait = isPortrait(W, H); v.setPortrait(portrait);
  const free = namesFree(room, { w: W, h: H }), short = portrait ? room.w : room.h;
  const k = (o.kind ?? 'rest') === 'rest' ? restScale(short) : short / acrossUm(short);
  const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(o.lit ?? []), measure });
  const ang = portrait ? Math.PI / 2 : 0, ca = Math.cos(ang), sa = Math.sin(ang);
  const toScreen = (x: number, y: number): [number, number] => [C[0] + k * (x * ca - y * sa), C[1] + k * (x * sa + y * ca)];
  const K = toPx(structuresOf(v.nameGeom, -150, 150), toScreen, k);
  return { names, free, k, C, portrait, K, v, room };
}
const box = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });

for (const card of [false, true]) for (const kind of ['rest', 'tight'] as const) {
  test(`no name stands on a nucleus or a bile canaliculus, at every screen size (${card ? 'a card open' : 'free play'}, ${kind} scale, the canaliculus named and not)`, () => {
    for (const [label, W, H] of SIZES) for (const lit of [[], ['sinusoid:canaliculus']]) for (const act of [0, 1]) {
      const L = lay(W, H, { card, kind, lit, act }), tag = `${label}${card ? ' + card' : ''} ${kind}${lit.length ? ' + canaliculus' : ''}`;
      // (a room under 220 px tall, a phone on its side with a card, has no place for eleven names between the nuclei: they stay in it, as in names-room.test.ts)
      if (L.free.b - L.free.t < 220) continue;
      for (const n of L.names) {
        const hit = circlesHit(box(n), L.K, 0, new Set(['nucleus', 'canaliculus'] as const));
        assert.deepEqual(hit.map((c) => c.kind), [], `${tag}: ${n.key} stands on a ${hit.map((c) => c.kind).join(' and ')}`);
      }
    }
  });
}

test('no name stands on the Kupffer or the stellate cell\'s body, in a room tall enough to keep them apart', () => {
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H);
    if (L.free.b - L.free.t < 260) continue;   // (a phone on its side: a lumen 45 px tall holds the Kupffer cell's name on the lining)
    for (const n of L.names) {
      const hit = circlesHit(box(n), L.K, 0, new Set(['kupffer', 'stellate'] as const));
      assert.deepEqual(hit.map((c) => c.kind), [], `${label}: ${n.key} stands on a ${hit.map((c) => c.kind).join(' and ')}`);
    }
  }
});

test('the Protein callout stands in clean plate: off the cell borders too, wherever the room is not too small, and a name that leaves it a place keeps off the borders it can', () => {
  for (const [label, W, H] of SIZES) for (const card of [false, true]) {
    const L = lay(W, H, { card }), alb = L.names.find((n) => n.key === 'alb')!;
    assert.ok(alb, `${label}: placed`);
    if (L.free.b - L.free.t < 300 || card) continue;
    assert.deepEqual(bordersHit(box(alb), L.K, 0), [], `${label}: the Protein is on a cell border`);
  }
});

test('the keep-out set is the scene\'s own: the canaliculus and the Kupffer cell by the sizes the 3D scene draws, the nuclei and canaliculi at the places it puts them', () => {
  assert.equal(CANAL_R, SCENE_CANAL_R); assert.equal(KUP_SCALE, SCENE_KUP_SCALE);
  assert.equal(KUP_REACH, KUP_HALF, 'the Kupffer cell\'s reach is the span the names already keep clear of');
  assert.ok(HSC_REACH > 1.7 && HSC_REACH < UM.disse, 'the stellate cell\'s body fills the band of Disse, little more');
  const src = readFileSync('src/scene/micro3d/sinusoid3d.ts', 'utf8');
  assert.match(src, /xn = lerp\(c\.x0, c\.x1, c\.nu\), v = c\.nv \* UM\.hep/, 'the nuclei at cellOf\'s nu and nv');
  assert.match(src, /if \(c\.bi\) \{ const dx = \(c\.x1 - c\.x0\) \* 0\.17; put\(xn - dx, c\.nr \* 0\.8\); put\(xn \+ dx, c\.nr \* 0\.8\); \} else put\(xn, c\.nr\);/, 'the binucleate cells\' two nuclei');
  assert.match(src, /const v = UM\.hep \* 0\.5, x = edgeAt\(j, sd, v\);/, 'the canaliculus at the middle of the plate on the cell\'s border');
  const L = lay(1440, 900), n = L.K.circles.filter((c) => c.kind === 'nucleus').length, bc = L.K.circles.filter((c) => c.kind === 'canaliculus').length;
  assert.ok(n >= 8 && bc >= 8, `nuclei ${n}, canaliculi ${bc}`);
});

test('the layout uses the keep-out set for every name: settle steps a name off it, the callout picks from it', () => {
  const src = readFileSync('src/scene/sinusoid/names.ts', 'utf8');
  assert.match(src, /structuresOf\(g, fr\[0\] - 30, fr\[1\] \+ 30\)/);
  assert.match(src, /onBody\(a, a\.cx, a\.cy\)/);
  assert.match(src, /const keyCallout = /);
  assert.match(src, /bordersHit\(b, K, 3\)/);
});
