// The caudate lobe and its short hepatic veins in the anatomy (organs/caudate.ts, vessels/caudate-veins.ts; 2D pin b3058ef3 anatomy.js CAUDATE). Mohammad, 21 Nov, slide 8 of Sites and causes
// (Budd-Chiari): "No real caudate lobe or veins from it at all": the callout pointed at empty liver. Root cause: the 3D app drew the 2D plate's caudate only as the Circuit's lane; the anatomy had no lobe mesh and the
// three short veins that CAUDATE draws were never built (network.ts NOT_DRAWN_FEEDERS). These pin the lobe's shape and place, the veins' course into the cava's wall, their fade and their cava rule, and the slide's calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUDATE_OUTLINE, CAUDATE_VEINS, LOBE_RISE, LOBE_Z, caudateGeometry, caudateScale, flattenPath } from '../src/scene/organs/caudate.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { ORGAN_ANCHOR_2D } from '../src/scene/labels/figure2d.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { CAUDATE_HOST, CAUDATE_VEIN_ID, CAUDATE_WHEN } from '../src/scene/vessels/caudate-veins.ts';
import { cavaPieceOf, fadeOf, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, EMPTY_CALLS } from '../src/ui/deck/figure-calls.ts';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { ORGAN_STYLE, ORGAN_ORDER } from '../src/scene/organs/layer.ts';

const inside = (poly: readonly (readonly [number, number])[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};

test('the lobe is a closed pillow of 2D\'s outline, its rim on the liver\'s face and its dome in front of it', () => {
  const g = caudateGeometry(), pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.index!;
  // closed: every edge is shared by exactly two triangles
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) { const u = idx.getX(t + a), v = idx.getX(t + b), k = u < v ? `${u}|${v}` : `${v}|${u}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  assert.ok([...edges.values()].every((n) => n === 2), 'a closed surface');
  const poly = flattenPath(CAUDATE_OUTLINE);
  let zmax = -Infinity, front = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = x2d(pos.getX(i)), y = y2d(pos.getY(i)), z = pos.getZ(i);
    assert.ok(x > 571 && x < 616 && y > 297 && y < 421, `vertex ${i} at (${x.toFixed(1)}, ${y.toFixed(1)}) is on the plate's outline box`);
    zmax = Math.max(zmax, z);
    if (z > LOBE_Z + 0.5 * LOBE_RISE) front += nor.getZ(i) > 0 ? 1 : -1;
  }
  assert.ok(Math.abs(zmax - (LOBE_Z + LOBE_RISE)) < 1e-6, 'the dome peaks LOBE_RISE above its mid-plane');
  assert.ok(front > 0, 'the top of the dome faces the viewer');
  assert.ok(inside(poly, 594, 358) && !inside(poly, 560, 358), 'the outline is the lobe beside the cava');
});

test('the callout\'s anchor lies inside the lobe (it points at the real lobe)', () => {
  const [x, y] = ORGAN_ANCHOR_2D.caudate!.at;
  assert.ok(inside(flattenPath(CAUDATE_OUTLINE), x, y), `anchor (${x}, ${y}) is inside the outline`);
});

test('growth: the lobe enlarges as 2D does, taller than wide, never shrinks', () => {
  assert.deepEqual(caudateScale(0), [1, 1]);
  const [sx, sy] = caudateScale(1);
  assert.ok(sx > 1 && sy > sx);
});

test('the three short veins: in the network as one group on the cava, from inside the lobe to the cava\'s wall, patent whatever the hepatic veins do', () => {
  const v = NETWORK_BY_ID.get(CAUDATE_VEIN_ID)!;
  assert.ok(v && v.feeder?.host === CAUDATE_HOST && v.feeder.when === CAUDATE_WHEN && v.plan?.kind === 'feeder');
  assert.equal(v.plan!.kind === 'feeder' && v.plan.list.length, CAUDATE_VEINS.length, 'one course a vein');
  const cava = EDGE_PATH_2D[CAUDATE_HOST]!, poly = flattenPath(CAUDATE_OUTLINE);
  const axisX = (y: number) => cava.reduce((b, q) => (Math.abs(q[1] - y) < Math.abs(b[1] - y) ? q : b))[0];
  if (v.plan!.kind !== 'feeder') return;
  for (const f of v.plan!.list) {
    const a = f.pts[0]!, b = f.pts[f.pts.length - 1]!;
    assert.ok(inside(poly, a[0], a[1]), `a vein starts inside the lobe (${a[0].toFixed(1)}, ${a[1].toFixed(1)})`);
    assert.ok(Math.abs(b[0] - axisX(b[1])) < 1.5, `and ends on the cava's axis (${b[0].toFixed(1)} against ${axisX(b[1]).toFixed(1)})`);
    assert.equal(f.join, 1, 'the end at the cava is the join: no round cap');
    assert.equal(f.out, false, 'it flows into the cava');
  }
});

test('the veins open into the cava by the hepatic veins\' rule and rise out of the lobe\'s tissue', () => {
  assert.equal(opensIntoCava(CAUDATE_VEIN_ID), true);
  assert.equal(cavaPieceOf(CAUDATE_VEIN_ID), CAUDATE_HOST);
  const f = fadeOf(CAUDATE_VEIN_ID, false, CAUDATE_HOST)!;
  assert.ok(f.mode === 1 && f.a0 === 0 && f.a1 === 1 && f.from === 0, 'faint at the lobe end, whole by the middle');
});

test('the lobe is an organ of the layer, drawn after the liver, and a pin never outlines it', () => {
  assert.ok('caudate' in ORGAN_STYLE);
  assert.ok(ORGAN_ORDER.indexOf('caudate') > ORGAN_ORDER.indexOf('liver'));
});

test('slide 8 of Sites and causes (Budd-Chiari "dx") asks for the lobe with its veins; an empty slide asks for neither', async () => {
  const deck = (await loadAgDeck('budd-chiari')) as unknown as CopiedDeck, s = deck.slides.find((x) => x.id === 'dx')!;
  const c = figureCalls(figurePlan(s));
  assert.equal(c.caudate, true); assert.equal(c.caudateVeins, true);
  assert.ok(!c.pins.includes('caudate'), 'the lobe is shown, not outlined with a pin glow');
  assert.equal(EMPTY_CALLS.caudate, false); assert.equal(EMPTY_CALLS.caudateVeins, false);
});
