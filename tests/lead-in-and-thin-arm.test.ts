// Two ends Mohammad reported on 22 Nov, pinned at their root.
//  1. "azygos has a segment that's open": the arch is carried on past the landing of the esophageal and lumbar collaterals (starts.ts START_IN_ORGAN) and fades in; its free end is still an end, so it tapers to a point
//     and keeps its round cap (fades.ts leadInPoint), never a flat cut. At the landing the stretch is whole.
//  2. "the superior epigastric going into the SVC": a thin branch at a skinned node ended 0.014 (two of its radii) behind the host's axis, so the skin's depth rule held it out of the outline at the host's front wall and the
//     host's ink ran across its mouth. At a skinned node a thin branch now ends on the host's axis (shape.ts fitEnds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { leadInPoint, FREE_START_FADE } from '../src/scene/vessels/fades.ts';
import { PHASE_2_NODES } from '../src/scene/vessels/skin/nodes.ts';
import { radiusAtU, TIP_K } from '../src/scene/vessels/tubes.ts';

test('the azygos lead-in tapers to a point at its free start and keeps its own end', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    assert.ok(FREE_START_FADE.AZY_SVC != null);
    const c = coursesOf(NETWORK_BY_ID.get('AZY_SVC')!, REST)[0]!;
    assert.equal(c.point?.[0], true, 'the free start tapers');
    assert.ok(!c.point?.[1], 'the end that runs into the cava does not');
    let len = 0; for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    const r0 = radiusAtU(c, 0, len), rLand = radiusAtU(c, 0.36, len);
    assert.ok(r0 <= c.radius * (TIP_K + 0.05), `the very start is a point (${r0})`);
    assert.ok(rLand >= c.radius * 0.97, `at the landing the arch is whole (${rLand} of ${c.radius})`);
  } finally { setSmoothJoins(was); }
});

test('leadInPoint leaves every other vessel, and the plain tube without smooth joins, as they were', () => {
  assert.deepEqual(leadInPoint('C9', [false, true], true), [false, true]);
  assert.equal(leadInPoint('C9', undefined, true), undefined);
  assert.equal(leadInPoint('AZY_SVC', undefined, false), undefined);
  assert.deepEqual(leadInPoint('AZY_SVC', [false, true], true), [true, true]);
});

test('a thin branch at a skinned node ends on the host axis: the epigastric vein into the SVC', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    assert.ok(PHASE_2_NODES.has('SVC_E'));
    const epi = coursesOf(NETWORK_BY_ID.get('EPI_SVC')!, REST)[0]!, host = coursesOf(NETWORK_BY_ID.get('SVC_RA_1')!, REST)[0]!;
    const e = epi.pts[epi.pts.length - 1]!, h = host.pts[host.pts.length - 1]!;
    assert.ok(Math.abs(e[2] - h[2]) <= 0.0025, `ends at the host's depth (${e[2]} against ${h[2]})`);
    assert.ok(Math.abs(e[0] - h[0]) < 0.002, 'ends on the host axis');
  } finally { setSmoothJoins(was); }
});
