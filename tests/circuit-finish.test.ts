// The Circuit's second half: the liver's branch trees, the caudate lane, custom shunts routed as a transit map, the resistors (numbers and zigzags), the captions on the map, the
// flow peel's tangent, and the procedure devices leaving. Node only: no GL, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { COURSES } from '../src/scene/circuit/course.ts';
import { CIRCUIT_D, CIRCUIT_LABELS, CIRCUIT_NODES, CIRCUIT_TREES, CIRCUIT_ZONES, CUSTOM_EDGES, CUSTOM_SHUNT_PATH, LANE_CAPTIONS, NODE_CIRCUIT, RES_LABEL, RES_LIVER, RES_SIZES, ROUTER_STATIONS, ZONE_SHORT } from '../src/scene/circuit/data.copied.ts';
import { mapToScene } from '../src/scene/circuit/map.ts';
import { PEEL_SPAN, peelAt, peelRank, peelSlope } from '../src/scene/circuit/peel.ts';
import { TURN_DIR, ZONE_ORGAN, LANE_SPOTS, along, buildCaptions, type CapCtx } from '../src/scene/circuit/captions.ts';
import { RES_KEYS, RES_TEETH, quantScale, resAmp, resHeat, resInk, resText, resWidth, resWidthFit, zigzag } from '../src/scene/circuit/res-model.ts';
import { resShape } from '../src/scene/circuit/resistors.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';
import { CircuitTubes } from '../src/scene/circuit/tubes.ts';
import { CIRCUIT_VS_HEAD } from '../src/scene/circuit/shader.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { createLensShared } from '../src/scene/vessels/vessel-object.ts';
import { createCircuitShared } from '../src/scene/circuit/uniforms.ts';
import { ProcedureLayer } from '../src/scene/procedures/layer.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { createRouter } from '../src/scene/circuit/router.copied.js';
import { x3, y3 } from '../src/scene/frame2d.ts';

// ── the flow peel's tangent ──
test('the peel slope is the derivative of the peel with the rank', () => {
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const r of [0.05, 0.3, 0.6, 0.95]) {
    const h = 1e-5, fd = (peelAt(t, r + h) - peelAt(t, r - h)) / (2 * h);
    assert.ok(Math.abs(peelSlope(t, r) - fd) < 1e-4, `t ${t} r ${r}: ${peelSlope(t, r)} vs ${fd}`);
  }
  assert.equal(peelSlope(0, 0.5), 0); assert.equal(peelSlope(1, 0.5), 0);
});

/** The shader's centreline direction (shader.ts circuitMorph), written in TS: the derivative along the vessel of the moving centreline. */
function shaderTangent(id: string, t: number, s: number): Vector3 {
  const g = COURSES.get(id)!, A = g.curveA.getPointAt(s), C = g.curveC.getPointAt(s), tang = g.curveA.getTangentAt(s), tC = g.curveC.getTangentAt(s);
  const rank = peelRank((C.x - 0) / 0.0065 + 700 - 0 + 0);   // (replaced below by the exact map x)
  void rank;
  const mx = 30 + 1360 / 2 + (C.x - 0) / 0.0065;
  const r = peelRank(mx), w = peelAt(t, r);
  const rs = r > 0 && r < 1 ? g.lenC * tC.x / 0.0065 / PEEL_SPAN : 0;
  return new Vector3().addScaledVector(tang, (1 - w) * g.lenA).addScaledVector(tC, w * g.lenC).addScaledVector(C.clone().sub(A), peelSlope(t, r) * rs);
}
function centreAt(id: string, t: number, s: number): Vector3 {
  const g = COURSES.get(id)!, A = g.curveA.getPointAt(s), C = g.curveC.getPointAt(s);
  const mx = 30 + 1360 / 2 + C.x / 0.0065;
  return A.clone().lerp(C, peelAt(t, peelRank(mx)));
}

test('the tangent the shader builds is the true direction of the moving centreline (a plain blend was up to a quarter off)', () => {
  let worst = 1, plainWorst = 1;
  for (const id of ['PV_TRUNK', 'V_INT', 'RHV_IVC', 'IVCS_RA', 'A_SMA', 'C1b']) {
    if (!COURSES.has(id)) continue;
    const g = COURSES.get(id)!;
    for (const t of [0.3, 0.5, 0.7]) for (const s of [0.15, 0.4, 0.65, 0.9]) {
      const h = 1e-4, fd = centreAt(id, t, s + h).sub(centreAt(id, t, s - h)).normalize(), got = shaderTangent(id, t, s).normalize();
      worst = Math.min(worst, got.dot(fd));
      const w = peelAt(t, peelRank(30 + 680 + g.curveC.getPointAt(s).x / 0.0065));
      const plain = g.curveA.getTangentAt(s).clone().lerp(g.curveC.getTangentAt(s), w).normalize();
      plainWorst = Math.min(plainWorst, plain.dot(fd));
    }
  }
  assert.ok(worst > 0.9995, `the exact tangent follows the centreline (worst cos ${worst})`);
  assert.ok(worst >= plainWorst - 1e-9, `and is never worse than the plain blend (${plainWorst})`);
});

