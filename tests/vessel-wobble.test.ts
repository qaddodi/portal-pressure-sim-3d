// Mohammad, 21 Nov, on the iPhone zoomed in on the right atrium: "IVC SVC from right atrium still not smooth and zigzagged", "Azygos weld into SVC sucks".
// ROOT CAUSES. (1) The 2D art bends every vein by a sine of up to 4.5 units with a phase and a wavelength of its own per ENGINE PIECE (stage-paths.js meander). At the 2D scale that is under a pixel; at a vessel's own calibre it is a wall that
// wobbles and steps, and the pieces of one vein (IVCS_RA, SVC_RA_1, SVC_RA, V_UP...) wave out of step. scripts/meander-rule.mjs now keeps a wave only where it is deeper than the vessel is wide (a curve), and the courses are made once, in the generator.
// (2) The azygos arch (tier 'net', 0.02) met the superior cava (tier 'back', -0.02): its depth ease dived 0.047 in 0.045 of run, 45 degrees at the camera, onto the cava's wall, which the skin's depth rule holds out of the joint (ragged ink in the lumen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID, RUN_ONS, SVC_TRIBUTARY_IDS } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { meanderWanted, hostsLanding, calibreOf, MEANDER_KEPT } from '../scripts/meander-rule.mjs';
import { EDGES, dMinOf } from '../src/engine/hales/portal/topology.js';

/** The pieces of the cava column the owner looked at (the right atrium's IVC, SVC and the stretch above it), that must run straight and meet at one width. */
const COLUMN = ['IVCS_RA', 'SVC_RA_1', 'SVC_RA', 'V_UP'] as const;
/** How far a calm trunk's wall may stray from its own chord, in its radii. */
const LATERAL_MAX_R = 0.15;
/** The most one ring's chord may turn from the next (degrees): a wall that steps turns by more, a wave of 0.3 radii over 20 radii turns by about 3. */
const TURN_MAX_DEG = 1.5;
/** The most the tube's radius may change from one ring to the next (share of its radius): a step in width. */
const RADIUS_STEP_MAX = 0.04;

setSmoothJoins(true);
// (the tube is built with the rings the app builds it with, scene.ts reshape: tubularOf(def, slicesFor(id)); built with the 2D rule's count alone it had 16 rings where the app has 21, and the cava's run-on taper to the atrium
//  stepped 0.051 between rings of a tube nothing draws)
const rings = (id: string) => {
  const v = NETWORK_BY_ID.get(id)!, { runs, geometry } = buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor(id)), v.radius), r = runs[0]!;
  const rk = geometry.attributes.rk!;
  const pts = Array.from({ length: r.tubular + 1 }, (_, k) => r.curve.getPointAt(k / r.tubular));
  const rad = Array.from({ length: r.tubular + 1 }, (_, k) => rk.getX(k * (r.radial + 1)));
  return { v, pts, rad, curve: r.curve };
};

test('the cava column runs straight: no wall strays more than a sixth of a radius from its chord', () => {
  for (const id of COLUMN) {
    const v = NETWORK_BY_ID.get(id)!, a = v.pts[0]!, b = v.pts[v.pts.length - 1]!, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const lateral = Math.max(...v.pts.map((q) => Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / L)) / v.radius;
    assert.ok(lateral <= LATERAL_MAX_R, `${id}: its course strays ${lateral.toFixed(2)} radii from its chord (the 2D meander is back)`);
  }
});

test('every tube of the column is smooth ring to ring: no ring chord turns more than the limit and the radius never steps', () => {
  for (const id of COLUMN) {
    const { pts, rad } = rings(id);
    let turn = 0, step = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      const a = [pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y], b = [pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.y - pts[k]!.y];
      turn = Math.max(turn, Math.abs(Math.atan2(a[0]! * b[1]! - a[1]! * b[0]!, a[0]! * b[0]! + a[1]! * b[1]!)) * 180 / Math.PI);
    }
    for (let k = 1; k < rad.length; k++) step = Math.max(step, Math.abs(rad[k]! - rad[k - 1]!));
    assert.ok(turn <= TURN_MAX_DEG, `${id}: a ring chord turns ${turn.toFixed(1)} degrees from the next`);
    assert.ok(step <= RADIUS_STEP_MAX, `${id}: the radius steps ${step.toFixed(3)} of itself between two rings`);
  }
});

