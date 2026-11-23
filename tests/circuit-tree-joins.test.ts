// The Circuit's liver branches meet their lanes cleanly (23 Nov: "the sinusoid to central vein connection is glitching, same for the multiple connections"). Node only: no browser, no GPU. What is held here:
//   1. DEPTH: every line of the plate has a depth of its own, each branch stands in front of the tube it leaves and the one it reaches (no tie at any fork, rejoining or run-on), and one step is more than one depth-buffer step at the farthest shot;
//   2. NO INK INSIDE THE UNION: a CPU twin of the fragment stage's decision (the front-most tube wins; a tube past its own lumen draws no line where it lies inside its host's lumen) at every fork, rejoining and run-on, at both ends of the
//      boost, finds no ink inside any tube's lumen and no gap in the union's outline; the same twin on the 22 Nov state (all depths tied, no union rule) finds some, so this test fails on it;
//   3. SMOOTH SEAMS: where a venule's tip runs on into a sinusoid branch the two agree in radius and heading, and a sunk end is no wider than its host;
//   4. THE SWITCH RING: where a branch changes from one host to the other it is clear of both;
//   5. SHADER TEXT: the union rule's two gates read nbrMap, only a map-only tube sets it.
// Run: node --test tests/circuit-tree-joins.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPPED, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CIRC_INK_K, MAP_DEPTH_STEP, inkWidthCss } from '../src/scene/vessels/cel-ink.ts';
import { CIRCUIT_D, CIRCUIT_TREES } from '../src/scene/circuit/data.copied.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';
import { MAP_K, circBoostOf, mapToScene } from '../src/scene/circuit/map.ts';
import { mapDepthOf, mapDepthOfTube, mapOrder } from '../src/scene/circuit/map-depth.ts';
import { NBR_HOSTS, NBR_NONE, hostCircW, hostRadiusNow, laneCircW, mapRadius, nbrAgainst, treeCircW, treeEndHost, treeHost, treeNbr, treeNbrAxes, treeNbrWidths, treeOwn } from '../src/scene/circuit/tree-hosts.ts';
import { CircuitTubes, treeEnds } from '../src/scene/circuit/tubes.ts';
import { ringShare } from '../src/scene/circuit/map-ends.ts';
import { circuitWidth } from '../src/scene/vessels/vessel-object.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { createLensShared } from '../src/scene/vessels/vessel-object.ts';
import { createCircuitShared } from '../src/scene/circuit/uniforms.ts';
import { FOV } from '../src/scene/camera/shots.ts';

const text = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const trees = Object.entries(CIRCUIT_TREES).flatMap(([lane, list]) => list.map((b, i) => ({ lane, i, id: `${lane}#${i}`, d: b.d, k: b.k })));
const LANES = Object.keys(CIRCUIT_TREES);
type Pt = [number, number];