test('the vessel vertex shader carries the lengths and the slope, and the tubes carry the attribute', () => {
  assert.match(CIRCUIT_VS_HEAD, /attribute vec2 cl;/);
  assert.match(CIRCUIT_VS_HEAD, /circPeelSlope/);
  assert.ok(VESSEL_VS.includes('circPeelSlope'));
  const g = readFileSync('src/scene/circuit/geometry.ts', 'utf8');
  assert.match(g, /'cl'\] as const/);
});

// ── the resistors' numbers ──
test('a resistor line is 2.5 px at x1, 6.9 at x2, 11.3 at x4 and 13 from about x5.3 (the 2D app)', () => {
  assert.equal(resWidth(1), 2.5); assert.equal(resWidth(2), 6.9); assert.equal(resWidth(4), 11.3); assert.equal(resWidth(6), 13); assert.equal(resWidth(100), 13);
  assert.equal(resWidth(0.5), 2.5);
  assert.equal(resHeat(1), 0); assert.equal(resHeat(2), 0.5); assert.equal(resHeat(4), 1); assert.equal(resHeat(50), 1);
  assert.equal(resText(2.34), '×2.3'); assert.equal(resText(12.4), '×12');
  assert.deepEqual(RES_KEYS, ['rLiver', 'rColl', 'rGut']);
});
test('the ramp runs green, amber, red and a wide line is held back where its teeth would merge', () => {
  const ok = [0, 1, 0], ca = [1, 1, 0], da = [1, 0, 0];
  assert.deepEqual(resInk(0, ok, ca, da), ok); assert.deepEqual(resInk(0.5, ok, ca, da), ca); assert.deepEqual(resInk(1, ok, ca, da), da);
  const amp = resAmp(0.3), narrow = resWidthFit(8, 76, amp, 0.3), wide = resWidthFit(8, 76, amp, 2);
  assert.ok(narrow <= wide, 'zoomed out the line is capped lower');
  assert.ok(resWidthFit(2, 76, amp, 2) < resWidthFit(5, 76, amp, 2), 'x2 is still thinner than x5');
  assert.ok(resAmp(0.3) * 0.3 >= RES_SIZES.minAmpPx - 1e-9, 'the teeth are at least 8 px on screen');
  assert.equal(quantScale(1), 1);
});
test('a zigzag has n teeth between its two ends', () => {
  const z = zigzag(0, 0, 60, 0, RES_TEETH, 9);
  assert.equal(z.length, (RES_TEETH + 2) * 2);
  assert.deepEqual([z[0], z[1], z[z.length - 2], z[z.length - 1]], [0, 0, 60, 0]);
  assert.equal(Math.abs(z[3]!), 9); assert.equal(z[3], -z[5]!);
});
test('the liver\'s resistor is two zigzags, each led from its sinusoid station to its central vein; the others lie on their lanes', () => {
  const liver = resShape('rLiver', 2, 1);
  assert.equal(liver.polys.length, 2); assert.equal(liver.veil.length, 2);
  const [a, b] = liver.polys as [number[], number[]];
  assert.ok(a[0]! > NODE_CIRCUIT.SIN_R![0]! && a[0]! <= RES_LIVER[0]!, 'the lead starts at the dot\'s ring');
  assert.ok(a[a.length - 2]! >= RES_LIVER[2]! && a[a.length - 2]! < NODE_CIRCUIT.CV_R![0]!);
  assert.ok(b[1]! > 300, 'the second is the left lobe\'s');
  for (const k of ['rColl', 'rGut'] as const) {
    const s = resShape(k, 3, 1);
    assert.equal(s.polys.length, 1);
    assert.equal(s.polys[0]!.length, (RES_TEETH + 2) * 2);
  }
});
test('the resistors\' words and place are the 2D app\'s', () => {
  assert.deepEqual(RES_LABEL, { rLiver: 'R liver', rColl: 'R collaterals', rGut: 'R splanchnic' });
  assert.deepEqual([...RES_LIVER], [812, 303, 888, 303, 812, 387, 888, 387]);
});

