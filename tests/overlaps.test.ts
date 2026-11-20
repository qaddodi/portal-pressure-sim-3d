// The inspector's overlap finder and the depth clearance that answers it (src/scene/vessels/overlaps.ts, clearance.ts; Mohammad 20 Nov: "show all the possible collaterals and shunts at once without too much overlap, and if there is we should be able to fix").
// ROOT CAUSE it pins: the figure is the 2D picture on tiers 0.015 to 0.02 apart whose ORDER is right, but its tubes are 0.01 to 0.03 in radius, so wherever two cross the tubes run through each other in a turned view (REX over the splenic vein and
// the left gastric, the azygos collateral under the right hepatic vein, the arteries over the cava). clearance.ts gives way in depth at each crossing. Whatever is left is a junction (a branch leaving its trunk, a bed starting in its vein),
// which the skins and forks own; nothing else may overlap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { JUNCTION_RUN, OVERLAP_K, findOverlaps, overlapRuns, sampleCourse } from '../src/scene/vessels/overlaps.ts';
import { CLEAR_MAX, clearAt, moverOf } from '../src/scene/vessels/clearance.ts';
import { REST, clearanceProfiles, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';

const withJoins = <T>(on: boolean, f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(on); try { return f(); } finally { setSmoothJoins(was); } };

test('with everything drawn no two tubes run through each other beyond a junction, with smooth joins on or off', () => {
  for (const on of [false, true]) {
    const o = withJoins(on, () => findOverlaps());
    assert.deepEqual(o.map((x) => `${x.a} x ${x.b} (${Math.round(x.depth * 100)}% deep)`), [], `smooth joins ${on}`);
  }
});

test('the crossings that did overlap are cleared in depth, and only in the middle of the vessel that gives way', () => {
  const at = (id: string) => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts;
  const rex = at('REX'), tier = NETWORK_BY_ID.get('REX')!.tier;
  assert.equal(tier, 'over');
  assert.ok(Math.max(...rex.map((p) => p[2])) > 0.06, 'REX rises over the splenic vein and the left gastric (its tier alone is 0.05)');
  assert.ok(Math.min(...at('C9').map((p) => p[2])) < -0.03, 'the azygos collateral goes under the right hepatic vein instead of through it');
  for (const id of ['REX', 'C9', 'A_HR', 'A_HL', 'A_HEP', 'C5']) {
    const p = at(id), v = NETWORK_BY_ID.get(id)!;
    assert.ok(p.every((q) => q.every(Number.isFinite)), id);
    // the ends keep the node's depth: a vessel with no clearance has the same end z as its twin built with none (the first and last ring)
    const own = withJoins(false, () => coursesOf(v, REST)[0]!.pts);
    assert.ok(Math.abs(own[0]![2] - p[0]![2]) < 0.02 || id !== 'REX', id);
  }
});

test('every clearance is bounded, goes to nothing at both ends, and gives way to the side the vessel already lies on', () => {
  const m = withJoins(false, () => clearanceProfiles());
  assert.ok(m.size >= 3 && m.size <= 12, `${m.size} vessels give way`);
  for (const [id, p] of m) {
    assert.ok(p.dz.every((d) => Math.abs(d) <= CLEAR_MAX + 1e-9), `${id} within ${CLEAR_MAX}`);
    assert.ok(Math.abs(p.dz[0]!) < 1e-6 && Math.abs(p.dz[p.dz.length - 1]!) < 1e-6, `${id} keeps its ends`);
    assert.ok(Math.abs(clearAt(p, 0)) < 1e-6 && Math.abs(clearAt(p, 1)) < 1e-6);
  }
});

test('who gives way: the growing vessel, else the thinner one', () => {
  const g = (id: string) => NETWORK_BY_ID.get(id)!;
  assert.equal(moverOf(g('REX'), g('SV_CONF')), 'a');
  assert.equal(moverOf(g('SV_CONF'), g('REX')), 'b');
  assert.equal(moverOf(g('A_HR'), g('IVC_IS_1')), 'a');
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