/** A tube of the plate as the twin sees it: its course (map units), its width rule and its depth. */
interface Tube { id: string; pts: Pt[]; w: readonly [number, number, number, number]; depth: number; tree: { lane: string; i: number } | null; box: [number, number, number, number]; /** the end is a round cap (a branch's free tip: circCap [0, 1]); every other end is a flat cut (a sunk end closes in its host, a lane's end is joined) */ roundEnd: boolean; /** the tubes this one forms a union with: the ones it leaves and reaches (a run-on too), its siblings, and the branches that leave or reach it */ related: Set<string> }
function tubesOf(): Tube[] {
  const out: Tube[] = [];
  const add = (id: string, d: string, w: Tube['w'], tree: Tube['tree']): void => {
    const pts = courseOf(d), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    out.push({ id, pts, w, depth: mapDepthOf(id), tree, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], roundEnd: !!tree && !treeEndHost(tree.lane, tree.i), related: new Set() });
  };
  for (const l of LANES) add(l, CIRCUIT_D[l]!, hostCircW(l), null);
  for (const t of trees) add(t.id, t.d, hostCircW(t.id), { lane: t.lane, i: t.i });
  // (the lane between the two beds at x = 800 crosses the run-ons)
  const rl = NETWORK_BY_ID.get('SIN_RL');
  if (rl && rl.widthKind !== 0 && CIRCUIT_D.SIN_RL) add('SIN_RL', CIRCUIT_D.SIN_RL, laneCircW(rl.widthKind, rl.circFine ?? 1), null);
  const byId = new Map(out.map((t) => [t.id, t]));
  const link = (a: string, b: string): void => { byId.get(a)?.related.add(b); byId.get(b)?.related.add(a); };
  for (const t of trees) {
    const s = treeHost(t.lane, t.i)!, e = treeEndHost(t.lane, t.i);
    link(t.id, s.host);
    if (e) link(t.id, e.host);
    for (const a of treeNbrAxes(t.lane, t.i)) link(t.id, a.id);
  }
  return out;
}
/** The distance from a point to a tube's course: a capsule where the end is round (a free tip), a flat cut where it is not (nothing of the tube lies past the end's plane: infinite there). */
const dist = (t: Tube, x: number, y: number): number => {
  const pts = t.pts, n = pts.length;
  let best = Infinity;
  for (let q = 1; q < n; q++) {
    const a = pts[q - 1]!, b = pts[q]!, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, raw = l2 > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0;
    if ((q === 1 && raw < 0) || (q === n - 1 && raw > 1 && !t.roundEnd)) continue;   // (past a flat end: not this tube)
    const u = Math.max(0, Math.min(1, raw));
    best = Math.min(best, Math.hypot(a[0] + dx * u - x, a[1] + dy * u - y));
  }
  return best;
};
/** The map's two ends of zoom: the boost 1 (zoomed in, 1 map unit = 2/3 CSS px and up) and 1.75 (the whole map on a phone: a map unit is 0.38 CSS px). perPx: map units under one CSS px. */
const ZOOMS = [{ boost: 1, perPx: 1 / 0.667 }, { boost: 1.75, perPx: 1 / 0.381 }] as const;
test('the zoom the twin uses is the map\'s own rule', () => { for (const z of ZOOMS) assert.ok(Math.abs(circBoostOf(1 / z.perPx) - z.boost) < 5e-3, `boost ${z.boost}`); });

// ---- 1. depth ----
test('every line of the plate has a depth of its own, no two tie, and every branch stands in front of the tube it leaves and the tube it reaches', () => {
  const order = mapOrder(), ids = new Set(order);
  assert.equal(ids.size, order.length, 'no id twice');
  assert.equal(order.length, 1 + MAPPED.length + trees.length, 'the caudate lane, the network and the 24 branches');
  assert.equal(new Set(order.map(mapDepthOfTube)).size, order.length, 'no two lines tie');
  for (let i = 1; i < order.length; i++) assert.ok(mapDepthOfTube(order[i]!) - mapDepthOfTube(order[i - 1]!) >= MAP_DEPTH_STEP - 1e-12, 'at least one step apart');
  for (const t of trees) {
    const s = treeHost(t.lane, t.i)!, e = treeEndHost(t.lane, t.i);
    assert.ok(mapDepthOf(t.id) > mapDepthOf(s.host), `${t.id} is in front of the tube it leaves (${s.host})`);
    if (e) assert.ok(mapDepthOf(t.id) > mapDepthOf(e.host), `${t.id} is in front of the tube it reaches (${e.host})`);
  }
  // downstream over upstream: a sinusoid branch is in front of the venule it runs on from
  for (const t of trees.filter((q) => q.lane.startsWith('SIN_'))) { const h = treeHost(t.lane, t.i)!; assert.ok(h.runOn && h.host.startsWith('PRE_') && mapDepthOf(t.id) > mapDepthOf(h.host), t.id); }
  // the network keeps its own order: the lines it had are still in the order they were (the caudate lane stays at the back, where it was)
  const network = MAPPED.map((v) => v.id).sort((a, b) => mapDepthOf(a) - mapDepthOf(b));
  assert.deepEqual(network, order.filter((id) => !id.includes('#') && id !== 'CAUD'));
  assert.equal(mapDepthOf('CAUD'), 0, 'the caudate lane stays behind the plate, as it was');
  assert.ok(Math.max(...order.map(mapDepthOf)) < 0.02, 'the whole stack is under 0.02 scene units: about a pixel of parallax at the map\'s edge');
});

