// Every change of calibre on the Circuit's map is ONE smooth taper through the node, over a fixed run of the map (Mohammad, 20 Nov: "why is this not smooth tapering?": the right portal vein had a short angled step at its node, the
// left a square shoulder, and a flow head was cut at the seam before the left node). Root causes pinned here:
//   1. the ease was a share (30 %) of each vessel's own length, each side ending flat at the node: a 6 unit step on a short stretch, a 36 unit taper on a long one, a plateau between;
//   2. the pair was the body's (no node with a collateral or a shunt on it, no end a junction skin had taken): the left portal node had no ease at all;
//   3. the heads' and the dust's arcs used the body's lengths on the map, so a lattice did not continue across a seam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { CIRCUIT_MATES, CIRC_EASE, EASE_SHARE, easeOf, flowLenAt, mapLen, taperWidth } from '../src/scene/circuit/mates.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { readFileSync } from 'node:fs';

const widthOf = (id: string, boost = 1): number => { const v = NETWORK_BY_ID.get(id)!; return circuitWidthMap(v.widthKind, v.baseD, boost, v.circFine ?? 1); };

test('the taper is one smoothstep through the node: the mean at the node, each width at its own end, slope never reversing', () => {
  const e = 12, a = 12, b = 8;
  assert.equal(taperWidth(a, b, e, e), a);
  assert.equal(taperWidth(a, b, -e, e), b);
  assert.ok(Math.abs(taperWidth(a, b, 0, e) - 10) < 1e-12);
  // the two sides of a node meet: this vessel at distance s in, its mate at distance s in on its side, are the two halves of one curve
  for (const s of [0, 1, 4, 9, 12, 30]) assert.ok(Math.abs(taperWidth(a, b, s, e) - taperWidth(b, a, -s, e)) < 1e-12);
  let prev = taperWidth(a, b, -e, e);
  for (let s = -e; s <= e; s += 0.25) { const w = taperWidth(a, b, s, e); assert.ok(w >= prev - 1e-12, `monotone at ${s}`); prev = w; }
});

test('the taper does not depend on how long the two vessels are: 12 map units each way wherever the vessels are long enough (the old ease was a share of each length)', () => {
  const long = [...CIRCUIT_MATES].flatMap(([id, m]) => m.map((x, end) => ({ id, end, x }))).filter((r) => r.x && mapLen(r.id) >= 2 * CIRC_EASE && mapLen(r.x.id) >= 2 * CIRC_EASE);
  assert.ok(long.length > 20);
  for (const r of long) assert.equal(r.x!.ease, CIRC_EASE, `${r.id} end ${r.end}`);
});

test('a short stretch gives the taper no more than EASE_SHARE of itself, the same number on both sides of the pair', () => {
  for (const [id, m] of CIRCUIT_MATES) for (const x of m) {
    if (!x) continue;
    assert.ok(x.ease > 0 && x.ease <= CIRC_EASE + 1e-9);
    assert.ok(x.ease <= EASE_SHARE * mapLen(id) + 1e-6, `${id}: a taper is at most ${EASE_SHARE} of it`);
    assert.equal(x.ease, easeOf(id, x.id));
  }
});

test('pairs are mutual: if a vessel carries on into another at a node, that one carries on into it at the same node', () => {
  for (const [id, m] of CIRCUIT_MATES) for (const end of [0, 1] as const) {
    const x = m[end]; if (!x) continue;
    const node = end ? NETWORK_BY_ID.get(id)!.to : NETWORK_BY_ID.get(id)!.from, w = NETWORK_BY_ID.get(x.id)!;
    const back = CIRCUIT_MATES.get(x.id)![w.from === node ? 0 : 1];
    assert.equal(back?.id, id, `${id} -> ${x.id}`);
  }
});