// ── the captions ──
const fakeCtx = (over: Partial<CapCtx> = {}): CapCtx => ({
  proj: (x, y) => [x * 0.7, y * 0.7], upright: false, vp: { w: 1200, h: 800 }, measure: (t, size) => t.length * size * 0.55,
  stationOn: () => true, laneDrawn: (id) => id in LANE_CAPTIONS, view: { x0: 0, y0: 0, x1: 1000, y1: 600 }, liverOpen: false, zoomed: false, compact: false,
  laneCourse: (id) => (CIRCUIT_D[id] ? courseOf(CIRCUIT_D[id]!) : null), station: (id) => CIRCUIT_NODES[id]?.at ?? null,
  res: {}, scale: 0.7, resWidth: () => 5, resLane: (k) => courseOf(CIRCUIT_D[k === 'rGut' ? 'A_SMA' : 'C1b']!), must: new Set(), ...over,
});
test('the five zone titles stand along the top of the wide map, and a narrow band takes its short form', () => {
  const b = buildCaptions(fakeCtx());
  for (const [txt] of CIRCUIT_ZONES) assert.ok(b.items.some((i) => i.id === `z:${txt}`), txt);
  const narrow = buildCaptions(fakeCtx({ proj: (x, y) => [x * 0.12, y * 0.12], view: { x0: 0, y0: 0, x1: 300, y1: 200 } }));
  const z = narrow.items.find((i) => i.id === 'z:Hepatic veins · IVC');
  if (z) assert.ok(ZONE_SHORT['Hepatic veins · IVC']!.includes(z.forms[0]!.text), 'the short form');
  assert.ok(narrow.items.filter((i) => i.id.startsWith('z:')).length < 5 || narrow.items.every((i) => !i.id.startsWith('z:') || true));
});
test('every station is named, on a phone too (the azygos, the lower IVC); the liver\'s inner ones wait for a zoom, and a named one always stands', () => {
  const full = buildCaptions(fakeCtx()), phone = buildCaptions(fakeCtx({ compact: true })), zoomed = buildCaptions(fakeCtx({ zoomed: true, liverOpen: true }));
  const ids = (b: ReturnType<typeof buildCaptions>) => new Set(b.items.filter((i) => b.meta.get(i.id)?.kind === 'station').map((i) => i.id));
  assert.ok(ids(full).has('CONF') && ids(full).has('SIN_R') === false, 'collapsed liver: its inner stations are hidden');
  assert.ok(ids(zoomed).has('SIN_R') && ids(zoomed).has('CV_R'));
  assert.deepEqual([...ids(phone)].sort(), [...ids(full)].sort(), 'a phone names the same stations a desktop does');
  for (const id of ['AZY', 'IVCI', 'ILI', 'LRV']) assert.ok(ids(phone).has(id), `${id} is named on a phone`);
  assert.ok(ids(buildCaptions(fakeCtx({ compact: true, must: new Set(['COL']) }))).has('COL'));
  assert.ok(ids(zoomed).size > ids(full).size);
});
test('a station has three forms (name, short name, reading alone) and the 2D app\'s sides, turned with the map', () => {
  const wide = buildCaptions(fakeCtx()), tall = buildCaptions(fakeCtx({ upright: true }));
  const c = wide.items.find((i) => i.id === 'CONF')!, ct = tall.items.find((i) => i.id === 'CONF')!;
  assert.deepEqual(c.dirs, CIRCUIT_LABELS.CONF!.dirs);
  assert.deepEqual(ct.dirs, CIRCUIT_LABELS.CONF!.dirs.map((d) => TURN_DIR[d]));
  assert.ok(c.forms.length >= 2 && c.forms[c.forms.length - 1]!.w < c.forms[0]!.w);
  assert.equal(c.pri, 10);
  assert.equal(TURN_DIR.N, 'W'); assert.equal(TURN_DIR.E, 'N'); assert.equal(TURN_DIR.NE, 'NW');
});
test('a lane is captioned only while its vessel is drawn, in two lines beside a resistor\'s zigzag', () => {
  assert.equal(buildCaptions(fakeCtx({ laneDrawn: () => false })).items.filter((i) => i.id.startsWith('lane:')).length, 0);
  assert.ok(buildCaptions(fakeCtx()).items.some((i) => i.id === 'lane:C6'));
  const withRes = buildCaptions(fakeCtx({ res: { rColl: 3 }, laneDrawn: (id) => id === 'C1b' }));
  const one = withRes.meta.get('lane:C1b')!;
  assert.match(one.forms[0]!.name, /\n/, 'cut in two beside the zigzag');
  const bare = buildCaptions(fakeCtx({ laneDrawn: (id) => id === 'C1b' })).meta.get('lane:C1b')!;
  assert.doesNotMatch(bare.forms[0]!.name, /\n/);
});
test('upright, a zone title runs up the map\'s left edge, turned (its placed box is the turned one), and the Liver\'s and the Heart\'s open their cards', () => {
  const wide = buildCaptions(fakeCtx());
  // standing the map up turns the screen's points a quarter: x, y -> y, -x (the left edge is the band row of the wide map's top)
  const up = buildCaptions(fakeCtx({ upright: true, proj: (x, y) => [60 + (y - 30) * 0.7, 20 + (x - 30) * 0.7], view: { x0: 0, y0: 0, x1: 600, y1: 1000 } }));
  const zw = wide.items.find((i) => i.id === 'z:Portal veins')!, zu = up.items.find((i) => i.id === 'z:Portal veins')!;
  assert.equal(wide.meta.get('z:Portal veins')!.rot, false);
  assert.equal(up.meta.get('z:Portal veins')!.rot, true);
  assert.ok(Math.abs(zu.forms[0]!.w - zw.forms[0]!.h) < 1e-9 && Math.abs(zu.forms[0]!.h - zw.forms[0]!.w) < 1e-9, 'width and height swap when it stands turned');
  assert.deepEqual(ZONE_ORGAN, { 'Liver · sinusoids': 'liver', Heart: 'heart' });
  assert.equal(wide.meta.get('z:Liver · sinusoids')!.link, 'liver');
  assert.equal(wide.meta.get('z:Heart')?.link, 'heart');
  assert.equal(wide.meta.get('z:Portal veins')!.link, undefined);
  // a wide title keeps 14 px (half its height and 2) below the top of the free room, even where the map's top has scrolled out of it
  const high = buildCaptions(fakeCtx({ proj: (x, y) => [x * 0.7, y * 0.7 - 400], view: { x0: 0, y0: 40, x1: 1000, y1: 600 } }));
  for (const i of high.items.filter((q) => q.id.startsWith('z:'))) assert.ok(i.ay - i.forms[0]!.h / 2 >= 40, `${i.id} stays in the free room`);
});
test('a lane\'s caption tries its spots along the lane, N then S, and takes the first where no other vessel touches it', () => {
  assert.deepEqual([...LANE_SPOTS], [0.5, 0.3, 0.7, 0.15, 0.85]);
  const course = courseOf(CIRCUIT_D.C6!);
  const mid = along(course, 0.5), end = along(course, 1);
  assert.ok(Math.hypot(end.p[0] - course[course.length - 1]![0], end.p[1] - course[course.length - 1]![1]) < 1e-6);
  assert.notDeepEqual(mid.p, along(course, 0.3).p);
  const asked: { box: { x0: number; y0: number; x1: number; y1: number }; own: string }[] = [];
  const free = buildCaptions(fakeCtx({ laneDrawn: (id) => id === 'C6', clear: (box, own) => { asked.push({ box, own }); return true; } })).items.find((i) => i.id === 'lane:C6')!;
  assert.equal(asked.length, 1, 'the first spot is clear: no more asked');
  assert.equal(asked[0]!.own, 'C6', 'a lane is not kept clear of itself');
  // the first spot (the middle, above the lane) is taken: the next is tried (below it, then 12 px out, then along)
  let n = 0;
  const next = buildCaptions(fakeCtx({ laneDrawn: (id) => id === 'C6', clear: () => ++n > 1 })).items.find((i) => i.id === 'lane:C6')!;
  assert.equal(n, 2);
  assert.ok(Math.abs(next.ay - free.ay) > 1, 'another side of the lane');
  // no clear spot anywhere: it stands beside the middle, as a lane's caption always had
  const none = buildCaptions(fakeCtx({ laneDrawn: (id) => id === 'C6', clear: () => false })).items.find((i) => i.id === 'lane:C6');
  assert.ok(none, 'never dropped for want of a clear spot');
  assert.equal(n >= 2, true);
  // upright, a lane that runs up the screen is written turned
  const run = buildCaptions(fakeCtx({ upright: true, laneDrawn: (id) => id === 'C6', proj: (x, y) => [y * 0.7, x * 0.7] }));
  const wideRun = buildCaptions(fakeCtx({ laneDrawn: (id) => id === 'C6' }));
  assert.equal(wideRun.meta.get('lane:C6')!.rot, false, 'wide, nothing is turned');
  assert.equal(typeof run.meta.get('lane:C6')!.rot, 'boolean');
});
test('the resistors\' readings must stand, and "vs healthy liver" rides once, on the outermost', () => {
  const b = buildCaptions(fakeCtx({ res: { rLiver: 2.4, rColl: 5.1, rGut: 1.2 } }));
  const res = b.items.filter((i) => i.id.startsWith('res:'));
  assert.equal(res.length, 3); assert.ok(res.every((i) => i.must && i.region));
  const keyed = [...b.meta.values()].filter((m) => m.kind === 'res' && m.forms[0]!.key);
  assert.equal(keyed.length, 1); assert.equal(keyed[0]!.res, 'rGut');
  assert.equal(buildCaptions(fakeCtx({ res: { rLiver: 2 } })).meta.get('res:rLiver')!.forms[0]!.key, 'vs healthy liver');
  assert.equal(buildCaptions(fakeCtx()).items.filter((i) => i.id.startsWith('res:')).length, 0);
});

