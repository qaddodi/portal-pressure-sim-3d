import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { readFileSync } from 'node:fs';
import manifest from '../src/scene/organs/organs-manifest.json' with { type: 'json' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, NODES } from '../src/engine/hales/portal/topology.js';
import { EDGE_IDS, hasVessel, indexOf } from '../src/engine/vessel-data.ts';
import { DRAWN_EDGE_IDS, NETWORK, NETWORK_BY_ID, RUN_ONS, NEEDS_C3_IDS, collateralOpen, presenceOf, recruitFrac, radiusOf, vesselPx, widthPx } from '../src/scene/vessels/network.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { TIER_Z, UNITS_PER_SCENE, x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';
import { pathToFileURL } from 'node:url';
import { PresenceTracks, PRESENCE_MS } from '../src/scene/vessels/presence-track.ts';
import { frameFor } from './b3-frames.ts';
import { HIDDEN_EDGES } from '../src/scene/vessels/paths.copied.ts';

const nodeIds = new Set((NODES as { id: string }[]).map((n) => n.id));
const edge = new Map((EDGES as { id: string; kind: string; from: string; to: string }[]).map((e) => [e.id, e]));

import { ALONG_VEIN_IDS, withStartInOrgan } from '../src/scene/vessels/starts.ts';

test('every vessel the 2D figure draws is a vessel here, named by its engine edge id', () => {
  const have = new Set(NETWORK.map((v) => v.id));
  for (const id of DRAWN_EDGE_IDS) assert.ok(have.has(id), `${id} is missing from the network`);
  assert.equal(have.size, NETWORK.length, 'ids are unique');
  for (const v of NETWORK) assert.ok(hasVessel(v.lensId) && EDGE_IDS[indexOf(v.lensId)] === v.lensId, `${v.id} has a texel`);
});

test('hidden edges (the wedge, the diode, the caudate, the surgical shunts) are not in the network', () => {
  for (const id of HIDDEN_EDGES) assert.ok(!NETWORK_BY_ID.has(id), id);
  for (const id of ['WEDGE', 'CAUD']) assert.ok(!NETWORK_BY_ID.has(id));
});

test('every vessel has geometry that starts and ends in the finite plate', () => {
  for (const v of NETWORK) {
    assert.ok(v.pts.length >= 2, `${v.id} has points`);
    for (const p of v.pts) for (const c of p) assert.ok(Number.isFinite(c), `${v.id} finite`);
    assert.ok(nodeIds.has(v.from) && nodeIds.has(v.to), `${v.id} runs between two engine nodes`);
  }
});

test('collaterals open by growth or flow; the epigastric veins follow the paraumbilical (C3)', async () => {
  const healthy = await frameFor('healthy');
  const cirr = await frameFor('cirr-decomp');
  const closed = (id: string, f: typeof healthy.frame) => presenceOf({ id, kind: 'collateral' }, f, { collaterals: false });
  assert.equal(closed('C1a', healthy.frame), 'hidden');
  assert.equal(presenceOf({ id: 'C1a', kind: 'collateral' }, healthy.frame, { collaterals: true }), 'ghost');
  let opened = 0;
  for (const v of NETWORK) if (v.kind === 'collateral' && collateralOpen(v.id, cirr.frame)) opened++;
  assert.ok(opened > 0, 'a decompensated cirrhosis has open collaterals');
  for (const id of NEEDS_C3_IDS) {
    const want = recruitFrac('C3', cirr.frame) > 0.15 ? 'shown' : 'hidden';
    assert.equal(presenceOf({ id, kind: edge.get(id)!.kind }, cirr.frame, { collaterals: false }), want, id);
    assert.equal(presenceOf({ id, kind: edge.get(id)!.kind }, healthy.frame, { collaterals: true }), 'hidden', `${id} healthy`);
  }
  // an ordinary vein is always drawn
  assert.equal(presenceOf({ id: 'PV_TRUNK', kind: 'vein' }, healthy.frame, { collaterals: false }), 'shown');
});

