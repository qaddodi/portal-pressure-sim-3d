// The inspector's overlap finder (src/scene/vessels/overlaps.ts; Mohammad 20 Nov: "show all the possible collaterals and shunts at once without too much overlap, and if there is we should be able to fix").
// The approved placement lays every vessel in 3D clear of every crossing (docs/approved/anatomy-placement.md); whatever overlaps is a junction (a branch leaving its trunk, a bed starting in its vein), which the skins
// and forks own; nothing else may. (The depth clearance that lifted the 2D figure's crossings off its flat tiers, clearance.ts, went with the cut-over.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { JUNCTION_RUN, OVERLAP_K, findOverlaps, overlapRuns, sampleCourse } from '../src/scene/vessels/overlaps.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';

const withJoins = <T>(on: boolean, f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(on); try { return f(); } finally { setSmoothJoins(was); } };

test('with everything drawn no two tubes run through each other beyond a junction, with smooth joins on or off', () => {
  for (const on of [false, true]) {
    const o = withJoins(on, () => findOverlaps());
    assert.deepEqual(o.map((x) => `${x.a} x ${x.b} (${Math.round(x.depth * 100)}% deep)`), [], `smooth joins ${on}`);
  }
});

test('a junction is a run that starts at an end and is short; a long run along the whole length is not', () => {
  const v = NETWORK.find((n) => !n.feeder && !n.id.includes('~F') && n.kind === 'vein' && sampleCourse(n, coursesOf(n, REST)[0]!.pts as never)!.total > 14 * 2 * n.radius * OVERLAP_K)!;
  const s = sampleCourse(v, coursesOf(v, REST)[0]!.pts as never)!, lim = 2 * v.radius * OVERLAP_K;
  const same = overlapRuns(s, s, lim);
  assert.equal(same.length, 1);
  assert.equal(same[0]!.junction, false, `a vessel on its own twin runs its whole length (${(s.total / lim).toFixed(0)} limits, more than ${JUNCTION_RUN})`);
  const o = findOverlaps({ network: [v, { ...v, id: `${v.id}_twin`, host: `${v.host}_twin` }] });
  assert.equal(o.length, 1, 'two copies of one tube are one overlap');
  assert.ok(o[0]!.depth > 0.99);
});

test('a vessel that is not drawn is in no pair', () => {
  const none = findOverlaps({ drawn: () => false });
  assert.deepEqual(none, []);
});