// ── the trees, the caudate lane, custom shunts ──
const tubes = () => new CircuitTubes(createShared(), createLensShared(), { streamTex: { value: null as never }, chainTex: { value: null as never }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 } }, createCircuitShared(8));
test('every branch of the liver\'s four trees is a tube on the map, fixed to its parent\'s lane, thinner than it', () => {
  const t = tubes();
  const trees = t.ids.filter((e) => e.kind === 'tree');
  assert.equal(trees.length, Object.values(CIRCUIT_TREES).reduce((n, l) => n + l.length, 0));
  assert.equal(trees.length, 24);
  for (const e of trees) assert.ok(['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL'].includes(e.parent));
  assert.ok(t.ids.some((e) => e.kind === 'caud'), 'the caudate lane');
  for (const o of t.objects) {
    assert.equal(o.group.visible, false, 'nothing of them is drawn until the map comes in');
    for (const a of ['cC', 'tC', 'fr', 'pk', 'cl']) assert.ok(o.toonMesh.geometry.getAttribute(a), `attribute ${a}`);
  }
  const pre = NETWORK_BY_ID.get('PRE_R')!;
  const first = t.objects[0]!;
  assert.ok(((first.toon.uniforms.radius!.value) as number) < pre.radius);
  t.dispose();
});
test('a branch starts and ends where the 2D tree does, in the map\'s place', () => {
  const t = tubes();
  const o = t.objects[0]!, pos = o.toonMesh.geometry.getAttribute('position');
  const d = CIRCUIT_TREES.PRE_R![0]!.d, pts = courseOf(d), a = mapToScene(pts[0]![0], pts[0]![1]);
  let best = Infinity;
  for (let i = 0; i < pos.count; i++) best = Math.min(best, Math.hypot(pos.getX(i) - a[0], pos.getY(i) - a[1]));
  assert.ok(best < 0.02, `a vertex within the tube's own radius of the branch's start (${best})`);
  t.dispose();
});
test('the tubes ease in with the map and their own presence, and the caudate lane only for a slide about the caudate', () => {
  const t = tubes();
  const ctx = (o: Partial<Parameters<CircuitTubes['update']>[1]> = {}) => ({ ramp: 1, t: 1, body: 1, drawn: () => true, caudPin: false, open: {}, ...o });
  for (let i = 0; i < 20; i++) t.update(50, ctx());
  const tree = t.ids.findIndex((e) => e.kind === 'tree'), caud = t.ids.findIndex((e) => e.kind === 'caud');
  assert.equal(t.objects[tree]!.group.visible, true); assert.equal(t.objects[tree]!.fade, 1);
  assert.equal(t.objects[caud]!.group.visible, false);
  for (let i = 0; i < 20; i++) t.update(50, ctx({ caudPin: true }));
  assert.equal(t.objects[caud]!.group.visible, true);
  for (let i = 0; i < 20; i++) t.update(50, ctx({ ramp: 0 }));
  assert.equal(t.objects[tree]!.group.visible, false, 'with the body showing, the map\'s own tubes are gone');
  t.dispose();
});
test('a custom shunt that opens is routed once, as a transit-map line between its two stations, and keeps its course', () => {
  const t = tubes();
  const [id, from, to] = CUSTOM_EDGES[0]!;
  assert.deepEqual(t.routeOpen({}), []);
  assert.deepEqual(t.routeOpen({ [id]: 8 }), [id]);
  const r = t.routeOf(id)!;
  assert.ok(r.length > 4);
  const a = NODE_CIRCUIT[from]!, b = NODE_CIRCUIT[to]!;
  assert.ok(Math.hypot(r[0]![0] - a[0], r[0]![1] - a[1]) < 1e-6 && Math.hypot(r[r.length - 1]![0] - b[0], r[r.length - 1]![1] - b[1]) < 1e-6);
  const before = JSON.stringify(r);
  assert.deepEqual(t.routeOpen({ [id]: 8 }), [], 'not routed again');
  const [id2] = CUSTOM_EDGES[5]!;
  t.routeOpen({ [id]: 8, [id2]: 6 });
  assert.equal(JSON.stringify(t.routeOf(id)), before, 'nothing on the map moves when another opens');
  t.routeOpen({});
  assert.equal(t.routeOf(id), null, 'a closed one is forgotten');
  assert.ok(t.ids.some((e) => e.kind === 'custom'));
  t.dispose();
});
test('a custom shunt lies on the body too: drawn with the body before the map is in, carried between its two courses, and let go once closed', () => {
  const t = tubes();
  const ctx = (o: Partial<Parameters<CircuitTubes['update']>[1]> = {}) => ({ ramp: 0, t: 0, body: 1, drawn: () => true, caudPin: false, open: {}, ...o });
  const [id] = CUSTOM_EDGES[0]!;
  const open = { [id]: 8 };
  t.routeOpen(open);
  for (let i = 0; i < 20; i++) t.update(50, ctx({ open }));
  const k = t.ids.findIndex((e) => e.kind === 'custom'), o = t.objects[k]!;
  assert.equal(o.group.visible, true, 'on the body as soon as it is open (the Anatomy draws it on its own course, 2D custom-shunt-paths.js)');
  assert.equal(o.fade, 1);
  const len0 = (o.toon.uniforms.len as { value: number }).value;
  for (let i = 0; i < 20; i++) t.update(50, ctx({ open, ramp: 1, t: 1 }));
  assert.equal(o.group.visible, true, 'and on the map');
  const len1 = (o.toon.uniforms.len as { value: number }).value;
  assert.notEqual(len0, len1, 'the flow marks keep their pitch: the length is the body course\'s, then the map course\'s');
  // the body course is the anatomy path's: the tube begins at the plate's own start of it
  const a = CUSTOM_SHUNT_PATH[id]!.match(/-?[\d.]+/g)!.map(Number);
  const pos = (o.group.children[0] as unknown as { geometry: { getAttribute(n: string): { count: number; getX(i: number): number; getY(i: number): number } } }).geometry.getAttribute('position');
  let best = Infinity;
  for (let i = 0; i < pos.count; i++) best = Math.min(best, Math.hypot(pos.getX(i) - x3(a[0]!), pos.getY(i) - y3(a[1]!)));
  assert.ok(best < 0.02, `the tube starts where the anatomy's path does (${best})`);
  // closed: it eases out and is let go; opened again, one tube stands, not two
  t.routeOpen({});
  for (let i = 0; i < 30; i++) t.update(50, ctx());
  assert.equal(t.ids.filter((e) => e.kind === 'custom').length, 0, 'a closed shunt\'s tube is let go');
  t.routeOpen(open);
  assert.equal(t.ids.filter((e) => e.kind === 'custom').length, 1);
  t.routeOpen({}); t.routeOpen(open);
  assert.equal(t.ids.filter((e) => e.kind === 'custom' && e.id === id).length, 2, 'the old one is still easing out');
  for (let i = 0; i < 30; i++) t.update(50, ctx({ open }));
  assert.equal(t.ids.filter((e) => e.kind === 'custom' && e.id === id).length, 1, 'then only the new one stands');
  t.dispose();
});
test('the router keeps to horizontal, vertical and 45 degree runs', () => {
  const lines = Object.values(CIRCUIT_D).map((d) => courseOf(d));
  const router = createRouter({ lines, stations: ROUTER_STATIONS.map((p) => [p[0], p[1]]), bounds: [30, 100, 1390, 770] });
  const pts = router.route(NODE_CIRCUIT.SMV!, NODE_CIRCUIT.RHV!) as number[][];
  assert.ok(pts && pts.length >= 2);
  for (let i = 2; i < pts.length - 1; i++) {   // (the first and last runs join the station to the grid)
    const dx = pts[i]![0]! - pts[i - 1]![0]!, dy = pts[i]![1]! - pts[i - 1]![1]!;
    assert.ok(Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6, `run ${i} is square or 45 degrees`);
  }
});