test('one depth step is more than one step of a 24-bit depth buffer at every shot of the Circuit (the numbers are printed: the phone, standing the map up, is the farthest)', () => {
  // depth buffer window depth w = 0.5 + 0.5 ndc; a line m in front (vessels/shaders.ts) moves it by m * far * near / ((far - near) * d^2); near 0.02 r, far 120 r (camera/rig.ts), d about r
  const tan = Math.tan((FOV * Math.PI) / 360), half = [(1330 * MAP_K) / 2, (730 * MAP_K) / 2];
  const dist: Record<string, number> = { 'Mac (wide, 1.6:1)': Math.max(half[0]! / (tan * 1.6), half[1]! / tan), 'iPad (wide, 1.33:1)': Math.max(half[0]! / (tan * 1.33), half[1]! / tan), 'iPhone portrait (upright, 0.46:1)': Math.max(half[1]! / (tan * 0.46), half[0]! / tan) };
  const rows: string[] = [];
  for (const [name, r] of Object.entries(dist)) {
    const near = 0.02 * r, far = 120 * r, units = (MAP_DEPTH_STEP * far * near / ((far - near) * r * r)) * 2 ** 24;
    rows.push(`${name}: camera distance ${r.toFixed(1)}, one step = ${units.toFixed(2)} depth units`);
    assert.ok(units > 1, `${name}: a step of ${units.toFixed(2)} depth units still tells two lines apart`);
  }
  console.log(`[circuit-tree-joins] one MAP_DEPTH_STEP in a 24-bit depth buffer:\n  ${rows.join('\n  ')}`);
});

// ---- 2. no ink inside the union ----
const px = (z: { perPx: number }): number => z.perPx;
const inkOf = (rMap: number, z: { perPx: number }): number => CIRC_INK_K * inkWidthCss(rMap / z.perPx) * z.perPx;   // map units
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Frag = { t: Tube; kind: 'fill' | 'ink'; weight: number };
/** The fragment stage's decision at map point (x, y) for every tube covering it: the lumen is its fill, the band past it its line, the line dropped where the pixel lies inside the host's lumen (shaders.ts nbrK, DROP(12)), and the line's weight is held back by 1 - nbrK. */
function fragments(tubes: Tube[], x: number, y: number, z: (typeof ZOOMS)[number], union: boolean): Frag[] {
  const out: Frag[] = [];
  const sp = [mapToScene(x, y)[0], mapToScene(x, y)[1]] as const;
  for (const t of tubes) {
    const r = hostRadiusNow(t.w, z.boost, z.perPx) / MAP_K, ink = inkOf(r, z), reach = r + ink;
    if (x < t.box[0] - reach || x > t.box[2] + reach || y < t.box[1] - reach || y > t.box[3] + reach) continue;
    const d = dist(t, x, y);
    if (d >= reach) continue;
    if (d < r) { out.push({ t, kind: 'fill', weight: 1 }); continue; }
    let nbrK = 0;
    if (union && t.tree) {
      const axes = treeNbrAxes(t.tree.lane, t.tree.i).slice(0, NBR_HOSTS);
      const pxScene = z.perPx * MAP_K;   // one CSS px in scene units (dpr 1)
      let depth = -Infinity;   // how far inside the deeper tube's lumen, scene units (shaders.ts: the vertex stage's ms)
      for (const a of axes) { const m = nbrAgainst(a, sp[0], sp[1]); if (!m.past) depth = Math.max(depth, hostRadiusNow(a.w, z.boost, z.perPx) - m.dist); }
      if (depth > -Infinity) nbrK = smooth(-0.5, 0.5, depth / pxScene);
    }
    if (nbrK > 0.5) continue;   // DROP(12)
    out.push({ t, kind: 'ink', weight: 1 - nbrK });
  }
  return out;
}
/** What the front-most fragment is; with `tied` (the 22 Nov plate: every branch at one depth) every fragment of the top depth counts as a possible winner. */
function winners(frags: Frag[], tied: boolean): Frag[] {
  if (!frags.length) return [];
  const depthOf = (f: Frag): number => (tied && f.t.tree ? 0 : f.t.depth), top = Math.max(...frags.map(depthOf));
  return frags.filter((f) => depthOf(f) === top);
}
/** The places the twin looks: every fork, rejoining and run-on of each of the four lanes. */
function windows(): { x0: number; x1: number; y0: number; y1: number }[] {
  const out: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const y of [[262, 342], [346, 426]] as const) for (const x of [[684, 760], [794, 806], [834, 902]] as const) out.push({ x0: x[0], x1: x[1], y0: y[0], y1: y[1] });
  return out;
}
function sweep(union: boolean, tied: boolean): { ink: number; other: number; gap: number; samples: number; where: string[] } {
  const tubes = tubesOf(), byId = new Map(tubes.map((t) => [t.id, t]));
  let ink = 0, other = 0, gap = 0, samples = 0;
  const where = new Set<string>(), detail: string[] = [];
  for (const z of ZOOMS) for (const w of windows()) for (let x = w.x0; x <= w.x1; x += 0.25) for (let y = w.y0; y <= w.y1; y += 0.25) {
    // (erode by half a pixel: the lumen's own antialiasing is not ink)
    const lumenOf = (t: Tube): number => dist(t, x, y) - hostRadiusNow(t.w, z.boost, z.perPx) / MAP_K;
    const near = tubes.filter((t) => { const r = hostRadiusNow(t.w, z.boost, z.perPx) / MAP_K + 6; return x >= t.box[0] - r && x <= t.box[2] + r && y >= t.box[1] - r && y <= t.box[3] + r; });
    const inside = near.filter((t) => lumenOf(t) < -0.5 * z.perPx);
    const frags = fragments(tubes, x, y, z, union), win = winners(frags, tied);
    samples++;
    // the union rule is for the tubes that form one: where the winning line lies inside the lumen of a tube it forms a union with (the one it leaves, reaches, runs on from, or shares a crotch with, or one that leaves or reaches it), it is a fault
    for (const f of win) {
      if (f.kind !== 'ink') continue;
      if ([...f.t.related].some((id) => byId.has(id) && inside.includes(byId.get(id)!))) { ink++; where.add(`${f.t.id} ${Math.round(x)},${Math.round(y)}`); if (union && detail.length < 6 && ink % 997 === 1) detail.push(`z${z.boost} (${x},${y}): ${frags.map((q) => `${q.t.id}:${q.kind}`).join(' ')} -> ${win.map((q) => q.t.id).join(',')}`); }
      else if (inside.length) other++;   // (a tube that merely lies near another: a branch on a lane it is not part of, at the widest zoom; two separate lines, not a union)
    }
    // the union's outline band: not inside any lumen, within half the line of one, and nothing draws there
    const band = Math.min(...near.map((t) => { const r = hostRadiusNow(t.w, z.boost, z.perPx) / MAP_K; return dist(t, x, y) - r - 0.5 * inkOf(r, z); }), Infinity);
    if (!inside.length && band < 0 && !frags.length) { gap++; where.add(`gap ${Math.round(x)},${Math.round(y)}`); }
  }
  if (detail.length) console.log(detail.join('\n'));
  return { ink, other, gap, samples, where: [...where].slice(0, 12) };
}