interface Fake { edge: { id: string }; group: { visible: boolean }; reveal: number; dotted: boolean; setReveal(a: number): void; setDotted(on: boolean): void }
const fake = (id: string): Fake => ({ edge: { id }, group: { visible: true }, reveal: 1, dotted: false, setReveal(a) { this.reveal = a; }, setDotted(on) { this.dotted = on; } });

test('a vessel that comes and goes draws on and retracts along its flow, and never pops', () => {
  const a = fake('C1a');
  const t = new PresenceTracks([a as never]);
  t.set('C1a', 'hidden', true);
  assert.equal(a.group.visible, false);
  t.set('C1a', 'shown');
  let last = 0, steps = 0;
  while (t.step(16)) { assert.ok(a.reveal >= last - 1e-9, 'draws on monotonically'); assert.ok(a.reveal - last <= 16 / PRESENCE_MS + 1e-9, 'a step is small'); last = a.reveal; steps++; assert.ok(steps < 200); }
  assert.equal(a.reveal, 1); assert.equal(a.group.visible, true);
  t.set('C1a', 'hidden');
  t.step(16);
  assert.ok(a.reveal < 1 && a.reveal > 0, 'retracts, does not vanish');
  while (t.step(16));
  assert.equal(a.group.visible, false);
});

test('a closed collateral changing to dotted retracts the solid one first, then draws the dotted', () => {
  const a = fake('C2');
  const t = new PresenceTracks([a as never]);
  t.set('C2', 'shown', true);
  t.set('C2', 'ghost');
  t.step(16);
  assert.equal(a.dotted, false, 'still solid while it retracts');
  while (t.step(16));
  assert.equal(a.dotted, true); assert.equal(a.reveal, 1);
});

import { BufferAttribute, BufferGeometry } from 'three';
import { withRk } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

test('the vessel geometry is the tube once (the outline is part of it, not a second copy), with a radius share of 1 where the course gave none', () => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  g.setAttribute('tang', new BufferAttribute(new Float32Array(9).fill(1), 3));
  g.setIndex([0, 1, 2]);
  const m = withRk(g);
  assert.equal(m.getAttribute('position').count, 3);
  assert.equal(m.getAttribute('hull'), undefined, 'no hull copy');
  assert.deepEqual([...m.getIndex()!.array], [0, 1, 2]);
  assert.deepEqual([...m.getAttribute('rk').array], [1, 1, 1]);
});