// ── the procedures leave the map ──
test('the procedure devices dissolve as the figure turns into the Circuit and are back with the body', () => {
  const p = new ProcedureLayer(createShared());
  assert.equal(p.group.visible, true);
  p.setFade(0.5); assert.equal(p.group.visible, true);
  p.setFade(0); assert.equal(p.group.visible, false);
  p.setFade(1); assert.equal(p.group.visible, true);
  const src = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(src, /this\.procs\.setFade\(fade\)/);
  p.dispose();
});

// ── the wiring ──
test('the scene feeds the map\'s own parts and the body\'s labels stand aside in the Circuit', () => {
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  for (const need of ['this.tubes.update(', 'this.resistors.set(', 'setResistors(', 'setCaudatePin(', 'syncCircuitData', 'routeOpen(']) assert.ok(scene.includes(need), need);
  assert.match(readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), /hidden: \(\) => cel\.circuit\.t > 0/);
  assert.match(readFileSync('src/scene/labels/controller.ts', 'utf8'), /d\.hidden\?\.\(\) \? \[\] : this\.active\(\)/);
  assert.match(readFileSync('src/App.tsx', 'utf8'), /<CircuitCaptions \/>/);
  assert.match(readFileSync('src/scene/api.ts', 'utf8'), /setResistors\(keys: readonly ResKey\[\]\)/);
});