test('the pieces of the column meet end to end: the same centre, the same width, and no turn at the joint', () => {
  const pairs: [string, 1 | 0, string, 1 | 0][] = [['IVC_IS', 1, 'IVCS_RA', 0], ['SVC_RA_1', 1, 'SVC_RA', 0], ['V_UP', 1, 'SVC_RA_1', 0]];
  for (const [a, ea, b, eb] of pairs) {
    const A = rings(a), B = rings(b), ia = ea ? A.pts.length - 1 : 0, ib = eb ? B.pts.length - 1 : 0;
    assert.ok(A.pts[ia]!.distanceTo(B.pts[ib]!) <= 0.1 * A.v.radius, `${a} and ${b} do not meet`);
    assert.ok(Math.abs(A.rad[ia]! * A.v.radius - B.rad[ib]! * B.v.radius) <= 0.03 * A.v.radius, `${a} and ${b} meet at different widths`);
    const ta = A.curve.getTangentAt(ea), tb = B.curve.getTangentAt(eb);
    const deg = Math.acos(Math.min(1, Math.abs(ta.dot(tb)))) * 180 / Math.PI;
    assert.ok(deg <= 6, `${a} and ${b} meet at a corner of ${deg.toFixed(1)} degrees`);
  }
});

test('the meander rule: a wave shallower than its vessel is wide is dropped; a wave deeper than it (a curve), a collateral, and a vein a collateral lands on keep theirs', () => {
  const edge = (id: string) => EDGES.find((e: { id: string }) => e.id === id)!;
  const path = (len: number): [number, number][] => Array.from({ length: 64 }, (_, i) => [(len * i) / 63, 0]);
  const T = { EDGES, dMinOf };
  // the cava's right atrium column and the right hepatic vein: calm
  for (const id of ['IVCS_RA', 'SVC_RA', 'RHV_IVC']) assert.equal(meanderWanted(edge(id), path(340), T), false, id);
  assert.equal(meanderWanted(edge('V_UP'), path(80), T), false, 'V_UP');
  // a thin vein with a long course bends by many of its calibres: a curve, it keeps its wave
  assert.equal(meanderWanted(edge('EPI_SVC'), path(990), T), true);
  // a collateral is tortuous by nature
  assert.equal(meanderWanted(edge('C1a'), path(255), T), true);
  // the one named exception, and why (the cava's hepatic-vein skin planner)
  assert.ok(MEANDER_KEPT.has('IVC_IS'));
  assert.deepEqual([...MEANDER_KEPT].sort(), ['IVC_IS', 'LHV_IVC', 'MHV_IVC'], 'no exception without a reason written next to it');
  // a vein a collateral or shunt ends on keeps the course the end was drawn against; one nothing lands on does not
  const r = calibreOf(edge('IVC_IS_1'), T), vein = path(340);
  assert.equal(hostsLanding([[170, 1.5 * r]], vein, r), true, 'an end 1.5 radii off the middle of the vein lands on it');
  assert.equal(hostsLanding([[170, 6 * r]], vein, r), false, 'an end 6 radii away does not');
  assert.equal(hostsLanding([[0, 0]], vein, r), true, 'an end at the vein\'s own node counts: the slope the wave gives there is what the collateral leaves against');
});