test('no ink inside any lumen and no gap in the union\'s outline at any fork, rejoining or run-on (the 22 Nov plate, with every branch at one depth and no union rule, has ink inside)', () => {
  const before = sweep(false, true), after = sweep(true, false);
  console.log(`[circuit-tree-joins] ${after.samples} samples at 0.25 map units, boost 1 and 1.75:\n  22 Nov (tied depths, no union rule): ${before.ink} ink samples inside a lumen of a tube it forms a union with, ${before.gap} gaps\n  now: ${after.ink}, ${after.gap} gaps${after.where.length ? ` at ${after.where.join(' | ')}` : ''}\n  (unrelated tubes' lines over one another, two separate lines, not changed here: ${after.other}; 22 Nov ${before.other})`);
  assert.ok(before.ink > 0, 'the old plate is caught by this test (ink inside a lumen at the forks)');
  assert.equal(after.ink, 0, `ink inside a lumen at: ${after.where.join(' | ')}`);
  assert.equal(after.gap, 0, `a gap in the outline at: ${after.where.join(' | ')}`);
});

// ---- 3. smooth seams ----
test('a portal venule\'s tip and the sinusoid branch that runs on from it agree in radius and heading at x = 800, and a sunk end is no wider than its host', () => {
  let runs = 0, sunk = 0;
  for (const t of trees.filter((q) => q.lane.startsWith('SIN_'))) {
    const h = treeHost(t.lane, t.i)!, [pl, pi] = h.host.split('#') as [string, string];
    assert.ok(h.runOn && h.dist < 1e-6, `${t.id} starts at the tip of ${h.host}`);
    assert.ok(Math.abs(treeOwn(t.lane, t.i) - treeOwn(pl, Number(pi))) < 1e-6, `${t.id}: the two radii agree (${treeOwn(t.lane, t.i)} against ${treeOwn(pl, Number(pi))})`);
    const a = courseOf(CIRCUIT_TREES[pl]![Number(pi)]!.d), b = courseOf(t.d), [ax, ay] = [a[a.length - 1]![0] - a[a.length - 2]![0], a[a.length - 1]![1] - a[a.length - 2]![1]], [bx, by] = [b[1]![0] - b[0]![0], b[1]![1] - b[0]![1]];
    assert.ok((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) >= 0.9999, `${t.id}: the headings agree`);
    runs++;
  }
  assert.equal(runs, 12);
  for (const t of trees) {
    const m = treeEnds(t.lane, t.i)!;
    for (const [k, host] of [[0, treeHost(t.lane, t.i)!], [1, treeEndHost(t.lane, t.i)]] as const) {
      const e = m.ends[k];
      if (!e || !host) { if (k === 1) assert.equal(host, null, `${t.id}: an end with a host is sunk in it`); continue; }
      if (e.sink && !e.flare) continue;   // (a run-on keeps its own width: the two are one width)
      const share = ringShare(m.ends, m.own, 100 * m.own, k), last = share * m.own;
      assert.ok(last <= host.r + 1e-9, `${t.id} end ${k}: ${last} is no wider than ${host.host} (${host.r})`);
      sunk++;
    }
  }
  // the 12 venule and fork starts, the 12 sinusoid ends
  assert.equal(sunk, 12 + 12);
  for (const t of trees.filter((q) => q.lane.startsWith('PRE_'))) assert.equal(treeEnds(t.lane, t.i)!.ends[1], null, `${t.id}: a venule's tip is free (the sinusoid branch carries on from it)`);
  for (const t of trees.filter((q) => q.lane.startsWith('SIN_'))) assert.ok(treeEnds(t.lane, t.i)!.ends[1]?.capped, `${t.id}: ends sunk in the tube it reaches`);
});