test('the portal veins: the right node and the left node (a collateral and a shunt hang on it) both taper from the vein to its bed', () => {
  const R = CIRCUIT_MATES.get('PVH_R_2')![1], L = CIRCUIT_MATES.get('PVH_L_1')![1];
  assert.equal(R?.id, 'PRE_R');
  assert.equal(L?.id, 'PRE_L', 'the left portal node had no pair: its calibre changed with a square shoulder');
  assert.equal(CIRCUIT_MATES.get('PRE_L')![0]?.id, 'PVH_L_1');
  for (const [v, bed] of [['PVH_R_2', 'PRE_R'], ['PVH_L_1', 'PRE_L']] as const) {
    assert.ok(widthOf(v) > widthOf(bed), `${v} is wider than ${bed}`);
    const e = easeOf(v, bed);
    // within a node's dot (4.5 units) the width is still far from either end's own: the change is not hidden under the dot
    assert.ok(taperWidth(widthOf(v), widthOf(bed), 4.5, e) < widthOf(v) - 0.2 * (widthOf(v) - widthOf(bed)));
    assert.ok(taperWidth(widthOf(v), widthOf(bed), -4.5, e) > widthOf(bed) + 0.2 * (widthOf(v) - widthOf(bed)));
  }
});

test('every node where exactly two permanent vessels of one kind meet is a pair, whatever hangs on it and whether or not a skin took it', () => {
  const kinds = new Set(['vein', 'artery', 'arteriole', 'liver']);
  const at = new Map<string, { id: string; end: 0 | 1 }[]>();
  for (const v of NETWORK) {
    if (v.feeder || v.id.includes('~F') || !kinds.has(v.kind) || !mapLen(v.id)) continue;
    for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) { const k = `${n}|${v.tone === 'artery' ? 1 : 0}`; (at.get(k) ?? at.set(k, []).get(k)!).push({ id: v.id, end }); }
  }
  let two = 0;
  for (const l of at.values()) if (l.length === 2) { two++; assert.ok(CIRCUIT_MATES.get(l[0]!.id)?.[l[0]!.end], `${l[0]!.id} end ${l[0]!.end}`); }
  assert.ok(two > 10);
});

test('the shader joins the widths by the map\'s own distance (the course\'s length in map units), never by a share of the vessel', () => {
  assert.match(VESSEL_VS, /float circAt = uv\.x \* cl\.y \/ CIRC_MAPK;/);
  assert.match(VESSEL_VS, /float circTo = \(1\.0 - uv\.x\) \* cl\.y \/ CIRC_MAPK;/);
  assert.doesNotMatch(VESSEL_VS, /float k0 = 1\.0 - smoothstep\(0\.0, 0\.3, uv\.x\); if \(k0 > 0\.0\) wc/, 'no share-of-length ease on the map');
  assert.match(VESSEL_VS, /uniform vec3 cmate0;/);
  assert.match(VESSEL_VS, /uniform vec2 cease;/);
});

test('the scene gives every vessel with a pair its map mates once, not through the joins switch (a skin may take an end of the body, never of the map)', () => {
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /o\.setCircuitMates\(mateUniform\(cm\[0\]\), mateUniform\(cm\[1\]\)/);
  const apply = sc.slice(sc.indexOf('private applyMates'), sc.indexOf('private applyMates') + 400);
  assert.doesNotMatch(apply, /setCircuitMates/);
});

test('the flow marks run over the lengths the vessels are drawn at: the body\'s at 0, the map\'s (map units) at 1, so a head lands across a seam', () => {
  assert.equal(flowLenAt('PVH_L', 123, 0), 123);
  assert.ok(Math.abs(flowLenAt('PVH_L', 123, 1) - mapLen('PVH_L')) < 1e-9);
  const mid = flowLenAt('PVH_L', 123, 0.5);
  assert.ok(Math.abs(mid - (123 + mapLen('PVH_L')) / 2) < 1e-9);
  assert.equal(flowLenAt('NO_SUCH_VESSEL', 55, 1), 55, 'a vessel with no map course keeps its own length');
  const chain = readFileSync(new URL('../src/scene/blood/chain.ts', import.meta.url), 'utf8'), routes = readFileSync(new URL('../src/scene/blood/routes.ts', import.meta.url), 'utf8');
  assert.match(chain, /flowLenAt\(inf\.id, inf\.len, view\)/);
  assert.match(routes, /flowLenAt\(inf\.id, inf\.len, view\)/);
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /this\.flow\.carriesHeads\(id\), this\.circuit\.t\)/);
});
