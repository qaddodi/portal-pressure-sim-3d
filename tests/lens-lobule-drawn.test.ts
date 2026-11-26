// The Lobule as DRAWN under the stream lenses, on the real weld plan (owner, 26 Nov, two captures: "what's happening at the joints? also in the portal venule and central vein? those should be
// colored (this is origin lens)"; "first pass lens should transition smoothly from portal venule to central vein in terms of raw -> clear; and all still mixed with arterial").
// Root causes: a junction skin had one place across for all its vertices, the host's (and none where another arm owned the vertex, so that half drew one plain stream); the round mouths had no
// place across at all, so the portal venule and the central vein were each one flat stream; the arterioles were not lens-coloured. Now every vertex of every vessel carries its place across, a
// skin each arm's, and the colour is the one rule (lobule/ink.ts inkAcross) blended by the skin's weights. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, LZ, OVER_Z, TUBE_SEG } from '../src/scene/micro3d/lobule3d.ts';
import { bileWeldCourses, bloodWeldCourses } from '../src/scene/lobule/weld-courses.ts';
import { planWelds } from '../src/scene/lobule/welds.ts';
import { clearing, laneColours } from '../src/scene/lobule/ink.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const R = 3, HEIGHTS = { R, over: OVER_Z, tube: LZ.tube, bile: LZ.cellTop + 0.001 }, SEGS = { vessel: TUBE_SEG, bile: 6 };
const shared = createShared();
const flat = new LobuleView(shared);
const net = flat.net;
const mouthR: Partial<Record<string, number>> = { pv: DISC_R.pv, ha: DISC_R.ha * 1.7, bd: DISC_R.bd * 1.4, lv: DISC_R.lv, cv: DISC_R.cv };
const avoid = net.courses.filter((c) => mouthR[c.kind] !== undefined).map((c) => { const p = c.pts[Math.floor(c.pts.length / 2)]!; return { x: p[0] * R, y: -p[1] * R, r: mouthR[c.kind]! * R }; });
const plan = planWelds([...bloodWeldCourses(net, HEIGHTS, SEGS), ...bileWeldCourses(net, HEIGHTS, SEGS)], { avoid });

const lane = (a: number[], b = a): [number[], number[]] => [a, b];
const model = (): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.8, 0.7], P1: 11, P2: 8, P3: 5, P4: 4,
  flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0,
  lanes: {
    origin: { pre: lane([0.6, 0.15, 0.25, 0]), sin: lane([0.45, 0.1, 0.2, 0.25]), post: lane([0.45, 0.1, 0.2, 0.25]) },
    pass: { pre: lane([1, 0, 0, 0]), sin: lane([0.75, 0, 0, 0.25], [0, 0.75, 0, 0.25]), post: lane([0, 0.75, 0, 0.25]) },
  },
} as LobuleModel);
type Entry = { part: { name?: string; geometry: { getAttribute(k: string): { array: Float32Array } } }; seg: string | null; k: Float32Array; ac?: Float32Array; skins?: { v0: number; n: number }[] };
const key = (a: ArrayLike<number>, i: number, k: number) => [0, 1, 2].map((c) => Math.round((a[i * 3 + c]! / Math.max(k, 1e-6)) * 255)).join(',');
const ckey = (c: readonly number[]) => c.map((v) => Math.round(v * 255)).join(',');

function drawn(lens: LensId) {
  const l3 = new Lobule3D(flat, shared);
  flat.snapModel(model()); flat.setVisible(true); flat.setLens(lens);
  l3.buildForTest('light'); l3.layWeldsForTest(plan);
  for (let t = 1000; t < 1200; t += 16) { flat.update(t); l3.update(true, 0, t, 1, true); }
  const entries = (l3 as unknown as { coloured: Entry[] }).coloured;
  const parts = l3.partsForTest;
  const of = (i: number) => entries.find((e) => e.part === (parts[i] as unknown))!;
  // partsForTest order: ground, cells, nuclei, s0, s1, s2, an, inlets, twigs, lt, duct, bile, mouthPv, mouthHa, mouthBd, mouthLv, mouthCv, cvScar
  return { entries, s: [3, 4, 5, 6].map(of), inlets: of(7), twigs: of(8), pv: of(12), ha: of(13), cv: of(16) };
}
const coloursOf = (e: Entry, from = 0, to = e.k.length) => {
  const a = e.part.geometry.getAttribute('color').array, out = new Set<string>();
  for (let v = from; v < to; v++) if (e.k[v]! > 0.05) out.add(key(a, v, e.k[v]!));
  return out;
};

test('every lens-coloured vessel carries its place across on every vertex, and the welded ones their junctions\' arms', () => {
  const d = drawn('origin');
  for (const e of [...d.s, d.inlets, d.twigs, d.pv, d.ha, d.cv]) assert.equal(e.ac?.length, e.k.length, 'a place across for every vertex');
  assert.ok(d.s.some((e) => (e.skins?.length ?? 0) > 0), 'the sinusoids\' junction skins are kept for the streams');
});

test('Blood origin: the portal venule shows the portal sources, the central vein every source mixed, the arterioles the hepatic artery\'s blood', () => {
  const d = drawn('origin'), cols = laneColours('origin').map(ckey);
  const pv = coloursOf(d.pv), cv = coloursOf(d.cv), ha = coloursOf(d.ha), tw = coloursOf(d.twigs);
  assert.ok(pv.size >= 3, `the portal venule has its streams (${pv.size})`); assert.ok(!pv.has(cols[3]!), 'no arterial blood in the portal venule');
  assert.ok(cv.size >= 4 && cv.has(cols[3]!), `the central vein is mixed blood, the arterial among it (${cv.size})`);
  assert.deepEqual([...ha], [cols[3]], 'the arteriole is the hepatic artery\'s blood'); assert.deepEqual([...tw], [cols[3]]);
});

test('Blood origin: every junction skin carries the streams of its arms on into it (never one plain stream)', () => {
  const d = drawn('origin');
  let skins = 0, plain = 0;
  for (const e of d.s) for (const sk of e.skins ?? []) {
    skins++;
    if (coloursOf(e as Entry, sk.v0, sk.v0 + sk.n).size < 2) plain++;
  }
  assert.ok(skins > 20, `${skins} skins`);
  assert.equal(plain, 0, `${plain} of ${skins} junctions drew a single plain colour`);
});

test('First pass: the central vein is cleared gut blood with the arterial, the portal venule raw, and no sinusoid has a raw lane beside a clear one', () => {
  const d = drawn('firstpass'), cols = laneColours('firstpass').map(ckey);
  const raw = cols[0]!, clear = cols[1]!, ha = cols[3]!;
  const cv = coloursOf(d.cv), pv = coloursOf(d.pv);
  assert.ok(cv.has(ckey(clearing(1))) && cv.has(ha) && !cv.has(raw), 'the central vein: clear and arterial, no raw');
  assert.ok(pv.has(raw) && !pv.has(ha), 'the portal venule: raw only');
  for (const e of d.s) { const c = coloursOf(e); assert.ok(!(c.has(raw) && c.has(clear) && c.size === 3), 'a sinusoid turns raw to clear along its length, not in two lanes'); }
  const mids = coloursOf(d.s[2]!);
  assert.ok(mids.size > 6, `the turn is smooth: many shades along the sinusoids (${mids.size})`);
});