test('the azygos arch comes down to the superior cava on one gentle slope: no dive at the camera at the weld, and the azygos node keeps its depth', () => {
  assert.ok(SVC_TRIBUTARY_IDS.has('AZY_SVC'));
  const az = NETWORK_BY_ID.get('AZY_SVC')!, p = coursesOf(az, REST)[0]!.pts, n = p.length;
  // it ends on the cava's plane and starts on its own (the node the coronary and lumbar collaterals land on keeps its depth, or their wall skin is dropped)
  // (the placed anatomy has no tier planes: every vessel has its own depth, so the arch is held to the depth the superior cava's course has where it lands, and the AZY node to the depth its other vessels meet it at;
  //  the 2D tiers 'back' -0.02 and 'net' 0.02 this test once named are the old figure's)
  const svcAt = (q: readonly (readonly number[])[]) => q.reduce((b, x) => (Math.hypot(x[0]! - p[n - 1]![0], x[1]! - p[n - 1]![1]) < Math.hypot(b[0]! - p[n - 1]![0], b[1]! - p[n - 1]![1]) ? x : b));
  const cavaZ = svcAt(coursesOf(NETWORK_BY_ID.get('SVC_RA_1')!, REST)[0]!.pts)[2]!;
  assert.ok(Math.abs(p[n - 1]![2] - cavaZ) <= 0.0085, `the arch ends at ${p[n - 1]![2]}, the superior cava there is at ${cavaZ} (the tuck behind the cava's wall is allowed)`);
  // (the vessel the arch runs on from: the ascending lumbar collateral C9 is the azygos' origin end to end; the varices' drain C1b welds into the azygos' side higher up the arch, so its end is at the wall's depth there, not the node's)
  const atNode = NETWORK.filter((v) => RUN_ONS.some((r) => (r.a === az.id && r.ia === 0 && r.b === v.id) || (r.b === az.id && r.ib === 0 && r.a === v.id))).map((v) => { const q = coursesOf(v, REST)[0]!.pts; return (v.to === az.from ? q[q.length - 1]! : q[0]!)[2]; });
  assert.ok(atNode.length > 0 && atNode.every((z) => Math.abs(z - p[0]![2]) <= 0.0085), `the azygos node keeps one depth: the arch starts at ${p[0]![2]}, its other vessels meet it at ${atNode.join(' ')}`);
  // ONE GENTLE SLOPE: no stretch of it, over a tenth of its run, changes depth by more than 1.25 times the arch's own mean slope (no dive: the 2D figure's dove 0.047 in 0.045, 1.0 of its run at the weld, against a mean of about 0.3),
  // and the tenth at the weld by no more than 0.3 of its run (17 degrees). (The placed arch climbs from the azygos by the spine to the superior cava's back wall, 0.054 forward over 0.127 of run, 0.43 on the mean: the anatomy's own
  // arch over the right bronchus, approved in the frozen placement. The 2D test held every tenth to 0.3, a number for its two tier planes 0.04 apart.)
  let runAll = 0;
  for (let k = 1; k < n; k++) runAll += Math.hypot(p[k]![0] - p[k - 1]![0], p[k]![1] - p[k - 1]![1]);
  const mean = Math.abs(p[n - 1]![2] - p[0]![2]) / runAll;
  let worst = 0, atWeld = 0;
  const step = Math.max(2, Math.floor(n / 10));
  for (let i = 0; i + step < n; i++) {
    let run = 0;
    for (let k = i + 1; k <= i + step; k++) run += Math.hypot(p[k]![0] - p[k - 1]![0], p[k]![1] - p[k - 1]![1]);
    const sl = Math.abs(p[i + step]![2] - p[i]![2]) / run;
    worst = Math.max(worst, sl);
    if (i + step === n - 1) atWeld = sl;
  }
  assert.ok(worst <= 1.25 * mean, `the azygos arch dives ${worst.toFixed(2)} of its run somewhere along it (its mean slope is ${mean.toFixed(2)})`);
  assert.ok(atWeld <= 0.3, `it dives ${atWeld.toFixed(2)} of its run onto the superior cava`);
});