const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const mod = await import(parserName); parse = (s) => mod.parser.parse(s.replace(/^#include.*$/gm, ''), { quiet: true }); } catch { /* not installed */ }
test('the vessel vertex shader parses; there is no hull attribute and the outline is painted in the fragment stage', { skip: !parse }, () => {
  parse!(VESSEL_VS.replace(/^\n/, ''));
  assert.doesNotMatch(VESSEL_VS, /attribute float hull/);
  assert.doesNotMatch(VESSEL_FS, /hullOn|vHull/);
  assert.match(VESSEL_FS, /if \(!gl_FrontFacing\) discard/);
});


// ---- the vessels are the 2D figure's, point for point ----
test('every vessel is its 2D course through the one linear map: back through it, each point is the 2D point', () => {
  for (const v of NETWORK) {
    if (v.feeder) continue;   // (a fan of tributaries: its own test, below)
    if (ALONG_VEIN_IDS.has(v.id)) continue;   // (the hepatic arteries run beside their portal branches: starts.ts alongVein)
    const c = withStartInOrgan(v.id, EDGE_PATH_2D[v.id]!);   // (the splenic vein is carried on into the spleen: starts.ts)
    assert.equal(v.pts.length, c.length, v.id);
    // (the 2D figure redraws the last 11 samples either side of a run-on as one smooth cubic through the join: joins.ts)
    const near = (i: number) => RUN_ONS.some((r) => (r.a === v.id && (r.ia ? i >= c.length - 12 : i <= 11)) || (r.b === v.id && (r.ib ? i >= c.length - 12 : i <= 11)));
    v.pts.forEach((p, i) => {
      if (near(i)) return;
      assert.ok(Math.abs(x2d(p[0]) - c[i]![0]) < 1e-6 && Math.abs(y2d(p[1]) - c[i]![1]) < 1e-6, `${v.id} point ${i}`);
    });
  }
});

test('the vessels lie in one plane through the organs, not in front of them: every tier is inside the liver, the heart, the kidney and the stomach, and the tiers are close (Mohammad, 20 Nov)', () => {
  const b = readFileSync('public/anatomy/organs.bin'), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const M = manifest as unknown as { q: number; organs: Record<string, [number, number]> };
  const zr = (id: string) => { const [pb, nv] = M.organs[id]!, q = new Int16Array(buf, pb, nv * 3); let lo = Infinity, hi = -Infinity; for (let i = 0; i < nv; i++) { const z = q[i * 3 + 2]! / M.q; lo = Math.min(lo, z); hi = Math.max(hi, z); } return { lo, hi }; };
  const zs = Object.entries(TIER_Z).filter(([k]) => k !== 'fwd').map(([, z]) => z);
  for (const id of ['liver', 'heart', 'kidney-l', 'stomach']) { const r0 = zr(id), r = { lo: r0.lo + ORGAN_Z[id]!, hi: r0.hi + ORGAN_Z[id]! }; for (const t of Object.entries(TIER_Z).filter(([k]) => k !== 'fwd')) assert.ok(t[1] > r.lo && t[1] < r.hi, `${t[0]} (${t[1]}) is inside ${id} (${r.lo} to ${r.hi})`); }
  { const r0 = zr('spleen'), z = NZ.get('SPL')!; assert.ok(z > r0.lo + ORGAN_Z.spleen! && z < r0.hi + ORGAN_Z.spleen!, 'the splenic vein starts inside the spleen'); }
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 0.2, 'one plane: the tiers differ by a crossing only');
  // the paraumbilical vein runs in front of the main portal vein where they cross, by more than both their radii (never through it)
  { const c3 = NETWORK_BY_ID.get('C3')!, pv = NETWORK_BY_ID.get('PV_TRUNK')!, a = coursesOf(c3, REST)[0]!.pts, b = coursesOf(pv, REST)[0]!.pts;
    let min = Infinity, near = 0;
    for (const p of a) for (const q of b) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) < c3.radius + pv.radius) { near++; min = Math.min(min, p[2] - q[2] - c3.radius - pv.radius); } }
    assert.ok(near > 0, 'they cross');
    assert.ok(min > 0, `C3 passes ${min.toFixed(3)} clear in front of the portal trunk`); }
  // a vessel's own depth never moves more than that along its course (a jog of a quarter unit in z was a 14 degree sideways zigzag)
  for (const v of NETWORK) if (!v.feeder) { const zz = v.pts.map((p) => p[2]); assert.ok(Math.max(...zz) - Math.min(...zz) <= 0.2, `${v.id} stays in the plane`); }
});

test('the map is the artist\'s: confluence at the origin, 300 2D units to a scene unit, y up', () => {
  assert.equal(UNITS_PER_SCENE, 300);
  assert.equal(x3(700) + 0, 0); assert.equal(y3(556) + 0, 0);
  assert.equal(x3(1000), 1); assert.equal(y3(256), 1);
  const conf = NODE_POS_2D.CONF;
  if (conf) assert.deepEqual([x3(conf[0]) + 0, y3(conf[1]) + 0], [0, 0]);
});

test('a vessel starts and ends where the 2D figure puts its end nodes (a course that runs from node to node)', () => {
  let checked = 0;
  for (const v of NETWORK) {
    const a = NODE_POS_2D[v.from], b = NODE_POS_2D[v.to];
    const p0 = v.pts[0]!, p1 = v.pts[v.pts.length - 1]!;
    if (a && Math.hypot(x2d(p0[0]) - a[0], y2d(p0[1]) - a[1]) < 6) checked++;
    if (b && Math.hypot(x2d(p1[0]) - b[0], y2d(p1[1]) - b[1]) < 6) checked++;
  }
  assert.ok(checked > NETWORK.length, `${checked} ends sit on their nodes`);
});

