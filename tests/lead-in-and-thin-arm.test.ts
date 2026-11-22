// Two ends Mohammad reported on 22 Nov, pinned at their root.
//  1. "azygos has a segment that's open" / "goes to a pinpoint, it shouldn't": the arch is carried on past the landing of the esophageal and lumbar collaterals (starts.ts START_IN_ORGAN). A faded flat end read as open and a taper as a
//     spike, so the stub is short, solid and rounded like any vein's end (fades.ts SOLID_LEAD_IN).
//  2. "the superior epigastric going into the SVC": a thin branch at a skinned node ended 0.014 (two of its radii) behind the host's axis, so the skin's depth rule held it out of the outline at the host's front wall and the
//     host's ink ran across its mouth. At a skinned node a thin branch now ends on the host's axis (shape.ts fitEnds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SOLID_LEAD_IN, fadeOf } from '../src/scene/vessels/fades.ts';
import { PHASE_2_NODES } from '../src/scene/vessels/skin/nodes.ts';

test('the azygos arch ends in a plain rounded stub behind the landing: solid, no fade, no taper, long enough for the collaterals\' hole', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    assert.ok(SOLID_LEAD_IN.has('AZY_SVC'));
    assert.equal(fadeOf('AZY_SVC', false), null, 'no fade-in over the stub: it would read as an open end');
    const c = coursesOf(NETWORK_BY_ID.get('AZY_SVC')!, REST)[0]!;
    assert.ok(!c.point?.[0] && !c.point?.[1], 'a round cap, not a pinpoint');
    let len = 0, lead = 0; const node = [-0.42, 1.753];
    c.pts.forEach((p, i) => { if (i) len += Math.hypot(p[0] - c.pts[i - 1]![0], p[1] - c.pts[i - 1]![1], p[2] - c.pts[i - 1]![2]); });
    let bd = Infinity, at = 0, run = 0;
    c.pts.forEach((p, i) => { if (i) run += Math.hypot(p[0] - c.pts[i - 1]![0], p[1] - c.pts[i - 1]![1], p[2] - c.pts[i - 1]![2]); const d = Math.hypot(p[0] - node[0]!, p[1] - node[1]!); if (d < bd) { bd = d; at = run; } });
    lead = at;
    assert.ok(lead >= 3 * c.radius, `the stub behind the landing holds the hole and the cap (${(lead / c.radius).toFixed(1)} radii)`);
    assert.ok(lead <= 7 * c.radius, `and is a stub, not a spike or a limb (${(lead / c.radius).toFixed(1)} radii)`);
    assert.ok(len > lead);
  } finally { setSmoothJoins(was); }
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

test('the skin leaves a growing arm that is not there out of its outline, so a collapsed collateral\'s connection is not drawn (the ascending lumbar into the azygos)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  // the outline's two arm loops (skinSdPx, skinOwner) and the seam band's widest weight all read the keep flag (shaders.ts keepOf), as the mesh's own weights do
  assert.equal((src.match(/armData\[(i|k)\]\.x < 0\.0 \|\| keepOf\((i|k)\) < 0\.5/g) ?? []).length, 2, 'both outline loops skip an arm that is not kept');
  assert.ok(src.includes('wMax = max(wMax, rawW(i) * keepOf(i))'), 'the seam band follows the kept arms only');
});
