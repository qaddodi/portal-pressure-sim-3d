// Mohammad, 20 Nov: "Umbilical vein into LPV junction still sucks". The paraumbilical vein started at the left portal vein's END node, where that vein has narrowed to under half its width and splits into its fading tips,
// so a wider separate tube hung off a thin tip with a notch and a kink. It leaves the vein's wall now, before that narrowing, as one curve with the vein's axis at its start and its own course at its end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

const pts2d = (id: string): [number, number][] => NETWORK_BY_ID.get(id)!.pts.map((p) => [x2d(p[0]), y2d(p[1])]);
const distToPath = (p: readonly number[], path: readonly (readonly number[])[]) => {
  let best = 1e9;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!, [bx, by] = path[i]!, dx = bx! - ax!, dy = by! - ay!, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0]! - ax!) * dx + (p[1]! - ay!) * dy) / l2));
    best = Math.min(best, Math.hypot(p[0]! - (ax! + dx * t), p[1]! - (ay! + dy * t)));
  }
  return best;
};

test('the umbilical vein starts on the left portal vein\'s own axis, well before the vein\'s end, and carries on along its 2D course', () => {
  const c3 = pts2d('C3'), lpv = [...pts2d('PVH_L'), ...pts2d('PVH_L_1').slice(1)];
  assert.ok(distToPath(c3[0]!, lpv) < 0.5, 'it starts on the vein\'s axis');
  const end = lpv[lpv.length - 1]!, d = Math.hypot(c3[0]![0] - end[0], c3[0]![1] - end[1]);
  assert.ok(d > 20, `it leaves ${d.toFixed(0)} units short of the vein's end, where the vein is still wide`);
  const own = EDGE_PATH_2D.C3!, last = c3[c3.length - 1]!;
  // (since e10ef788 it ends on the epigastric pair's JOINT, which the pair's fillet puts about 12 px off the node 2D ends at: the weld needs the vein to end where the pair does)
  const away = Math.hypot(last[0] - own[own.length - 1]![0], last[1] - own[own.length - 1]![1]);
  assert.ok(away < 13, `it ends ${away.toFixed(1)} units from where 2D's does (the pair's joint, not 2D's node)`);
  for (const k of [10, 20, 30]) assert.ok(distToPath(own[own.length - k]!, c3) < (k < 30 ? 13 : 0.05), 'the rest of its course is the 2D course (the last stretch bends to the joint)');
});

test('no corner and no doubling back: the bend\'s radius of curvature is several times the tube\'s radius, and no segment turns by more than a few degrees', () => {
  const c3 = pts2d('C3'), r = NETWORK_BY_ID.get('C3')!.radius * UNITS_PER_SCENE;
  let minR = 1e9, worst = 0;
  for (let i = 1; i < c3.length - 1; i++) {
    const a = c3[i - 1]!, b = c3[i]!, c = c3[i + 1]!;
    let d = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
    if (d > Math.PI) d = 2 * Math.PI - d;
    const ds = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
    if (d > 1e-6) minR = Math.min(minR, ds / d);
    worst = Math.max(worst, d);
  }
  assert.ok(minR > 2.5 * r, `the bend's radius ${minR.toFixed(1)} against the tube's ${r.toFixed(1)}`);
  assert.ok(worst < (10 * Math.PI) / 180, `no segment turns by ${((worst * 180) / Math.PI).toFixed(1)} degrees`);
});

test('it is narrower than the vein it leaves at that point (a branch off a wall), and the left hepatic artery stops short of the bend', () => {
  const c3 = NETWORK_BY_ID.get('C3')!, lpv = NETWORK_BY_ID.get('PVH_L_1')!;
  assert.ok(c3.radius < lpv.radius);
  const ahl = pts2d('A_HL'), bend = pts2d('C3').slice(0, 30);
  for (const p of ahl) assert.ok(distToPath(p, bend) > 4, 'the artery does not run under the bend');
});

test('it has no collar at its start (a collar sized for the wide trunk stood out of the narrow vein as a knob)', () => {
  const c3 = NETWORK_BY_ID.get('C3')!;
  assert.ok(!c3.flare?.[0], 'no flare at the leaving end');
});
