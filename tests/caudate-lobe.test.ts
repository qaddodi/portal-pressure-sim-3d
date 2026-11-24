// The caudate lobe and its short hepatic veins in the anatomy (organs/caudate.ts, vessels/caudate-veins.ts; 2D pin b3058ef3 anatomy.js CAUDATE). Mohammad, 21 Nov, slide 8 of Sites and causes
// (Budd-Chiari): "No real caudate lobe or veins from it at all": the callout pointed at empty liver. Root cause: the 3D app drew the 2D plate's caudate only as the Circuit's lane; the anatomy had no lobe mesh and the
// three short veins that CAUDATE draws were never built (network.ts NOT_DRAWN_FEEDERS). These pin the lobe's shape and place, the veins' course into the cava's wall, their fade and their cava rule, and the slide's calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUDATE_FRONT_Z, CAUDATE_OUTLINE, CAUDATE_VEINS, LOBE_RISE, LOBE_Z, caudateGeometry, caudateScale, flattenPath, CAUDATE_ANCHOR as CAUDATE_ANCHOR_2D } from '../src/scene/organs/caudate.ts';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { TIER_Z, x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';
import { anchorPoint } from '../src/scene/labels/figure-cards.ts';
import { AlwaysDepth, AlwaysStencilFunc, NotEqualStencilFunc, ReplaceStencilOp, Vector3 } from 'three';
import { PALETTES } from '../src/scene/palette.ts';
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
import { PLACED } from '../src/scene/anatomy/source.ts';
import { PLACED_CAUDATE, PLACED_COURSES } from '../src/scene/anatomy/placement.generated.ts';

