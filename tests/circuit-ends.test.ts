// Every end of the map's own tubes (the liver's 24 branches, the caudate lane, the custom shunts) is sunk and flared as 2D draws it (circuit/map-ends.ts: sideEndScale / flareScale, the host's caliber), not butted
// against the vessel it leaves or reaches. A radius profile on the tube's own rings, so the rings keep their order and nothing can fold. Node only. Run: node --test tests/circuit-ends.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, type BufferGeometry } from 'three';
import { CIRCUIT_TREES, CUSTOM_EDGES, CIRCUIT_D } from '../src/scene/circuit/data.copied.ts';
import { CircuitTubes, caudEnds, customEnds, treeEnds, treeHost } from '../src/scene/circuit/tubes.ts';
import { END_SPAN, endShareAt, ringShare } from '../src/scene/circuit/map-ends.ts';
import { SHUNT_END_MIN } from '../src/scene/vessels/shunt-ends.ts';
import { FLARE_K } from '../src/scene/vessels/fork-joins.copied.js';
import { MAP_K } from '../src/scene/circuit/map.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { createLensShared } from '../src/scene/vessels/vessel-object.ts';
import { createCircuitShared } from '../src/scene/circuit/uniforms.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';

const tubes = () => new CircuitTubes(createShared(), createLensShared(), { streamTex: { value: null as never }, chainTex: { value: null as never }, routeTex: { value: null as never }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 }, dustP: { value: new Float32Array(52) } }, createCircuitShared(8));
const geometryOf = (o: unknown): BufferGeometry => (o as { toonMesh: { geometry: BufferGeometry } }).toonMesh.geometry;

/** The rings of a built tube: each ring's centre and mean radius, from its vertices (the tube's rings come first, TUBE_RADIAL + 1 vertices each, the first and last the same point). */
function rings(g: BufferGeometry): { c: Vector3; r: number; rk: number }[] {
  const pos = g.getAttribute('position'), rk = g.getAttribute('rk'), W = TUBE_RADIAL + 1, out: { c: Vector3; r: number; rk: number }[] = [];
  const total = pos.count;
  // (the two caps are SphereGeometry(14, 10): 11 * 15 vertices each)
  const capCount = 11 * 15, tubeCount = total - 2 * capCount, n = tubeCount / W;
  for (let i = 0; i < n; i++) {
    const c = new Vector3();
    for (let j = 0; j < TUBE_RADIAL; j++) c.add(new Vector3(pos.getX(i * W + j), pos.getY(i * W + j), pos.getZ(i * W + j)));
    c.multiplyScalar(1 / TUBE_RADIAL);
    let r = 0;
    for (let j = 0; j < TUBE_RADIAL; j++) r += c.distanceTo(new Vector3(pos.getX(i * W + j), pos.getY(i * W + j), pos.getZ(i * W + j)));
    out.push({ c, r: r / TUBE_RADIAL, rk: rk.getX(i * W) });
  }
  return out;
}

/** An end the way the body sews a generated one (shunt-ends.ts sewnEndAt): inside the host, closing in its wall (not a sink), flared and capped at the host's radius. */
const sewn = (e: { hostR: number; inside: boolean; sink: boolean; flare: boolean; capped?: true } | null): boolean => !!e && e.hostR > 0 && e.inside && !e.sink && e.flare && e.capped === true;

const trees = Object.entries(CIRCUIT_TREES).flatMap(([lane, list]) => list.map((_, i) => ({ lane, i, id: `${lane}#${i}` })));

test('every liver branch start, both caudate ends and both ends of every custom shunt have a sunk end (a host to sink in), the branch tips are free', () => {
  assert.equal(trees.length, 24);
  for (const t of trees) {
    const e = treeEnds(t.lane, t.i);
    assert.ok(e, `${t.id} has an end row`);
    const s = e!.ends[0];
    assert.ok(s && s.hostR > 0 && s.inside, `${t.id}: its start lies inside a host (${JSON.stringify(s)})`);
    assert.equal(e!.ends[1], null, `${t.id}: its tip is free in the bed`);
    const h = treeHost(t.lane, t.i)!;
    assert.ok(h.dist * MAP_K <= h.r, `${t.id}: its start lies inside ${h.host} (${h.dist.toFixed(2)} map units from its course, its radius ${(h.r / MAP_K).toFixed(2)})`);
  }
  const caud = caudEnds();
  assert.ok(CIRCUIT_D.CAUD && caud && caud.ends.every(sewn), 'the caudate lane is sewn at both ends');
  assert.equal(CUSTOM_EDGES.length, 119);
  for (const c of CUSTOM_EDGES) {
    const e = customEnds(c[0], 8);
    assert.ok(e && e.ends.every(sewn), `${c[0]}: sewn at both ends`);
  }
});

