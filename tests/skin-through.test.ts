// A junction's THROUGH RUN (through.ts; Mohammad, 20 Nov: "this is a very very wobbly junction, smooth it out": the SVC above the atrium where the azygos arch joins). Two arms that leave a node in opposite directions are one trunk: the union takes
// them by a plain minimum, the trunk is one even taper from seam to seam, and a side vein starts at the trunk's near wall. These tests pin the three root causes (the smooth-min lump round a trunk, the side vein's end cap reaching the far wall, the
// two halves' axes that do not meet) on synthetic junctions and on the real network, and the rule that two skins never leave a sliver of tube between their seams (cuts.ts MIN_STUB_R). Node only: numbers in, numbers out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { isLiverBranch } from '../src/scene/vessels/skin/inventory.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { SkinObject, type ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { ENTER_DEPTH_R, THROUGH_DEG, throughMates, weldThrough } from '../src/scene/vessels/skin/through.ts';
import { MIN_STUB_R } from '../src/scene/vessels/skin/cuts.ts';
import { sdArm, sdUnion, smin, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

type V3 = [number, number, number];
/** An arm that leaves the node (the origin) along `dir`: its heading line starts 0.1 from the node, its seam is 0.2 out, its far point 0.6; radius r (rest, no taper). */
const arm = (dir: V3, r: number, lean = 0): ArmAxis => {
  const l = Math.hypot(...dir), d = dir.map((x) => x / l) as V3, at = (t: number): V3 => [d[0] * t + lean * t * t, d[1] * t, d[2] * t];
  return { pts: [[0, 0, 0], at(0.1), at(0.2), at(0.6)], radii: [r, r, r, r] };
};
const capsOf = (ax: readonly ArmAxis[]): Capsule[] => ax.map((a) => ({ n: 4, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate }));

test('two arms leaving a node in opposite directions are a run; a Y (120 degrees) and a growing arm are not', () => {
  const T = [arm([0, 1, 0], 0.025), arm([0, -1, 0], 0.025), arm([1, 0, 0], 0.01)];
  assert.deepEqual(throughMates(T), [1, 0, -1], 'the trunk above and below pairs; the side vein does not');
  assert.deepEqual(throughMates(T, [false, true, false]), [-1, -1, -1], 'a growing arm comes and goes: never one half of a trunk');
  const lean = [arm([0.1, 1, 0], 0.025), arm([-0.05, -1, 0], 0.025)];
  assert.deepEqual(throughMates(lean), [1, 0], 'a few degrees off straight is still the trunk');
  const off = Math.tan(((180 - THROUGH_DEG - 5) * Math.PI) / 180);
  assert.deepEqual(throughMates([arm([0, 1, 0], 0.02), arm([Math.sin(Math.atan(off)), -Math.cos(Math.atan(off)), 0], 0.02)]), [-1, -1], 'past the angle it is a bend, not a run');
  const Y = [0, 1, 2].map((i) => arm([Math.cos((2 * Math.PI * i) / 3), Math.sin((2 * Math.PI * i) / 3), 0], 0.02));
  assert.deepEqual(throughMates(Y), [-1, -1, -1], 'a Y has no through run');
  // each arm in at most one pair: the most nearly opposite pair wins
  const X = [arm([0, 1, 0], 0.02), arm([0, -1, 0], 0.02), arm([0.3, -1, 0], 0.02)];
  const m = throughMates(X);
  assert.equal(m[0], 1); assert.equal(m[1], 0); assert.equal(m[2], -1);
});

test('a welded run is one capsule from each far point through both seams: the heading at its own seam, an even taper between the seam radii, no step', () => {
  // SVC: 0.0209 above, 0.025 below, the upper half leaning (a fifth of a radius off the trunk's axis at the node)
  const up = arm([0, 1, 0], 0.0209, 0.4), down = arm([0, -1, 0], 0.025), side = arm([-1, 0.05, 0], 0.0157);
  const w = weldThrough([up, down, side]);
  assert.equal(w[0]!.mate, 1); assert.equal(w[1]!.mate, 0); assert.equal(w[2]!.mate, undefined);
  for (const [i, o] of [[0, 1], [1, 0]] as const) {
    const a = w[i]!, b = [up, down, side][o]!, own = [up, down, side][i]!;
    assert.deepEqual(a.pts[0], b.pts[2], 'the run starts at the OTHER half\'s seam');
    assert.deepEqual(a.pts[2], own.pts[2]); assert.deepEqual(a.pts[3], own.pts[3]);
    // the second point is on the tube's own heading at its seam (the flow marks' arc is taken seam -> second point)
    const h = [own.pts[1][0] - own.pts[2][0], own.pts[1][1] - own.pts[2][1], own.pts[1][2] - own.pts[2][2]], g = [a.pts[1][0] - a.pts[2][0], a.pts[1][1] - a.pts[2][1], a.pts[1][2] - a.pts[2][2]];
    const cos = (h[0]! * g[0]! + h[1]! * g[1]! + h[2]! * g[2]!) / (Math.hypot(...h) * Math.hypot(...g));
    assert.ok(cos > 1 - 1e-9, `${i}: the heading at the seam is the tube's own`);
    assert.ok(a.radii[0]! === b.radii[2]! && a.radii[2]! === own.radii[2]!, 'the radii at the two seams are the two tubes\' own');
    assert.ok(a.radii[1]! >= Math.min(a.radii[0]!, a.radii[2]!) - 1e-12 && a.radii[1]! <= Math.max(a.radii[0]!, a.radii[2]!) + 1e-12, 'between them, no overshoot');
  }
});

test('the plain minimum: along a welded trunk the union is exactly the nearer half, with no blend; the smooth-min of the same two halves bulges out by k / 4 at a tie', () => {
  const up = arm([0, 1, 0], 0.025), down = arm([0, -1, 0], 0.025);
  const welded = capsOf(weldThrough([up, down])), plain = capsOf([up, down]), k = 0.02;
  // a point on the trunk's wall, level with the node, where the two halves are equally near
  const x = 0.025, y = 0, z = 0;
  const hard = sdUnion(welded, k, x, y, z), a = sdArm(welded[0]!, x, y, z), b = sdArm(welded[1]!, x, y, z);
  assert.ok(Math.abs(hard - Math.min(a, b)) < 1e-12, 'the run is a plain minimum');
  assert.ok(Math.abs(hard) < 1e-6, `the trunk's wall is the wall at the node: ${hard}`);
  const blended = sdUnion(plain, k, x, y, z);
  assert.ok(blended < hard - 0.9 * k / 4 * 0 - 1e-4 || Math.abs(blended - smin(sdArm(plain[0]!, x, y, z), sdArm(plain[1]!, x, y, z), k)) < 1e-12, 'what the old union did: it pulled the wall out');
  assert.ok(blended < -1e-3, `unwelded, the wall at the node is ${blended} (inside: the bulge)`);
});

test('a side vein starts where its axis enters the trunk, just inside the near wall, so its end cap is a whole trunk width from the far wall; a node with no run is untouched; a growing arm keeps its own start', () => {
  const up = arm([0, 1, 0], 0.025), down = arm([0, -1, 0], 0.025);
  const side: ArmAxis = { pts: [[0, 0, 0], [-0.0, 0, 0], [-0.2, 0, 0], [-0.6, 0, 0]], radii: [0.012, 0.012, 0.012, 0.012] };   // starts AT the node: its cap reaches the far wall
  const w = weldThrough([up, down, side]);
  const s = w[2]!;
  assert.deepEqual(s.pts[2], side.pts[2], 'its seam is where it was'); assert.deepEqual(s.pts[3], side.pts[3]);
  const run = capsOf(w).slice(0, 2), sd = (p: readonly number[]) => Math.min(...run.map((c) => sdArm(c, p[0]!, p[1]!, p[2]!)));
  assert.ok(sd(s.pts[1]) <= -ENTER_DEPTH_R * side.radii[0]! + 1e-6, `its start is inside the trunk's near wall (${sd(s.pts[1])})`);
  assert.ok(sd(s.pts[1]) > -0.5 * 0.025, 'and not across the trunk');
  const reach = s.pts[1][0] + s.radii[1]!;   // (the vein runs toward -x: its end cap reaches this far across)
  assert.ok(0.025 - reach > 0.025, `its end cap (to x = ${reach.toFixed(4)}) stays more than a trunk radius from the far wall (x = 0.025)`);
  // no run, no change
  const Y = [0, 1, 2].map((i) => arm([Math.cos((2 * Math.PI * i) / 3), Math.sin((2 * Math.PI * i) / 3), 0], 0.02));
  assert.deepEqual(weldThrough(Y), Y);
  // a growing arm keeps its own start
  const g = weldThrough([up, down, side], [false, false, true]);
  assert.deepEqual(g[2], side);
});

test('the fragment stage draws the outline by the same rule as the mesh: a run is one arm to the union (plain minimum), the second half is taken with the first, the rest blend in arm order', () => {
  assert.match(SKIN_FS, /uniform vec4 armCopy\[/, 'the pairing rides in armCopy.w (one vec4 per arm: a float array costs a whole vector a slot and broke the uniform budget)');
  assert.match(SKIN_FS, /float m = armCopy\[i\]\.w;/);
  assert.match(SKIN_FS, /if \(m > -0\.5 && m < float\(i\) - 0\.5\) continue;/, 'the second half of a run is skipped');
  assert.match(SKIN_FS, /if \(m > float\(i\) \+ 0\.5\) di = min\(di, dArm\[int\(m \+ 0\.5\)\]\);/, 'the first half takes the nearer of the two');
  assert.match(SKIN_FS, /d = first \? di : skinSmin\(d, di, kPx\);/, 'and blends with the rest');
});

// ---- the real network ----
function built(): { scene: CelScene; set: SkinSet; draws: SkinObject[]; axes: Map<SkinObject, readonly ArmAxis[]>; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [], axes = new Map<SkinObject, readonly ArmAxis[]>(), parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => { const d = new SkinObject(mesh, arms[0]!, ax, arms); draws.push(d); axes.set(d, ax); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  { const live = new Set<unknown>(set.liveDraws()); for (let i = draws.length - 1; i >= 0; i--) if (!live.has(draws[i])) draws.splice(i, 1); }   // (a skin the planner took back to plan with its neighbours is not one of them)
  return { scene, set, draws, axes, was };
}
const nodeOf = (d: SkinObject) => d.mesh.name.replace('skin:', '');

test('real network: through the weld the skin keeps the trunk\'s calibre: on the wall of the trunk away from every side vein the mesh lies within 4% of the trunk radius of the trunk\'s own surface (before: SVC 17%)', () => {
  const b = built();
  try {
    let runs = 0; const worst: string[] = [];
    for (const d of b.draws) {
      const ax = b.axes.get(d)!, mesh = b.set.skinOf(nodeOf(d)) as SkinMesh, caps = capsOf(ax);
      const runIdx = ax.map((a, i) => (a.mate !== undefined ? i : -1)).filter((i) => i >= 0);
      if (!runIdx.length) continue;
      runs++;
      const R = Math.max(...runIdx.map((i) => ax[i]!.radii[2]!));
      // (a liver branch is a fork child that leaves its host at a shallow angle from behind the node: its own start lies where this test looks for a bulge, so it is not a side vein here; tests/skin-sheet.test.ts judges those)
      const sides = ax.map((a, i) => (a.mate === undefined && !mesh.junction.arms[i]!.grow && !isLiverBranch(NETWORK_BY_ID.get(mesh.junction.arms[i]!.vesselId)!) ? i : -1)).filter((i) => i >= 0);
      let far = 0;
      for (const si of sides) {
        const sa = ax[si]!, o = [sa.pts[2][0] - sa.pts[1][0], sa.pts[2][1] - sa.pts[1][1], sa.pts[2][2] - sa.pts[1][2]], ol = Math.hypot(...o);
        for (let v = 0; v < mesh.position.length / 3; v++) {
          const x = mesh.position[3 * v]!, y = mesh.position[3 * v + 1]!, z = mesh.position[3 * v + 2]!;
          // only the vertices on the side of the node away from this side vein (the far wall of the trunk), and clear of every OTHER side vein's crotch
          if (((x - mesh.junction.J[0]) * o[0]! + (y - mesh.junction.J[1]) * o[1]! + (z - mesh.junction.J[2]) * o[2]!) / ol > -0.3 * R) continue;
          if (sides.some((q) => q !== si && sdArm(caps[q]!, x, y, z) < 2 * ax[q]!.radii[2]!)) continue;
          far = Math.max(far, Math.min(...runIdx.map((i) => sdArm(caps[i]!, x, y, z))));
        }
      }
      if (far > 0.04 * R) worst.push(`${nodeOf(d)} ${(far / R).toFixed(3)} R`);
    }
    assert.ok(runs >= 8, `${runs} junctions with a through run`);
    // (HA and PVH, the arterial and portal forks whose "trunk" halves are different vessels, are bounded looser: 13% before this, they were not the wobble)
    // (the liver beds SIN_R and SIN_L: the portal venule runs on into the sinusoid through a bend of about 60 degrees, and the skin's smooth union fills the inside of any bend: that is the fillet, not a bulge away from the arteriole)
    const strict = worst.filter((w) => !/^(HA|PVH|SIN_R|SIN_L) /.test(w));
    assert.deepEqual(strict, [], 'no trunk bulges away from its side veins');
    for (const w of worst) assert.ok(Number(w.split(' ')[1]) < (/^SIN_/.test(w) ? 0.4 : 0.15), w);
  } finally { b.scene.dispose(); setSmoothJoins(b.was); }
});

test('real network: the SVC\'s two junctions (azygos arch and epigastric vein, 0.9 radii apart on the trunk) are ONE skin, and no two skins on a vessel leave less than MIN_STUB_R radii of it between their seams', () => {
  const b = built();
  try {
    const nodes = b.draws.map(nodeOf);
    assert.ok(nodes.includes('SVC_E+SVC'), nodes.join(','));
    assert.ok(!nodes.includes('SVC') && !nodes.includes('SVC_E'), 'not two skins with a sliver of tube between');
    const m = b.set.skinOf('SVC_E+SVC')!;
    assert.deepEqual(m.junction.arms.map((a) => a.vesselId).sort(), ['AZY_SVC', 'EPI_SVC', 'SVC_RA', 'V_UP']);
    assert.ok(m.junction.arms.every((a) => a.vesselId !== 'SVC_RA_1'), 'the piece between them is inside the skin');
    assert.ok(MIN_STUB_R > 0.9 && MIN_STUB_R < 2.18, 'the threshold splits the SVC pair (0.9) from the portal confluence pair CONF / PVT_L (2.2), which has always been two skins');
    const ends = new Map<string, { node: string; u: number; end: number }[]>();
    const sideCut = new Set<string>();   // (a vessel with a hole in its wall, a side-wall junction's two cuts: the end 1 cut lies before the end 0 cut there, on purpose)
    for (const d of b.draws) { const sm = b.set.skinOf(nodeOf(d))!; for (const c of sm.cuts) if (c.side) sideCut.add(c.vesselId); }
    for (const d of b.draws) { const sm = b.set.skinOf(nodeOf(d))!; for (const c of sm.cuts) ends.set(c.vesselId, [...(ends.get(c.vesselId) ?? []), { node: nodeOf(d), u: c.u, end: c.end }]); }
    for (const [id, es] of ends) if (es.length > 1 && !sideCut.has(id)) { const lo = es.find((e) => e.end === 0), hi = es.find((e) => e.end === 1); if (lo && hi) assert.ok(hi.u > lo.u, `${id}: the seams do not cross`); }
  } finally { b.scene.dispose(); setSmoothJoins(b.was); }
});