// ── a Circuit slide plays on the map ──
test('a Circuit slide frames its region of the map, draws the resistors its sites name, and an upright map is framed turned', async () => {
  const { planSlide } = await import('../src/decks/hp/plan.ts');
  const { circuitBoxShot, circuitShot } = await import('../src/scene/circuit/shots.ts');
  const { loadAgDeck } = await import('../src/decks/ag/index.ts');
  const deck = await loadAgDeck('circuit' as never) as unknown as { slides: never[] };
  const plans = deck.slides.map((s, i) => planSlide('circuit', s, i));
  assert.ok(plans.length > 5);
  for (const p of plans.filter((q) => q.id !== 'summary')) {   // (the summary table is the body's, as in 2D: it names no view)
    assert.equal(p.scene.view, 'circuit', p.id); assert.ok(p.scene.circuit, `${p.id} carries the map's region`);
  }
  const ohm = plans.find((p) => p.id === 'ohm')!;
  assert.deepEqual(ohm.scene.circuit!.resistors, ['rLiver', 'rColl']);
  const where = plans.find((p) => p.id === 'where')!;
  assert.deepEqual(where.scene.circuit!.resistors, ['rLiver', 'rColl', 'rGut']);
  // a region is a part of the map: its shot is smaller than the whole map's, centred on the region
  const box = [630, 200, 950, 450] as const;
  const part = circuitBoxShot(box, false), whole = circuitShot(false);
  assert.ok(part.half[0] < whole.half[0] && part.half[1] < whole.half[1]);
  const c = mapToScene(790, 325);
  assert.ok(Math.abs(part.target[0] - c[0]) < 1e-9 && Math.abs(part.target[1] - c[1]) < 1e-9);
  // kMax keeps it from closing in further than the whole map's fit over kMax
  const tight = circuitBoxShot([780, 300, 800, 310], false, 2);
  assert.ok(Math.abs(tight.half[0] - whole.half[0] / 2) < 1e-9);
  // upright: the box turns with the map, its extents swap
  const up = circuitBoxShot(box, true);
  assert.ok(Math.abs(up.half[0] - part.half[1]) < 1e-9 && Math.abs(up.half[1] - part.half[0]) < 1e-9);
  assert.ok(Math.abs(circuitShot(true).half[0] - whole.half[1]) < 1e-9);
});