// ---- 4. which tubes each branch's outline is the union with ----
test('every branch lies against the tubes the map shows: the one it leaves (but not the one it carries on from), the one it reaches, and its siblings; never more than the two the vertex carries', () => {
  const expect: Record<string, string[]> = {};
  for (const t of trees) {
    const axes = treeNbrAxes(t.lane, t.i), s = treeHost(t.lane, t.i)!, e = treeEndHost(t.lane, t.i);
    assert.ok(axes.length >= 1 && axes.length <= NBR_HOSTS, `${t.id}: ${axes.length} tubes`);
    assert.equal(axes.some((a) => a.id === s.host), !s.runOn, `${t.id}: start host (a run-on has none)`);
    assert.equal(!!e && axes.some((a) => a.id === e.host), !!e, `${t.id}: end host`);
    // two slots, and a slot's width rule is the one of the tube it names
    const [w0, w1] = treeNbrWidths(t.lane, t.i);
    assert.deepEqual([...w0], [...axes[0]!.w]);
    assert.deepEqual([...w1], axes[1] ? [...axes[1].w] : [0, 0, 0, 0]);
    expect[t.id] = axes.map((a) => a.id);
  }
  assert.deepEqual(expect['PRE_R#0'], ['PRE_R', 'PRE_R#3'], 'the two branches that leave the lane at x 689.6 are each other\'s sibling');
  assert.deepEqual(expect['PRE_R#1'], ['PRE_R#0', 'PRE_R#2'], 'and the two that leave PRE_R#0 at 730.4');
  assert.deepEqual(expect['SIN_RR#1'], ['SIN_RR#0', 'SIN_RR#2'], 'the two that rejoin at 858 end in the branch they came from and meet each other');
  assert.deepEqual(expect['SIN_RR#0'], ['SIN_RR', 'SIN_RR#3'], 'the two that reach the central vein ring end in the lane');
});

