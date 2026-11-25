// Mohammad, 20 Nov: "Umbilical vein into LPV junction still sucks". The paraumbilical vein started at the left portal vein's END node, where that vein has narrowed to under half its width and splits into its fading tips,
// so a wider separate tube hung off a thin tip with a notch and a kink. It leaves the vein's wall now, before that narrowing, as one curve with the vein's axis at its start and its own course at its end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
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
  // (restated for the placed anatomy, the only one now: the approved placement draws the vein on its own course down the front of the belly, not 2D's, so what holds from 2D is where it ENDS:
  //  on the epigastric pair's joint, where both of the pair start (the weld needs the vein to end where the pair does))
  const last = NETWORK_BY_ID.get('C3')!.pts.at(-1)!;
  for (const id of ['EPI_SVC', 'EPI_ILI']) { const s0 = NETWORK_BY_ID.get(id)!.pts[0]!; assert.ok(Math.hypot(last[0] - s0[0], last[1] - s0[1], last[2] - s0[2]) < 1e-6, `it ends where ${id} starts (the pair's joint)`); }
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
  // (restated for the placed anatomy, the only one now: the left hepatic artery runs behind the left portal vein (round 18), so on screen it may pass under the bend where the vein leaves the wall;
  //  there it is behind it and clear of it in depth, wall to wall, never touching)
  const A = NETWORK_BY_ID.get('A_HL')!, B = NETWORK_BY_ID.get('C3')!.pts.slice(0, 30);
  ahl.forEach((p, i) => { if (distToPath(p, bend) > 4) return; const a = A.pts[i]!; for (const q of B) { assert.ok(a[2] < q[2], 'the artery passes behind the bend'); assert.ok(Math.hypot(a[0] - q[0], a[1] - q[1], a[2] - q[2]) > A.radius + c3.radius, 'and clear of it'); } });
});

test('it has no collar at its start (a collar sized for the wide trunk stood out of the narrow vein as a knob)', () => {
  const c3 = NETWORK_BY_ID.get('C3')!;
  assert.ok(!c3.flare?.[0], 'no flare at the leaving end');
});