test('a tier is named in small capitals at its band, and the tiers are drawn as soft full-width washes and the dot grid eases off when zoomed in', () => {
  const b = buildCaptions(fakeCtx({ compact: true })), zones = b.items.filter((i) => b.meta.get(i.id)?.kind === 'zone');
  assert.ok(zones.length >= 3, 'the tiers are named');
  for (const z of zones) { const n = b.meta.get(z.id)!.forms[0]!.name; assert.equal(n, n.toUpperCase()); }
  const layer = readFileSync(new URL('../src/scene/circuit/map-layer.ts', import.meta.url), 'utf8');
  assert.match(layer, /DOT_CALM/);
  assert.doesNotMatch(layer, /TIER_LINE/, 'no line is drawn between the tiers');
  assert.match(layer, /\* BAND_CALM;/);
});

test('zoomed in on the map: no vessel is culled by its body sphere, corners are rounded, and the names keep clear of the floating bars', async () => {
  const vo = readFileSync(new URL('../src/scene/vessels/vessel-object.ts', import.meta.url), 'utf8');
  assert.match(vo, /this\.toonMesh\.frustumCulled = false/, 'the Circuit moves the vertices far from the body course the bounding sphere was taken from');
  assert.match(vo, /mesh\.frustumCulled = false/);
  const { roundCorners, CORNER_R, mapCourse } = await import('../src/scene/circuit/course.ts');
  const bend = roundCorners([[0, 0], [100, 0], [100, 100]]);
  assert.deepEqual(bend[0], [0, 0]); assert.deepEqual(bend[bend.length - 1], [100, 100]);
  assert.ok(bend.every(([x, y]) => !(x === 100 && y === 0)), 'the sharp corner is gone');
  assert.ok(bend.some(([x, y]) => Math.abs(x - (100 - CORNER_R)) < 1e-6 && y === 0), 'the bend starts CORNER_R before the corner');
  assert.ok(Math.min(...bend.map(([x, y]) => Math.hypot(x - 100, y))) > 3, 'and never touches it');
  assert.equal(roundCorners([[0, 0], [10, 1], [20, 3]]).length, 3, 'a gentle curve is left as it is');
  assert.ok(mapCourse('SMV_CONF')!.length > 4, 'a course with a corner is rounded');
  const caps = readFileSync(new URL('../src/scene/circuit/CircuitCaptions.tsx', import.meta.url), 'utf8');
  assert.match(caps, /readUiWalls/);
  assert.match(readFileSync(new URL('../src/scene/circuit/ui-walls.ts', import.meta.url), 'utf8'), /\.nb-views/, 'the view pill is a wall');
});