test('the nbr attribute of a branch: unsigned distances against the two tubes, one row per vertex, and the geometry carries it with the widths the shader reads', () => {
  const t = new CircuitTubes(createShared(), createLensShared(), { streamTex: { value: null as never }, chainTex: { value: null as never }, routeTex: { value: null as never }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 }, dustP: { value: new Float32Array(52) } }, createCircuitShared(8));
  const objs = t.objects, ids = t.ids;
  for (let n = 0; n < ids.length; n++) {
    const e = ids[n]!, o = objs[n]!, u = o.toon.uniforms as Record<string, { value: unknown }>;
    if (e.kind !== 'tree') { assert.equal(u.nbrMap!.value, 0, `${e.id}: not a branch: no union rule on the map`); continue; }
    assert.equal(u.nbrMap!.value, 1, `${e.id}: the union rule on the map`);
    assert.equal(u.nbrOn!.value, 1, `${e.id}: the ink is not also held back by the arc-length bury`);
    assert.deepEqual([(u.bury!.value as { x: number; y: number }).x, (u.bury!.value as { x: number; y: number }).y], [0, 0], `${e.id}: no arc-length bury`);
    const [lane, i] = e.id.split('#') as [string, string], [w0, w1] = treeNbrWidths(lane, Number(i));
    assert.deepEqual((u.nbrW0!.value as { toArray(): number[] }).toArray(), [...w0]);
    assert.deepEqual((u.nbrW1!.value as { toArray(): number[] }).toArray(), [...w1]);
    const g = (o as unknown as { toonMesh: { geometry: import('three').BufferGeometry } }).toonMesh.geometry, nbr = g.getAttribute('nbr');
    assert.ok(nbr && nbr.itemSize === 3 && nbr.count === g.getAttribute('position').count, `${e.id}: nbr on every vertex`);
    let against = 0;
    for (let v = 0; v < nbr.count; v++) { assert.ok(nbr.getX(v) >= 0 && nbr.getY(v) >= 0, 'unsigned'); if (nbr.getX(v) < NBR_NONE) against++; }
    assert.ok(against > 0, `${e.id}: some vertex lies against its first tube`);
    const again = treeNbr(lane, Number(i), g.getAttribute('position').array)!;
    assert.deepEqual([...again.slice(0, 30)], [...(nbr.array as Float32Array).slice(0, 30)]);
  }
  t.dispose();
});

test('a lane\'s width rule here is the one the vessel object draws it with, and a branch\'s is its lane\'s times its share', () => {
  for (const l of LANES) { const v = NETWORK_BY_ID.get(l)!; assert.deepEqual([...laneCircW(v.widthKind, v.circFine ?? 1)], [...circuitWidth(v.widthKind, v.circFine ?? 1)], l); assert.ok(Math.abs(hostRadiusNow(hostCircW(l), 1, 0) - mapRadius(v)) < 1e-12, `${l}: the radius at boost 1 is the one the tube was built at`); }
  for (const t of trees) { const v = NETWORK_BY_ID.get(t.lane)!; assert.deepEqual([...hostCircW(t.id)], [...treeCircW(v.widthKind, v.baseD, v.circFine ?? 1, t.k)]); }
  void px;
});

// ---- 5. the shaders ----
test('the union rule\'s two gates read nbrMap, the vertex stage takes the two tubes\' live widths, and only a map-only tube turns it on', () => {
  assert.equal((VESSEL_FS.match(/mix\(1\.0 - circT, 1\.0, nbrMap\)/g) ?? []).length, 2, 'nbrK and nbrT');
  assert.doesNotMatch(VESSEL_FS, /nbrK = [^;]*\(1\.0 - circT\)/, 'nbrK is not switched off by the map any more');
  assert.match(VESSEL_FS, /uniform float nbrMap;/);
  assert.match(VESSEL_VS, /uniform float nbrMap;/);
  assert.match(VESSEL_VS, /if \(nbrMap > 0\.5\) \{\s+float r0 = nbrHostR\(nbrW0\), r1 = nbrHostR\(nbrW1\);/);
  assert.match(VESSEL_VS, /hw\.w \* circPerPx\) \* CIRC_MAPK/, 'circSwell\'s own rule');
  const sceneSrc = text('../src/scene/scene.ts'), objSrc = text('../src/scene/vessels/vessel-object.ts');
  assert.doesNotMatch(sceneSrc, /setNbrMap/, 'a network vessel never turns it on');
  assert.match(objSrc, /nbrMap: \{ value: 0 \}/, 'every vessel starts with it off');
  // the vessel program stays at its pinned 16 attributes: no attribute is added (the two distances ride in nbr.x and nbr.y)
  assert.doesNotMatch(VESSEL_VS, /attribute [a-z0-9]+ nbr[A-Z]/);
  assert.match(VESSEL_VS, /attribute vec3 nbr;/);
});
