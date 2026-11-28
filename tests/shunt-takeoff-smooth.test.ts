// EVERY SHUNT AND COLLATERAL LEAVES ITS HOST SMOOTHLY (Mohammad, 28 Nov: "the splenorenal spontaneous shunt starting point from splenic vein is not smooth. Can you check every shunt").
// ROOT CAUSE: a growing arm's capsule (the arm of the junction skin the shunt is welded into) was drawn along the straight line back from its seam ring, run back all the way to the node. Where the tube BENDS between the node and the seam (every shunt
// leaves its host at an angle and turns), that line misses the node by up to 2.1 of the arm's radii (the spontaneous splenorenal shunt 1.3, the Warren shunt 1.3, the
// short gastric veins 2.1, DIPS 1.7, the mesenteric collateral 1.3, TIPS 0.7
// to 0.8), so the capsule's root stood off the host's axis, out of its wall: a step and a notch in the outline where the shunt leaves the vein. A growing arm whose
// tube reaches its node now has its capsule start AT the node, with its one bend
// `GROW_BACK_R` radii back from the seam, on the seam's heading line unless the tube leaves that line by more than GROW_LINE_R (skin-set.ts axisOf `growBack`; the
// marks and the run's weights are read along that line, tests/skin-marks.test.ts).
// Pinned for EVERY growing arm of EVERY skin the network makes (a new shunt or collateral is held to it with no edit here):
//   1. the capsule's root is the node itself, the host's own axis point the junction table places;
//   2. its root and its bend stay within TAKEOFF_OFF_R of the tube's own course (the tube is drawn on its course, so the skin's capsule follows the tube out of the host);
//   3. the straight line back from the seam, as the capsule had it, does NOT hold (the check sees the defect it was made for).
// A tube that stops short of its node (the varices' arch landing, C1b, PENDING in tests/junction-ends.test.ts) is bridged from the node by rule and left out of 2.
// Node only. Run: node --test tests/shunt-takeoff-smooth.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK_BY_ID, SHUNT_IDS } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';

type V = readonly number[];
/** How far (in the arm's seam radii) the capsule's root and its first bend may stand from the tube's own course. The straight line back from the seam stood 1.1 to 1.9 off; the bridge stands 0.4 off at most (the tube's own arc against the chord). */
export const TAKEOFF_OFF_R = 0.5;
const sub = (a: V, b: V): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dist = (a: V, b: V): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** The distance from `p` to a polyline. */
function offCourse(c: readonly V[], p: V): number {
  let best = Infinity;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, ab = [c[i]![0]! - a[0]!, c[i]![1]! - a[1]!, c[i]![2]! - a[2]!], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0]! - a[0]!) * ab[0]! + (p[1]! - a[1]!) * ab[1]! + (p[2]! - a[2]!) * ab[2]!) / l2)) : 0;
    best = Math.min(best, Math.hypot(p[0]! - a[0]! - t * ab[0]!, p[1]! - a[1]! - t * ab[1]!, p[2]! - a[2]! - t * ab[2]!));
  }
  return best;
}

interface Take { node: string; id: string; end: 0 | 1; rootToNode: number; off: number; oldOff: number; reaches: boolean; seamR: number }

let cached: Take[] | undefined;
/** Every growing arm's take-off, built once for the file (the skins are the slow part). */
function takeOffs(): Take[] {
  if (cached) return cached;
  const was = smoothJoinsOn();
  setSmoothJoins(true);
  try {
    const scene = new CelScene({ joins: 'old' });
    const out: Take[] = [], seen = new Set<string>();
    const set = new SkinSet({
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (mesh, axes, arms) => {
        mesh.junction.arms.forEach((arm, i) => {
          const ax = axes[i]!, key = `${mesh.junction.node}|${arm.vesselId}|${arm.end}|${ax.pts[0]!.join()}`;
          if (!arm.grow || seen.has(key)) return;
          seen.add(key);
          const v = NETWORK_BY_ID.get(arm.vesselId)!, course = coursesOf(v, REST)[0]!.pts as V[], node = (arm.at ?? mesh.junction.J) as V, seamR = ax.radii[2]!;
          // (the capsule as it was: the seam's heading line run back to the node, whatever the tube does between)
          const h = [ax.pts[3]![0]! - ax.pts[2]![0]!, ax.pts[3]![1]! - ax.pts[2]![1]!, ax.pts[3]![2]! - ax.pts[2]![2]!], hl = Math.hypot(h[0]!, h[1]!, h[2]!) || 1, back = dist(ax.pts[2]!, node);
          const old: V = [ax.pts[2]![0]! - (h[0]! / hl) * back, ax.pts[2]![1]! - (h[1]! / hl) * back, ax.pts[2]![2]! - (h[2]! / hl) * back];
          const end = arm.end ? course[course.length - 1]! : course[0]!;
          out.push({
            node: mesh.junction.node, id: arm.vesselId, end: arm.end, rootToNode: dist(ax.pts[0]!, node), seamR,
            off: Math.max(offCourse(course, ax.pts[0]!), offCourse(course, ax.pts[1]!)) / seamR, oldOff: offCourse(course, old) / seamR, reaches: dist(end, node) < 1.5 * seamR,
          });
        });
        return new SkinObject(mesh, arms[0]!, axes, arms);
      },
      add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
    });
    set.build(2);
    return (cached = out);
  } finally { setSmoothJoins(was); }
}

test('every growing arm of every skin starts at its node and leaves along its tube\'s own course, a shunt\'s and a collateral\'s alike', () => {
  const all = takeOffs();
  assert.ok(all.length >= 20, `${all.length} growing arms were built`);
  // every drawn shunt is among them (the Warren and the spontaneous splenorenal shunts both at SVD and the renal vein, TIPS at both its ends, the Meso-Rex bypass...)
  const ids = new Set(all.map((t) => t.id));
  for (const s of [...SHUNT_IDS, 'C6', 'C2', 'C3']) assert.ok(ids.has(s), `${s} is a growing arm of a skin`);
  const bad: string[] = [];
  for (const t of all) {
    const name = `${t.id} at ${t.node} (end ${t.end})`;
    if (!(t.rootToNode < 1e-9)) bad.push(`${name}: its capsule's root is ${(t.rootToNode / t.seamR).toFixed(2)} radii off the node`);
    else if (t.reaches && !(t.off <= TAKEOFF_OFF_R)) bad.push(`${name}: its capsule leaves ${t.off.toFixed(2)} radii off the tube's own course (at most ${TAKEOFF_OFF_R})`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the check sees the defect: the straight line back from the seam missed the node\'s course by more than a radius for the spontaneous splenorenal shunt and several others', () => {
  const all = takeOffs().filter((t) => t.reaches), missed = new Set(all.filter((t) => t.oldOff > 1).map((t) => t.id));
  assert.ok(missed.has('C6'), 'the spontaneous splenorenal shunt (C6)');
  assert.ok(missed.has('S_DSR'), 'the distal splenorenal shunt (S_DSR)');
  assert.ok(missed.size >= 5, `${[...missed].join(', ')} missed by over a radius`);
  assert.ok(Math.max(...all.map((t) => t.off)) < Math.min(...all.filter((t) => t.oldOff > 1).map((t) => t.oldOff)), 'the bridge is nearer the course than every line that missed it');
});