const inside = (poly: readonly (readonly [number, number])[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};

test('the lobe is a closed pillow of 2D\'s outline about its own mid-plane, its dome standing out of it', () => {
  const g = caudateGeometry(), pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.index!;
  // closed: every edge is shared by exactly two triangles
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) { const u = idx.getX(t + a), v = idx.getX(t + b), k = u < v ? `${u}|${v}` : `${v}|${u}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  assert.ok([...edges.values()].every((n) => n === 2), 'a closed surface');
  if (PLACED) {   // (placed path: the lobe is the approved mock's egg about PLACED_CAUDATE, not 2D's outline; organs-placed.test.ts pins its shape)
    const { c, ax } = PLACED_CAUDATE;
    let front = 0;
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Math.abs(pos.getX(i) - c[0]) < 1.2 * ax[0] && Math.abs(pos.getY(i) - c[1]) <= ax[1] + 1e-6 && Math.abs(pos.getZ(i) - c[2]) < 1.2 * ax[2], `vertex ${i} is on the egg`);
      if (pos.getZ(i) > c[2] + 0.5 * ax[2]) front += nor.getZ(i) > 0 ? 1 : -1;
    }
    assert.ok(front > 0, 'its front faces the viewer');
    return;
  }
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
  // (placed path: the cava is the approved IVC course, PLACED_COURSES.ivc, read in 2D units)
  const ivc2 = (PLACED_COURSES.ivc ?? []).map((q) => [x2d(q[0]!), y2d(q[1]!)] as [number, number]), axisOf = PLACED ? ivc2 : cava;
  const axisX = (y: number) => axisOf.reduce((b, q) => (Math.abs(q[1] - y) < Math.abs(b[1] - y) ? q : b))[0];
  if (v.plan!.kind !== 'feeder') return;
  for (const f of v.plan!.list) {
    const a = f.pts[0]!, b = f.pts[f.pts.length - 1]!;
    // (placed path: the lobe is the approved egg, PLACED_CAUDATE, and the veins are the approved cv1 to cv3: each starts inside the egg seen from the front)
    const inLobe = PLACED ? ((x3(a[0]) - PLACED_CAUDATE.c[0]) / PLACED_CAUDATE.ax[0]) ** 2 + ((y3(a[1]) - PLACED_CAUDATE.c[1]) / PLACED_CAUDATE.ax[1]) ** 2 < 1 : inside(poly, a[0], a[1]);
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

test('the lobe is an organ of the layer, drawn after the liver, and a pin never outlines it', () => {
  assert.ok('caudate' in ORGAN_STYLE);
  // (placed path: the egg lies on the liver's back and is drawn BEFORE the liver, whose wash lies over it, as the approved mock sorts it)
  if (PLACED) assert.ok(ORGAN_ORDER.indexOf('caudate') < ORGAN_ORDER.indexOf('liver'));
  else assert.ok(ORGAN_ORDER.indexOf('caudate') > ORGAN_ORDER.indexOf('liver'));
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
const CAVA = NETWORK_BY_ID.get('IVC_IS_1')!, VEINS = NETWORK_BY_ID.get(CAUDATE_VEIN_ID)!;
const cavaAxis = EDGE_PATH_2D[CAUDATE_HOST]!;
const axisAt = (y: number): [number, number] => cavaAxis.reduce((b, q) => (Math.abs(q[1] - y) < Math.abs(b[1] - y) ? q : b)) as [number, number];

test('the lobe lies at the cava\'s depth, the same as its three veins', () => {
  if (PLACED) {   // (placed path: the egg sits just left of the IVC, which lies in its groove, at the cava's depth, and its three short veins start in it: the approved data's own numbers)
    const { c, ax } = PLACED_CAUDATE, ivc = PLACED_COURSES.ivc!, at = ivc.reduce((b, q) => (Math.abs(q[1] - c[1]) < Math.abs(b[1] - c[1]) ? q : b));
    assert.ok(Math.abs(at[2] - c[2]) < 0.01, `the egg's middle is on the cava's plane (${at[2]} against ${c[2]})`);
    assert.ok(c[0] > at[0] && c[0] - ax[0] - at[0] < 0.03, 'just left of the cava, against it');
    for (const k of ['cv1', 'cv2', 'cv3']) { const v = PLACED_COURSES[k]!, s = v[0]!; assert.ok(((s[0] - c[0]) / ax[0]) ** 2 + ((s[1] - c[1]) / ax[1]) ** 2 + ((s[2] - c[2]) / ax[2]) ** 2 < 1, `${k} starts inside the lobe`); }
    return;
  }
  assert.ok(Math.abs(ORGAN_Z.caudate + LOBE_Z - TIER_Z[CAVA.tier]) < 1e-9, 'the mid-plane is the cava\'s plane');
  assert.ok(VEINS.pts.length > 0 && VEINS.pts.every((p) => Math.abs(p[2] - (ORGAN_Z.caudate + LOBE_Z)) < 1e-9), 'every point of the vein group is on it');
});

type V3 = [number, number, number];
/** An orthographic view turned by yaw (about the vertical) then pitch (about the horizontal), in degrees: the scene point's screen place, in scene units. */
const view = (yaw: number, pitch: number) => {
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  return ([x, y, z]: V3): [number, number] => { const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a); return [x1, y * Math.cos(b) - z1 * Math.sin(b)]; };
};
const hull = (pts: [number, number][]): [number, number][] => {
  const p = [...pts].sort((u, v) => u[0] - v[0] || u[1] - v[1]), cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
};
/** How far inside a counter-clockwise convex polygon a point is (negative outside). */
const depthIn = (h: [number, number][], [x, y]: [number, number]): number => {
  let d = Infinity;
  for (let i = 0; i < h.length; i++) { const [ax, ay] = h[i]!, [bx, by] = h[(i + 1) % h.length]!, L = Math.hypot(bx - ax, by - ay) || 1; d = Math.min(d, ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / L); }
  return d;
};

test('the veins stay joined at every view: each starts inside the lobe and ends in the cava, yaw -25 to 25 and pitch -12 to 12', { skip: PLACED && 'placed path: the three veins are the approved data\'s cv1 to cv3, which start inside the egg (the depth test above); their joins are the vessels\' (tests/anatomy-smooth.test.ts)' }, () => {
  const pos = caudateGeometry().getAttribute('position'), z = ORGAN_Z.caudate, margin = 5 / 300;
  const plan = VEINS.plan!;
  assert.equal(plan.kind, 'feeder'); if (plan.kind !== 'feeder') return;
  for (let yaw = -25; yaw <= 25; yaw += 5) for (let pitch = -12; pitch <= 12; pitch += 6) {
    const proj = view(yaw, pitch), h = hull(Array.from({ length: pos.count }, (_, i) => proj([pos.getX(i), pos.getY(i), pos.getZ(i) + z])));
    for (const course of plan.list as readonly { pts: readonly (readonly [number, number])[] }[]) {
      const first: readonly [number, number] = course.pts[0]!, last: readonly [number, number] = course.pts[course.pts.length - 1]!, zz: number = VEINS.pts[0]![2];
      assert.ok(depthIn(h, proj([x3(first[0]), y3(first[1]), zz])) >= margin, `yaw ${yaw} pitch ${pitch}: a vein starts inside the lobe with 5 units to spare`);
      const onAxis = axisAt(last[1]), end = proj([x3(last[0]), y3(last[1]), zz]), mid = proj([x3(onAxis[0]), y3(onAxis[1]), zz]);
      const d = Math.hypot(end[0] - mid[0], end[1] - mid[1]);
      assert.ok(d < CAVA.radius, `yaw ${yaw} pitch ${pitch}: a vein ends within the cava's radius (${(d * 300).toFixed(1)} against ${(CAVA.radius * 300).toFixed(1)})`);
    }
  }
});

