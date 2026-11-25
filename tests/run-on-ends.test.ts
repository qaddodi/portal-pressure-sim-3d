// Mohammad, 22 Nov: "coronary vein into varices still did not get fixed" (a pinch and a notch where the varix strands leave the coronary vein's open end).
// The root: shunt-ends.ts sewnEndAt took any end within 1.5 host radii of a host's axis for a side join, host ends included, so strands that CONTINUE the coronary vein from its own end (it runs no further)
// were sunk and narrowed to 0.434 of its width (sideEndScale) as if it carried on past them. An end that runs on from the host's end is not sewn. Node only: the real network.
// Run: node --test tests/run-on-ends.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { shuntEnds, sewnEndAt, endProfileFor, awayFrom, runOnOf, RUN_ON_AXIAL, RUN_ON_DOT, type HostAxis } from '../src/scene/vessels/shunt-ends.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { buildTubes, radiusAtU } from '../src/scene/vessels/tubes.ts';
import { tubularOf } from '../src/scene/vessels/shape.ts';

type V3 = [number, number, number];
const host: HostAxis = { pts: [[0, 0, 0], [0, 0.5, 0]] as V3[], radius: 0.02 };   // runs up the y axis; its end 1 is at (0, 0.5, 0), outward +y; its end 0 at the origin, outward -y

test('an end that continues a host from the host\'s end is a run-on and is not sewn; the same point reached across the axis is a side join and stays sewn', () => {
  // leaving outward along +y from the host's end 1: a run-on
  const on: V3[] = [[0, 0.5, 0], [0, 0.9, 0.0], [0.1, 1.2, 0]];
  assert.equal(sewnEndAt(on[0]!, [host], awayFrom(on, 0)), null);
  assert.equal(endProfileFor(on, [host]), null);
  // the end of a path that arrives at the host's end from outside is the same run-on (the other end of the path)
  const back = [...on].reverse();
  assert.equal(endProfileFor(back, [host]), null);
  // within one host radius along the axis counts, a little further in does not
  const near: V3[] = [[0, 0.5 - 0.019, 0], [0, 0.9, 0]];
  assert.equal(sewnEndAt(near[0]!, [host], awayFrom(near, 0)), null);
  const farIn: V3[] = [[0, 0.5 - 0.03, 0], [0, 0.9, 0]];
  assert.ok(sewnEndAt(farIn[0]!, [host], awayFrom(farIn, 0)), 'more than a radius from the end it lands on the wall');
  // a perpendicular landing near the host's end is a side join
  const side: V3[] = [[0.01, 0.5 - 0.005, 0], [0.4, 0.5, 0]];
  assert.ok(sewnEndAt(side[0]!, [host], awayFrom(side, 0)), 'across the axis: still sewn');
  // an end that leaves INTO the host, back along it, is not a run-on either
  const into: V3[] = [[0, 0.5, 0], [0, 0.3, 0]];
  assert.ok(sewnEndAt(into[0]!, [host], awayFrom(into, 0)));
  // no direction given: the rule of old
  assert.ok(sewnEndAt(on[0]!, [host]));
  assert.equal(RUN_ON_AXIAL, 1); assert.equal(RUN_ON_DOT, 0.7);
  assert.ok((runOnOf(host, on[0]!, awayFrom(on, 0))?.dot ?? 0) > 0.99);
});

test('a joint between two trunk pieces is a side join: an end that runs on from one piece but meets the other\'s wall stays sewn', () => {
  const second: HostAxis = { pts: [[0, 0.5, 0], [0.5, 0.5, 0]] as V3[], radius: 0.02 };   // turns at the joint
  const p: V3[] = [[0, 0.5, 0], [0, 0.9, 0]];
  assert.ok(sewnEndAt(p[0]!, [host, second], awayFrom(p, 0)), 'runs on from the first piece, lies on the second\'s wall');
});

test('the varix strands run on from the coronary vein: C1a is not sewn, so its strands meet the coronary vein at its full width from ring 0, and the vein\'s end is open and flush', () => {
  setSmoothJoins(true);
  assert.equal(shuntEnds('C1a'), null);
  const lgv = coursesOf(NETWORK_BY_ID.get('LGV_CONF')!, REST)[0]!;
  assert.deepEqual([...(lgv.capless ?? [])][0], true, 'the coronary vein is open at its end');
  assert.equal(lgv.point, undefined); assert.equal(lgv.clamp?.[0] ?? null, null);
  // (the coronary vein's width at its open end, as drawn: the placed coronary vein widens over its last stretch to meet the varices (its course's taper, 1.4 at u 0), so its end is not its nominal radius; before the
  //  cut-over it was drawn at one width to its end and the nominal radius was that width)
  const lgvLen = new THREE.CatmullRomCurve3(lgv.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))).getLength(), lgvEnd = radiusAtU(lgv, 0, lgvLen);
  assert.ok(lgvEnd >= lgv.radius, 'the coronary vein\'s open end is at least its own width');
  const v = NETWORK_BY_ID.get('C1a')!, cs = coursesOf(v, REST), { geometry, runs } = buildTubes(cs, tubularOf(v), v.radius);
  const rk = geometry.getAttribute('rk') as THREE.BufferAttribute;
  cs.slice(1).forEach((c, i) => {
    assert.equal(c.sewn, undefined, 'no sewn end');
    const len = new THREE.CatmullRomCurve3(c.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))).getLength();
    assert.ok(Math.abs(radiusAtU(c, 0, len) - lgvEnd) < 1e-6, `strand ${i} starts at the coronary vein's width`);
    const r0 = rk.getX(runs[i + 1]!.tubeStart) * v.radius;   // the first ring as built
    assert.ok(Math.abs(r0 - lgvEnd) < 1e-6, `strand ${i}: first ring ${r0} vs ${lgvEnd}`);
  });
});

test('every other sewn end is sewn as it was (the generated table, both join modes); only the varices\' start is gone', () => {
  const was = JSON.parse(readFileSync(new URL('./fixtures/sewn-ends-22nov.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const now: Record<string, unknown> = {};
  for (const mode of [true, false]) { setSmoothJoins(mode); for (const v of NETWORK) { const e = shuntEnds(v.id); if (e) now[`${mode ? 'smooth' : '2d'}:${v.id}`] = e; } }
  setSmoothJoins(true);
  // (The table was written on the 2D figure's courses; since the cut-over every end lands on the placed courses, so each sewn end's host width and direction are the placed ones. What the run-on fix must leave alone is
  //  which ends are sewn and how (inside, sunk, flared, capped): that is compared. One end changed with the anatomy, not with the fix: the placed azygos is one curve, its lower course C9 running on into its arch
  //  (anatomy/placed-network.ts WHOLE_PIECES azygos), so C9's upper end is a run-on and is not sewn, by the same rule.)
  const kind = (t: Record<string, unknown>) => Object.fromEntries(Object.entries(t).map(([k, ends]) => [k, (ends as ({ inside: boolean; sink: boolean; flare: boolean; capped?: boolean } | null)[]).map((e) => e && { inside: e.inside, sink: e.sink, flare: e.flare, capped: !!e.capped })]));
  const want = kind(was);
  for (const m of ['smooth', '2d']) (want[`${m}:C9`] as unknown[])[1] = null;
  assert.deepEqual(kind(now), want);
  assert.equal(now['smooth:C1a'], undefined);
  assert.ok(now['smooth:C9'], 'the azygos start\'s collateral lands on the azygos\' side wall and stays sewn');
});
