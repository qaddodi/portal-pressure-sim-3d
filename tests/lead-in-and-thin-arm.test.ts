// Two ends Mohammad reported on 22 Nov, pinned at their root.
//  1. the azygos arch's left end (20 Nov "should fade out on the left"; 22 Nov "goes to a pinpoint, it shouldn't", then "should fade to the left, not end with a knob"): a free end that fades. The arch is carried on past the landing of the collaterals (starts.ts START_IN_ORGAN) and
//     fades in over that stretch (fades.ts, the standard lead-in), full width all along it: no point taper, no cap ball, and the ink on the body's alpha, so no line runs on past the fill (the open look).
//  2. "the superior epigastric going into the SVC": a thin branch at a skinned node ended 0.014 (two of its radii) behind the host's axis, so the skin's depth rule held it out of the outline at the host's front wall and the
//     host's ink ran across its mouth. At a skinned node a thin branch now ends on the host's axis (shape.ts fitEnds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { PHASE_2_NODES } from '../src/scene/vessels/skin/nodes.ts';

test('the azygos arch fades out to the left: alpha 0 at its free end rising to 1 at the landing, full width all the way, no pinpoint, over at least three diameters', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    const f = fadeOf('AZY_SVC', false)!;
    assert.ok(f && f.mode === 1 && f.a0 === 0 && f.a1 === 1 && f.from === 0 && f.to > 0, 'the standard lead-in: from nothing at the start to whole at the landing');
    const c = coursesOf(NETWORK_BY_ID.get('AZY_SVC')!, REST)[0]!;
    assert.ok(!c.point?.[0] && !c.point?.[1], 'no pinpoint: the width holds over the faded stretch');
    assert.ok(!c.taper?.[0] || c.taper[0] >= 1, 'no taper at the free end');
    let len = 0; const seg: number[] = [0];
    c.pts.forEach((p, i) => { if (i) { len += Math.hypot(p[0] - c.pts[i - 1]![0], p[1] - c.pts[i - 1]![1], p[2] - c.pts[i - 1]![2]); } seg.push(len); });
    const faded = f.to * len;
    assert.ok(faded >= 3 * 2 * c.radius, `the fade spans ${(faded / (2 * c.radius)).toFixed(1)} vessel diameters`);
    // (the stretch behind the landing is the carried-on one: the landing of the collaterals, the course's nearest point to the node, is at its end, where the alpha is 1)
    const node = [-0.42, 1.753]; let bd = Infinity, at = 0;
    c.pts.forEach((p, i) => { const d = Math.hypot(p[0] - node[0]!, p[1] - node[1]!); if (d < bd) { bd = d; at = seg[i]!; } });
    assert.ok(Math.abs(at - faded) <= 0.35 * faded, `the collaterals land where the arch is whole (the carry-on ends at ${(faded / (2 * c.radius)).toFixed(1)} diameters, the landing is at ${(at / (2 * c.radius)).toFixed(1)})`);
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
  assert.equal((src.match(/armData\[(i|k)\]\.x < 0\.0 \|\| keepOf\((i|k)\) < 0\.5/g) ?? []).length, 3, 'the hold-out share, the outline loop and the owner loop skip an arm that is not kept');
  assert.ok(src.includes('wMax = max(wMax, rawW(i) * keepOf(i))'), 'the seam band follows the kept arms only');
});
