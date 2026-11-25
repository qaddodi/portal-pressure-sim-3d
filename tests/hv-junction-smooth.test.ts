// The hepatic veins join the cava smoothly (mock F, 25 Nov; Mohammad: "are you sure the openings will be joined smoothly right? No kinks or sharp turns").
// Each course into its mouth turns no more than the app's fairness bar (FAIR_TURN degrees per 0.01 of arc); the middle vein meets the shared trunk at no more
// than the merge angle the skin welds as one vessel (60 degrees, MERGE_MAX in placed-network.ts); the trunk is 2 to 3.5 radii long.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PLACED_EDGE_3D, PLACED_HV_TRUNK, FAIR_TURN } = await import('../src/scene/anatomy/placed-network.ts');

type V = readonly number[];
const sub = (a: V, b: V): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const len = (a: V): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const ang = (a: V, b: V): number => Math.acos(Math.max(-1, Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (len(a) * len(b))))) * 180 / Math.PI;
const arc = (c: readonly V[]): number[] => { const s = [0]; for (let i = 1; i < c.length; i++) s.push(s[i - 1]! + len(sub(c[i]!, c[i - 1]!))); return s; };
/** The sharpest turn along a course: the angle between its heading over one step before a point and one step after, per `step` of arc. */
function worstTurn(c: readonly V[], step = 0.01): number {
  const s = arc(c), L = s[s.length - 1]!;
  const at = (d: number): number[] => { let i = 1; while (i < c.length - 1 && s[i]! < d) i++; const t = (d - s[i - 1]!) / ((s[i]! - s[i - 1]!) || 1); return [0, 1, 2].map((k) => c[i - 1]![k]! + (c[i]![k]! - c[i - 1]![k]!) * t); };
  let worst = 0;
  for (let d = step; d < L - step; d += 0.002) worst = Math.max(worst, ang(sub(at(d), at(d - step)), sub(at(d + step), at(d))));
  return worst;
}
const MERGE_MAX_DEG = 60;

for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
  test(`${id}: no kink into its mouth (turns at most ${FAIR_TURN} degrees per 0.01 of arc)`, () => {
    const t = worstTurn(PLACED_EDGE_3D[id]! as V[]);
    assert.ok(t <= FAIR_TURN, `${id} turns ${t.toFixed(2)} degrees over 0.01 (bar ${FAIR_TURN})`);
  });
}

test(`the middle hepatic vein meets the shared trunk at no more than ${MERGE_MAX_DEG} degrees, in a trunk 2 to 3.5 radii long`, () => {
  const lhv = PLACED_EDGE_3D.LHV_IVC! as V[], mhv = PLACED_EDGE_3D.MHV_IVC! as V[], J = PLACED_HV_TRUNK.at as V;
  let k = 0, best = Infinity; lhv.forEach((p, i) => { const d = len(sub(p, J)); if (d < best) { best = d; k = i; } });
  const merge = ang(sub(mhv[mhv.length - 1]!, mhv[mhv.length - 6]!), sub(lhv[Math.min(lhv.length - 1, k + 5)]!, lhv[Math.max(0, k - 5)]!));
  assert.ok(merge <= MERGE_MAX_DEG, `the middle vein meets the trunk at ${merge.toFixed(1)} degrees (bar ${MERGE_MAX_DEG})`);
  const r = 0.0194; // the left hepatic vein's radius (network.ts)
  assert.ok(PLACED_HV_TRUNK.length >= 2 * r && PLACED_HV_TRUNK.length <= 3.5 * r, `the trunk is ${(PLACED_HV_TRUNK.length / r).toFixed(2)} radii long`);
});