test('a start that carries on from the end of another branch is sunk in it at one width (no waist, no flare); every other end closes inside its host and flares no wider than it', () => {
  const runOns = trees.filter((t) => treeHost(t.lane, t.i)!.runOn).map((t) => t.id);
  assert.deepEqual(runOns, trees.filter((t) => t.lane.startsWith('SIN_')).map((t) => t.id), 'the sinusoid branches start at the tips of the portal venules');
  for (const t of trees) {
    const e = treeEnds(t.lane, t.i)!, x = e.ends[0]!;
    if (runOns.includes(t.id)) { assert.ok(x.sink && !x.flare, t.id); assert.equal(endShareAt(x, e.own, 0, 100), 1, `${t.id}: a run-on keeps the width`); }
    else assert.ok(sewn(x), t.id);
  }
});

test('no bulge: the end of every sewn end closes inside its host to 0.35 of its width (no round cap shows past the wall), and its flare never takes the tube wider than the host (or than itself)', () => {
  const all = [...trees.map((t) => ({ id: t.id, m: treeEnds(t.lane, t.i)! })), { id: 'CAUD', m: caudEnds()! }, ...CUSTOM_EDGES.map((c) => ({ id: c[0], m: customEnds(c[0], 8)! }))];
  let checked = 0;
  for (const { id, m } of all) {
    const len = 60 * Math.max(m.own, ...m.ends.map((e) => e?.hostR ?? 0));
    m.ends.forEach((e, k) => {
      if (!e || !e.capped) return;
      checked++;
      const narrow = Math.min(1, Math.max(SHUNT_END_MIN, e.hostR / m.own));
      assert.ok(endShareAt(e, m.own, 0, len) <= 0.35 * (1 + FLARE_K) * narrow + 1e-9, `${id} end ${k}: the end ring closes to 0.35 of its (host-narrowed) width (flared a little), ${endShareAt(e, m.own, 0, len)}`);
      for (let q = 0; q <= 200; q++) assert.ok(endShareAt(e, m.own, (q / 200) * 6 * e.hostR, len) * m.own <= Math.max(m.own, e.hostR) + 1e-9, `${id} end ${k}: the radius at ${q / 200 * 6} host radii stays within the host's or its own`);
    });
  }
  assert.equal(checked, 12 + 2 + 2 * 119, 'the 12 portal-venule starts, the caudate lane\'s two ends, the custom shunts\' 238 (the 12 sinusoid starts are run-ons)');
});

test('the profile along every end: never under 0.35 of SHUNT_END_MIN, never over 1 + FLARE_K, 1 in the middle', () => {
  const all = [...trees.map((t) => treeEnds(t.lane, t.i)!), caudEnds()!, ...CUSTOM_EDGES.map((c) => customEnds(c[0], 8)!)];
  for (const m of all) {
    const len = 60 * Math.max(m.own, ...m.ends.map((e) => e?.hostR ?? 0));
    let prev = ringShare(m.ends, m.own, len, 0);
    for (let k = 1; k <= 400; k++) {
      const u = k / 400, s = ringShare(m.ends, m.own, len, u);
      assert.ok(s >= 0.35 * SHUNT_END_MIN - 1e-9 && s <= 1 + 1e-9 + FLARE_K, `share ${s}`);
      prev = s;
    }
    assert.ok(Math.abs(ringShare(m.ends, m.own, len, 0.5) - 1) < 1e-9, 'the middle of the tube is its own');
  }
  assert.ok(END_SPAN > 0 && END_SPAN < 0.5);
});