test('the lobe is seated against the cava\'s left wall where the veins enter, at its normal size and fully grown', () => {
  const wallOf = (y: number) => axisAt(y)[0] - CAVA.radius * 300;
  const edgeX = (poly: readonly (readonly [number, number])[], y: number): number => {   // the polygon's right edge at row y
    let m = -Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!; if ((yi > y) !== (yj > y)) m = Math.max(m, xi + ((y - yi) / (yj - yi)) * (xj - xi)); }
    return m;
  };
  const base = flattenPath(CAUDATE_OUTLINE), [sx, sy] = caudateScale(1), [axs, ays] = [CAUDATE_ANCHOR_2D[0], CAUDATE_ANCHOR_2D[1]];
  const grown = base.map(([x, y]): [number, number] => [axs + (x - axs) * sx, ays + (y - ays) * sy]);
  for (let y = 340; y <= 390; y += 5) for (const [name, poly] of [['normal', base], ['grown', grown]] as const) assert.ok(edgeX(poly, y) >= wallOf(y), `${name}, y ${y}: the lobe's edge ${edgeX(poly, y).toFixed(1)} reaches the cava's wall ${wallOf(y).toFixed(1)}`);
});

test('the lobe is drawn over the liver (it lies inside it): the fill skips the depth test and marks stencil bit 4, the ink draws only where the fill is not', async () => {
  const { OrganLayer } = await import('../src/scene/organs/layer.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { ORGAN_MESHES, setOrganData } = await import('../src/scene/organs/meshes.ts');
  const { readFileSync } = await import('node:fs');
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const layer = new OrganLayer(createShared(), ORGAN_MESHES);
  layer.applyLook(PALETTES.light);
  const c = layer.byId.get('caudate')!, l = layer.byId.get('liver')!;
  if (PLACED) {   // (placed path: the egg on the liver's back is depth-tested like every organ and drawn before the liver; its fill still marks bit 4 and its ink draws only where the fill is not)
    assert.notEqual(c.toon.depthFunc, AlwaysDepth);
    assert.ok(c.toon.stencilWrite && c.toon.stencilWriteMask === 4 && c.toon.stencilRef === 4 && c.toon.stencilFunc === AlwaysStencilFunc && c.toon.stencilZPass === ReplaceStencilOp, 'the fill marks bit 4');
    assert.ok(c.ink.stencilWrite && c.ink.stencilWriteMask === 0 && c.ink.stencilFuncMask === 4 && c.ink.stencilFunc === NotEqualStencilFunc, 'the ink draws where bit 4 is not set');
    assert.ok(c.toonMesh.renderOrder < l.toonMesh.renderOrder, 'drawn before the liver');
    return;
  }
  assert.equal(c.toon.depthFunc, AlwaysDepth); assert.equal(c.toon.depthWrite, false);
  assert.ok(c.toon.stencilWrite && c.toon.stencilWriteMask === 4 && c.toon.stencilRef === 4 && c.toon.stencilFunc === AlwaysStencilFunc && c.toon.stencilZPass === ReplaceStencilOp, 'the fill marks bit 4');
  assert.equal(c.ink.depthFunc, AlwaysDepth);
  assert.ok(c.ink.stencilWrite && c.ink.stencilWriteMask === 0 && c.ink.stencilFuncMask === 4 && c.ink.stencilRef === 4 && c.ink.stencilFunc === NotEqualStencilFunc, 'the ink draws where bit 4 is not set, and marks nothing');
  const inkOrder = (o: typeof c) => o.group.children.find((k) => k !== o.toonMesh && (k as { material?: unknown }).material === o.ink)!.renderOrder;
  assert.ok(c.toonMesh.renderOrder > inkOrder(l), 'the lobe\'s fill is drawn after the liver\'s ink');
  assert.ok(inkOrder(c) > c.toonMesh.renderOrder, 'and its ink after its fill');
  assert.notEqual(l.toon.depthFunc, AlwaysDepth, 'the liver keeps its depth test');
});

test('a mark or step on the lobe sits on its dome, not at the organ plane in front of it; every other organ keeps its place', async () => {
  const deck = (await loadAgDeck('budd-chiari')) as unknown as CopiedDeck, s = deck.slides.find((x) => x.id === 'dx')!;
  const cards = figureCalls(figurePlan(s)).cards, out = new Vector3();
  const on = cards.filter((k) => 'at2d' in k.anchor && k.anchor.at2d[0] === ORGAN_ANCHOR_2D.caudate!.at[0] && k.anchor.at2d[1] === ORGAN_ANCHOR_2D.caudate!.at[1]);
  assert.ok(on.length > 0, 'the slide has a card on the lobe');
  for (const k of on) { assert.equal((k.anchor as { z?: number }).z, CAUDATE_FRONT_Z); assert.equal(anchorPoint(k.anchor, out)!.z, CAUDATE_FRONT_Z); }
  if (PLACED) assert.ok(Math.abs(CAUDATE_FRONT_Z - (PLACED_CAUDATE.c[2] + PLACED_CAUDATE.ax[2])) < 0.003, 'placed path: the egg\'s front');   // (the egg's own front pole)
  else assert.equal(CAUDATE_FRONT_Z, ORGAN_Z.caudate + LOBE_Z + LOBE_RISE);
  assert.equal(anchorPoint({ at2d: ORGAN_ANCHOR_2D.liver!.at }, out)!.z, 0.26, 'a liver mark keeps the organ plane');
});