test('over and under follow the 2D tiers: the portal tree over the network, the network over the collaterals, arteries beside, the cava behind', () => {
  const z = (id: string) => NETWORK_BY_ID.get(id)!.pts[0]![2];
  assert.ok(z('PV_TRUNK') > z('RHV_IVC'), 'portal trunk over the hepatic vein');
  assert.ok(z('RHV_IVC') > z('C1a') || z('RHV_IVC') < z('C1a'), 'distinct tiers');
  assert.equal(z('PV_TRUNK'), TIER_Z.front);
  assert.equal(z('A_HEP'), TIER_Z.art);
  assert.ok(z('IVCS_RA') < z('PV_TRUNK') && z('IVCS_RA') <= TIER_Z.back + 1e-9, 'the cava is the rearmost tier');
  assert.ok(TIER_Z.back < TIER_Z.art && TIER_Z.art < TIER_Z.mid && TIER_Z.mid < TIER_Z.net && TIER_Z.net < TIER_Z.front && TIER_Z.front < TIER_Z.over);
  for (const v of NETWORK) assert.ok(v.pts.every((p) => p[2] === TIER_Z[v.tier]), `${v.id} is one plane`);
});

test('widths are the 2D figure\'s: the portal trunk, an artery at half, the liver\'s beds fixed', () => {
  const pv = NETWORK_BY_ID.get('PV_TRUNK')!, ha = NETWORK_BY_ID.get('A_HEP')!, sin = NETWORK_BY_ID.get('SIN_RR')!;
  const d = (id: string) => (EDGES as { id: string; d?: number; dMax?: number }[]).find((e) => e.id === id)!;
  assert.equal(pv.radius, radiusOf(vesselPx(d('PV_TRUNK').d ?? 12)));
  assert.ok(ha.radius < pv.radius / 2 + 1e-9);
  assert.equal(sin.radius, radiusOf(3.6));
  assert.equal(pv.widthKind, 0); assert.equal(ha.widthKind, 1); assert.equal(sin.widthKind, 2);
  assert.ok(widthPx({ id: 'X', from: '', to: '', kind: 'vein' }, 12) === vesselPx(12));
});