test('the rings the tubes are built with: the first and last ring of a sunk end carry the profile, the rings keep their order (the radius changes slower than the rings are spaced), and the cap sinks with it', () => {
  const t = tubes();
  for (const e of t.ids.filter((x) => x.kind === 'tree' || x.kind === 'caud').map((x) => x.id)) {
    const i = t.ids.findIndex((x) => x.id === e), g = geometryOf(t.objects[i]!), rs = rings(g);
    assert.ok(rs.length > 8, e);
    const m = e === 'CAUD' ? caudEnds()! : (() => { const [lane, k] = e.split('#'); return treeEnds(lane!, Number(k))!; })();
    const first = ringShare(m.ends, m.own, 1, 0), last = ringShare(m.ends, m.own, 1, 1);
    assert.ok(Math.abs(rs[0]!.rk - first) < 1e-6 && Math.abs(rs[rs.length - 1]!.rk - last) < 1e-6, `${e}: the end rings carry the profile`);
    assert.ok(m.ends[0]!.sink ? rs[0]!.rk >= 1 - 1e-6 : rs[0]!.rk <= 0.35 * (1 + FLARE_K) + 1e-6, `${e}: a run-on start keeps its width, every other start closes inside the host (${rs[0]!.rk})`);
    assert.ok(Math.max(...rs.map((r) => r.rk)) * m.own <= Math.max(m.own, ...m.ends.map((x) => x?.hostR ?? 0)) + 1e-9, `${e}: no ring is wider than the host or the tube`);
    assert.ok(rs.every((r, k) => k === 0 || r.c.distanceTo(rs[k - 1]!.c) > 0), `${e}: the ring centres advance`);
    for (let k = 2; k < rs.length - 1; k++) assert.ok(Math.abs(rs[k]!.r - rs[k - 1]!.r) < rs[k]!.c.distanceTo(rs[k - 1]!.c), `${e}: ring ${k} does not cross ring ${k - 1} (radius step ${Math.abs(rs[k]!.r - rs[k - 1]!.r)} against ${rs[k]!.c.distanceTo(rs[k - 1]!.c)})`);
    const rkc = g.getAttribute('rkc'), rk = g.getAttribute('rk');
    for (let v = 0; v < rk.count; v += 7) assert.equal(rkc.getX(v), rk.getX(v), 'the map\'s radius share is the same profile');
  }
  t.dispose();
});

test('a custom shunt gets its rows when it is routed (pure numbers, no frame cost): its tube carries the profile at both ends', () => {
  const t = tubes(), id = CUSTOM_EDGES[0]![0];
  assert.deepEqual(t.routeOpen({ [id]: 8 }), [id]);
  const i = t.ids.findIndex((x) => x.id === id), rs = rings(geometryOf(t.objects[i]!)), m = customEnds(id, 8)!;
  assert.ok(Math.abs(rs[0]!.rk - ringShare(m.ends, m.own, 1, 0)) < 1e-6 && Math.abs(rs[rs.length - 1]!.rk - ringShare(m.ends, m.own, 1, 1)) < 1e-6);
  assert.ok(rs[0]!.rk <= 0.44 && rs[rs.length - 1]!.rk <= 0.44, 'both ends of a custom shunt close inside their hosts');
  t.dispose();
});

// The network's own collaterals, shunts and stents on the map: the ends no skin welds are sunk and flared (circuit/map-sewn.ts).
import { NETWORK } from '../src/scene/vessels/network.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { MAP_DROPPED, sewnEnds, weldedEnds } from '../src/scene/circuit/map-sewn.ts';
import { findCircuitJunctions } from '../src/scene/circuit/skins.ts';

test('every collateral, shunt and stent end on the map is welded by a skin or sunk and flared: none is left as a butt end', () => {
  const w = weldedEnds();
  let nSewn = 0;
  for (const v of NETWORK) {
    if (!COURSES.has(v.id) || v.feeder || !(v.kind === 'collateral' || v.kind === 'shunt')) { assert.equal(sewnEnds(v), null, v.id); continue; }
    const s = sewnEnds(v);
    for (const e of [0, 1] as const) {
      if (w.has(`${v.id}:${e}`)) { assert.ok(!s || s.ends[e] === null, `${v.id}:${e} is welded, not sewn`); continue; }
      const x = s?.ends[e];
      assert.ok(sewn(x ?? null), `${v.id}:${e} has neither a skin nor a sewn end`);
      if (x) { assert.ok(endShareAt(x, s!.own, 0, 1) <= 0.35 * (1 + FLARE_K) + 1e-9, `${v.id}:${e} closes inside its host`); }
      nSewn++;
    }
  }
  assert.ok(nSewn >= 19, `${nSewn} sewn ends`);
  // the refused arms are the ones the skins' build names (the table here and the build agree)
  const nodes = new Set(findCircuitJunctions().map((j) => j.node));
  for (const d of MAP_DROPPED) { const [node, vessel] = d.split(':'); assert.ok(nodes.has(node!), d); assert.ok(!w.has(`${vessel}:0`) || !w.has(`${vessel}:1`), `${d}: one end of ${vessel} is not welded`); }
});