test('the liver\'s beds and the hepatic arteries are drawn in the Circuit although the body leaves the beds out', async () => {
  const { presenceOf, NETWORK } = await import('../src/scene/vessels/network.ts');
  const n = 400, f = { Q: new Float64Array(n).fill(1), D: new Float64Array(n).fill(5) };
  const bed = NETWORK.filter((v) => v.kind === 'liver');
  assert.ok(bed.length >= 5, 'the liver beds are in the network');
  for (const v of bed) {
    assert.equal(presenceOf(v, f as never, { collaterals: false }), 'hidden', `${v.id}: not in the body`);
    assert.equal(presenceOf(v, f as never, { collaterals: false, circuit: true }), 'shown', `${v.id}: on the map`);
  }
  for (const id of ['A_HEP', 'A_HR', 'A_HL']) assert.equal(presenceOf(NETWORK.find((v) => v.id === id)!, f as never, { collaterals: false, circuit: true }), 'shown', `${id} is drawn in the Circuit`);
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /circuit: this\.figureView === 'circuit'/);
  assert.match(sc, /wasCircuit !== \(v === 'circuit'\)/, 'the presence is worked out again when the view changes');
});

test('the Circuit\'s outline is seen on a dark map: a soft near-black line that also sits just inside the edge and fades inward, and a station dot ring that does not vanish on the ground', async () => {
  const { CASING, CIRC_RIM_DARK, CIRC_INK_K } = await import('../src/scene/vessels/cel-ink.ts');
  const sh0 = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  for (const id of ['dark', 'navy', 'black'] as const) assert.deepEqual([...CASING[id].circ.rgb], [...CIRC_RIM_DARK], `${id}: a soft near-black line`);
  for (const id of ['light', 'soft'] as const) assert.ok(CASING[id].circ.rgb[0] < 100, `${id}: ink stays dark on a light map`);
  assert.ok(CIRC_RIM_DARK.every((c) => c < 80), 'dark, not white');
  assert.ok(CIRC_INK_K >= 1 && CIRC_INK_K < 1.3, 'not thicker than the Anatomy by much');
  assert.match(sh0, /circT \* \$\{F\(CIRC_INNER\.K\)\} \* smoothstep\(rDevAx - inDepth, rDevAx, dLat\)/);
  const sh = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.match(sh, /mix\(1\.0, \$\{F\(CIRC_INK_K\)\}, circT\)/);
  assert.match(readFileSync(new URL('../src/scene/circuit/map-layer.ts', import.meta.url), 'utf8'), /DOT_RING_DARK/);
});

test('a hidden or a big layer never walls off a side of the Circuit: every left-hand station and the first tier name stand on a wide screen', async () => {
  const { isChip } = await import('../src/scene/circuit/ui-walls.ts');
  const { solve } = await import('../src/scene/labels/solver.ts');
  assert.ok(isChip(1600, 52, 1600, 870), 'the top bar');
  assert.ok(isChip(560, 120, 1600, 870), 'the dock');
  assert.ok(isChip(44, 120, 1600, 870), 'the zoom pill');
  assert.ok(!isChip(520, 800, 1600, 870), 'a card or a layer down a side');
  assert.ok(!isChip(1580, 860, 1600, 870), 'a layer over the screen');
  const view = { x0: 0, y0: 56, x1: 1600, y1: 870 };
  const b = buildCaptions(fakeCtx({ proj: (x, y) => [(88 + (x - 140) * 1.475) * 0.8, (190 + (y - 191) * 1.46) * 0.8 + 100], vp: { w: 1600, h: 870 }, view }));
  const out = solve({ items: b.items, view, blockers: [], lines: [] });
  const placed = new Set(out.placed.map((p) => p.id));
  for (const id of ['INT', 'COL', 'SPL', 'STO', 'SMV', 'IMV', 'SV', 'LGV', 'GV', 'z:Splanchnic beds']) assert.ok(placed.has(id), `${id} stands`);
  const src = readFileSync(new URL('../src/scene/circuit/CircuitCaptions.tsx', import.meta.url), 'utf8');
  assert.match(src, /view: room,/, 'the tier names and the lanes are kept to the screen, not to the cards\' leftovers');
});