// with the 2D checkout beside: the 2D app's own geometry code is the reference (PPS_2D_REPO=<path> npm test)
const repo2d = process.env.PPS_2D_REPO;
test('against the 2D app\'s own SVG courses: every sample lies on its path (within the meander\'s 4.5 units; collaterals and shunts exactly)', { skip: !repo2d }, async () => {
  const A = await import(pathToFileURL(`${repo2d}/src/ui/anatomy.js`).href);
  const toks = (d: string) => d.match(/[MLC]|-?\d*\.?\d+/g)!;
  const dense = (d: string): [number, number][] => {
    const t = toks(d), out: [number, number][] = [];
    let i = 0, cmd = '', cx = 0, cy = 0;
    while (i < t.length) {
      if (/[MLC]/.test(t[i]!)) cmd = t[i++]!;
      if (cmd === 'M' || cmd === 'L') { cx = +t[i++]!; cy = +t[i++]!; out.push([cx, cy]); }
      else { const [x1, y1, x2, y2, x3_, y3_] = t.slice(i, i + 6).map(Number) as number[]; i += 6; for (let k = 1; k <= 100; k++) { const u = k / 100, w = 1 - u; out.push([w * w * w * cx + 3 * w * w * u * x1! + 3 * w * u * u * x2! + u * u * u * x3_!, w * w * w * cy + 3 * w * w * u * y1! + 3 * w * u * u * y2! + u * u * u * y3_!]); } cx = x3_!; cy = y3_!; }
    }
    return out;
  };
  const near = (P: [number, number][], q: readonly [number, number]) => { let b = Infinity; for (let i = 1; i < P.length; i++) { const [ax, ay] = P[i - 1]!, [bx, by] = P[i]!, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, u = Math.min(1, Math.max(0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / L)); b = Math.min(b, Math.hypot(ax + dx * u - q[0], ay + dy * u - q[1])); } return b; };
  for (const v of NETWORK) {
    if (!A.EDGE_PATH[v.id]) { assert.ok(v.id.includes('~F'), `${v.id} has no 2D course`); continue; }   // (a tributary fan has none: it is drawn from the host's feeder table)
    const P = dense(A.EDGE_PATH[v.id]);
    const exact = v.kind === 'shunt' || (v.kind === 'collateral' && !(EDGES as { id: string; spontaneous?: boolean }[]).find((e) => e.id === v.id)!.spontaneous);
    const tol = exact ? 0.6 : 4.6;
    // the ends are the path's own ends, except where the vessel runs on into another: 2D redraws the samples about the join as one cubic (vein-joins.js smoothRunOn), stopping when the
    // curve passes within RUN_ON_MISS (2 units) of the join; its end samples are the cubic's middle and may stand well off the join, so a run-on end is held to that rule instead:
    // the drawn pair passes within 2.6 of the join (the path's own end), and the pair's ends are one point
    const runOn = (i: 0 | 1) => RUN_ONS.find((x) => (x.a === v.id && x.ia === i) || (x.b === v.id && x.ib === i));
    const ends = (i: 0 | 1) => {
      const q = i ? P[P.length - 1]! : P[0]!, r = runOn(i);
      if (!r) { const p = i ? v.pts[v.pts.length - 1]! : v.pts[0]!; return { q, tol: 0.6, d: Math.hypot(x2d(p[0]) - q[0], y2d(p[1]) - q[1]) }; }
      const other = NETWORK_BY_ID.get(r.a === v.id ? r.b : r.a)!, oi = r.a === v.id ? r.ib : r.ia;
      // each vessel's last 13 samples toward the join, one after the other through it
      const toward = (w: typeof v, wi: number) => (wi ? w.pts.slice(-13) : w.pts.slice(0, 13).reverse()).map((p) => [x2d(p[0]), y2d(p[1])] as [number, number]);
      const line = [...toward(v, i), ...toward(other, oi).reverse()];
      return { q, tol: 2.6, d: near(line, q) };
    };
    const s0 = ends(0), s1 = ends(1);
    assert.ok(s0.d < s0.tol, `${v.id} start`);
    assert.ok(s1.d < s1.tol, `${v.id} end`);
    // every sample lies on the path; the stretch redrawn about a run-on (E = 10 samples at each end) may stand off it by as much as the join is off the path's own end
    // (the redrawn stretch is a cubic through the join, so its samples stand off the path by as much as the two courses bend apart, up to about 7 units on the long veins; the cava's pieces
    // reach farther, 2D drawing the cava as one tube and smoothing fewer of its samples about a join (vein-joins.js runOnSamples), which is not ported: a bound of 20 for any run-on stretch, the path's own at every other sample)
    const N = v.pts.length, reach = 20;
    v.pts.forEach((p, i) => {
      const extra = (i <= 11 && runOn(0) ? reach : 0) + (i >= N - 12 && runOn(1) ? reach : 0);
      assert.ok(near(P, [x2d(p[0]), y2d(p[1])]) < tol + extra, `${v.id} sample ${i}`);
    });
  }
});

import { NETWORK as NET_Z, NODE_Z as NZ } from '../src/scene/vessels/network.ts';
import { TIER_Z as TZ } from '../src/scene/frame2d.ts';
test('at a fork the widest vessels keep their tier (the cava does not bulge toward the camera at each hepatic or renal vein: the zigzag IVC)', () => {
  for (const n of ['IVCI', 'IVC_D', 'ILI', 'ILI_R']) assert.equal(NZ.get(n), TZ.back, `${n} stays on the cava's own tier`);
  // one rise along the cava, to the hepatic junction: no bulge at the renal veins or the shunts' ends, then a dip, then the rise
  const z = ['ILI', 'IVCI', 'IVC_D', 'IVCS'].map((n) => NZ.get(n)!);
  for (let i = 1; i < z.length; i++) assert.ok(z[i]! >= z[i - 1]! - 1e-9, `the cava never dips back on its way up: ${z.join(', ')}`);
  for (const n of ['PVH', 'CONF']) assert.equal(NZ.get(n), TZ.front, `${n} stays on the portal tree's tier`);
  const two = NET_Z.filter((v) => !v.feeder && (v.from === 'SVC' || v.to === 'SVC'));
  assert.ok(two.length === 2 && NZ.get('SVC') !== undefined, 'a node of two still eases between its tiers');
});
