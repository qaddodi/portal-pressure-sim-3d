// The caudate lobe and its short hepatic veins in the anatomy (organs/caudate.ts, vessels/caudate-veins.ts; 2D pin b3058ef3 anatomy.js CAUDATE). Mohammad, 21 Nov, slide 8 of Sites and causes
// (Budd-Chiari): "No real caudate lobe or veins from it at all": the callout pointed at empty liver. Root cause: the 3D app drew the 2D plate's caudate only as the Circuit's lane; the anatomy had no lobe mesh and the
// three short veins that CAUDATE draws were never built (network.ts NOT_DRAWN_FEEDERS). These pin the lobe's shape and place, the veins' course into the cava's wall, their fade and their cava rule, and the slide's calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUDATE_FRONT_Z, caudateGeometry, caudateScale } from '../src/scene/organs/caudate.ts';
import { x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';
import { anchorPoint } from '../src/scene/labels/figure-cards.ts';
import { AlwaysDepth, AlwaysStencilFunc, NotEqualStencilFunc, ReplaceStencilOp, Vector3 } from 'three';
import { PALETTES } from '../src/scene/palette.ts';
import { ORGAN_ANCHOR_2D } from '../src/scene/labels/figure2d.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { CAUDATE_HOST, CAUDATE_VEIN_ID, CAUDATE_WHEN } from '../src/scene/vessels/caudate-veins.ts';
import { cavaPieceOf, fadeOf, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, EMPTY_CALLS, organAnchor } from '../src/ui/deck/figure-calls.ts';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { ORGAN_STYLE, ORGAN_ORDER } from '../src/scene/organs/layer.ts';
import { PLACED_CAUDATE, PLACED_COURSES } from '../src/scene/anatomy/placement.generated.ts';

test('the lobe is a closed egg about PLACED_CAUDATE, its front facing the viewer', () => {
  const g = caudateGeometry(), pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.index!;
  // closed: every edge is shared by exactly two triangles
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) { const u = idx.getX(t + a), v = idx.getX(t + b), k = u < v ? `${u}|${v}` : `${v}|${u}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  assert.ok([...edges.values()].every((n) => n === 2), 'a closed surface');
  {   // (placed path: the lobe is the approved mock's egg about PLACED_CAUDATE, not 2D's outline; organs-placed.test.ts pins its shape)
    const { c, ax } = PLACED_CAUDATE;
    let front = 0;
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Math.abs(pos.getX(i) - c[0]) < 1.2 * ax[0] && Math.abs(pos.getY(i) - c[1]) <= ax[1] + 1e-6 && Math.abs(pos.getZ(i) - c[2]) < 1.2 * ax[2], `vertex ${i} is on the egg`);
      if (pos.getZ(i) > c[2] + 0.5 * ax[2]) front += nor.getZ(i) > 0 ? 1 : -1;
    }
    assert.ok(front > 0, 'its front faces the viewer');
  }
});

test('the callout\'s anchor lies inside the lobe (it points at the real lobe)', () => {
  const a = organAnchor('caudate') as { at2d: readonly [number, number] }, [x, y] = a.at2d;
  assert.ok(((x3(x) - PLACED_CAUDATE.c[0]) / PLACED_CAUDATE.ax[0]) ** 2 + ((y3(y) - PLACED_CAUDATE.c[1]) / PLACED_CAUDATE.ax[1]) ** 2 < 1, `anchor (${x}, ${y}) is inside the egg seen from the front`);
});

test('growth: the lobe enlarges as 2D does, taller than wide, never shrinks', () => {
  assert.deepEqual(caudateScale(0), [1, 1]);
  const [sx, sy] = caudateScale(1);
  assert.ok(sx > 1 && sy > sx);
});

test('the three short veins: in the network as one group on the cava, from inside the lobe to the cava\'s wall, patent whatever the hepatic veins do', () => {
  const v = NETWORK_BY_ID.get(CAUDATE_VEIN_ID)!;
  assert.ok(v && v.feeder?.host === CAUDATE_HOST && v.feeder.when === CAUDATE_WHEN && v.plan?.kind === 'feeder');
  assert.equal(v.plan!.kind === 'feeder' && v.plan.list.length, 3, 'one course a vein (the approved cv1 to cv3)');
  // (placed path: the cava is the approved IVC course, PLACED_COURSES.ivc, read in 2D units)
  const ivc2 = (PLACED_COURSES.ivc ?? []).map((q) => [x2d(q[0]!), y2d(q[1]!)] as [number, number]), axisOf = ivc2;
  const axisX = (y: number) => axisOf.reduce((b, q) => (Math.abs(q[1] - y) < Math.abs(b[1] - y) ? q : b))[0];
  if (v.plan!.kind !== 'feeder') return;
  for (const f of v.plan!.list) {
    const a = f.pts[0]!, b = f.pts[f.pts.length - 1]!;
    // (placed path: the lobe is the approved egg, PLACED_CAUDATE, and the veins are the approved cv1 to cv3: each starts inside the egg seen from the front)
    const inLobe = ((x3(a[0]) - PLACED_CAUDATE.c[0]) / PLACED_CAUDATE.ax[0]) ** 2 + ((y3(a[1]) - PLACED_CAUDATE.c[1]) / PLACED_CAUDATE.ax[1]) ** 2 < 1;
    assert.ok(inLobe, `a vein starts inside the lobe (${a[0].toFixed(1)}, ${a[1].toFixed(1)})`);
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

test('the lobe is an organ of the layer, drawn before the liver, and a pin never outlines it', () => {
  assert.ok('caudate' in ORGAN_STYLE);
  // (placed path: the egg lies on the liver's back and is drawn BEFORE the liver, whose wash lies over it, as the approved mock sorts it)
  assert.ok(ORGAN_ORDER.indexOf('caudate') < ORGAN_ORDER.indexOf('liver'));
});

test('slide 8 of Sites and causes (Budd-Chiari "dx") asks for the lobe with its veins; an empty slide asks for neither', async () => {
  const deck = (await loadAgDeck('budd-chiari')) as unknown as CopiedDeck, s = deck.slides.find((x) => x.id === 'dx')!;
  const c = figureCalls(figurePlan(s));
  assert.equal(c.caudate, true); assert.equal(c.caudateVeins, true);
  assert.ok(!c.pins.includes('caudate'), 'the lobe is shown, not outlined with a pin glow');
  assert.equal(EMPTY_CALLS.caudate, false); assert.equal(EMPTY_CALLS.caudateVeins, false);
});

// ---- the lobe's depth (Mohammad, 23 Nov, Budd-Chiari, Anatomy: "The caudate lobe is displayed way behind the liver and not connected to its veins"). Root cause: the lobe was built on the liver's FRONT face
// (scene z 0.28) while its veins and the cava are on the back tier (-0.02), so every turn of the view slid it sideways off the cava by 0.30 sin(turn). It now lies at the cava's depth and is drawn over the liver. ----

test('the lobe lies at the cava\'s depth, the same as its three veins', () => {
  {   // (placed path: the egg sits just left of the IVC, which lies in its groove, at the cava's depth, and its three short veins start in it: the approved data's own numbers)
    const { c, ax } = PLACED_CAUDATE, ivc = PLACED_COURSES.ivc!, at = ivc.reduce((b, q) => (Math.abs(q[1] - c[1]) < Math.abs(b[1] - c[1]) ? q : b));
    assert.ok(Math.abs(at[2] - c[2]) < 0.01, `the egg's middle is on the cava's plane (${at[2]} against ${c[2]})`);
    assert.ok(c[0] > at[0] && c[0] - ax[0] - at[0] < 0.03, 'just left of the cava, against it');
    for (const k of ['cv1', 'cv2', 'cv3']) { const v = PLACED_COURSES[k]!, s = v[0]!; assert.ok(((s[0] - c[0]) / ax[0]) ** 2 + ((s[1] - c[1]) / ax[1]) ** 2 + ((s[2] - c[2]) / ax[2]) ** 2 < 1, `${k} starts inside the lobe`); }
  }
});


test('the lobe on the liver\'s back is depth-tested and drawn before the liver; its fill marks stencil bit 4 and its ink draws only where the fill is not', async () => {
  const { OrganLayer } = await import('../src/scene/organs/layer.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { ORGAN_MESHES, setOrganData } = await import('../src/scene/organs/meshes.ts');
  const { readFileSync } = await import('node:fs');
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const layer = new OrganLayer(createShared(), ORGAN_MESHES);
  layer.applyLook(PALETTES.light);
  const c = layer.byId.get('caudate')!, l = layer.byId.get('liver')!;
  // (placed path: the egg on the liver's back is depth-tested like every organ and drawn before the liver; its fill still marks bit 4 and its ink draws only where the fill is not)
  assert.notEqual(c.toon.depthFunc, AlwaysDepth);
  assert.ok(c.toon.stencilWrite && c.toon.stencilWriteMask === 4 && c.toon.stencilRef === 4 && c.toon.stencilFunc === AlwaysStencilFunc && c.toon.stencilZPass === ReplaceStencilOp, 'the fill marks bit 4');
  assert.ok(c.ink.stencilWrite && c.ink.stencilWriteMask === 0 && c.ink.stencilFuncMask === 4 && c.ink.stencilFunc === NotEqualStencilFunc, 'the ink draws where bit 4 is not set');
  assert.ok(c.toonMesh.renderOrder < l.toonMesh.renderOrder, 'drawn before the liver');
});

test('a mark or step on the lobe sits on its dome, not at the organ plane in front of it; every other organ keeps its place', async () => {
  const deck = (await loadAgDeck('budd-chiari')) as unknown as CopiedDeck, s = deck.slides.find((x) => x.id === 'dx')!;
  const cards = figureCalls(figurePlan(s)).cards, out = new Vector3(), lobe = organAnchor('caudate') as { at2d: readonly [number, number] };
  const on = cards.filter((k) => 'at2d' in k.anchor && k.anchor.at2d[0] === lobe.at2d[0] && k.anchor.at2d[1] === lobe.at2d[1]);
  assert.ok(on.length > 0, 'the slide has a card on the lobe');
  for (const k of on) { assert.equal((k.anchor as { z?: number }).z, CAUDATE_FRONT_Z); assert.equal(anchorPoint(k.anchor, out)!.z, CAUDATE_FRONT_Z); }
  assert.ok(Math.abs(CAUDATE_FRONT_Z - (PLACED_CAUDATE.c[2] + PLACED_CAUDATE.ax[2])) < 0.003, 'placed path: the egg\'s front');   // (the egg's own front pole)
  assert.equal(anchorPoint({ at2d: ORGAN_ANCHOR_2D.liver!.at }, out)!.z, 0.26, 'a liver mark keeps the organ plane');
});
