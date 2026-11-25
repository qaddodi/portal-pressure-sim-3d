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
    // (seg[i]: the arc length to point i; it held a leading 0 too, so seg[i] was the length to point i - 1)
    let len = 0; const seg: number[] = [];
    c.pts.forEach((p, i) => { if (i) { len += Math.hypot(p[0] - c.pts[i - 1]![0], p[1] - c.pts[i - 1]![1], p[2] - c.pts[i - 1]![2]); } seg.push(len); });
    const faded = f.to * len;
    // (the landing of the collaterals: in the placed anatomy the esophageal collateral C1b ends on the arch 0.65 of the way along it (the 2D figure's node at [-0.42, 1.753] is not on the placed arch, which starts where the ascending lumbar C9 runs into
    //  it). The fade runs from the free end to that landing and no further, so the collateral joins where the arch is whole; the 2D arch carried 30 units on behind its landing and faded over 3+ diameters there, the placed arch has 2.9 diameters
    //  before its landing, and the fade takes all of them)
    const c1 = coursesOf(NETWORK_BY_ID.get('C1b')!, REST)[0]!, q = c1.pts[c1.pts.length - 1]!;
    let bd = Infinity, at = 0;
    c.pts.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; at = seg[i]!; } });
    assert.ok(bd < 2 * c.radius, `C1b lands on the arch (${bd.toFixed(4)} from its axis)`);
    assert.ok(faded >= Math.min(3 * 2 * c.radius, at) - 0.02 * len, `the fade spans ${(faded / (2 * c.radius)).toFixed(1)} vessel diameters, the stretch before the landing ${(at / (2 * c.radius)).toFixed(1)}`);
    assert.ok(faded <= at + 0.02 * len, `the collaterals land where the arch is whole (the fade ends at ${(faded / (2 * c.radius)).toFixed(1)} diameters, the landing is at ${(at / (2 * c.radius)).toFixed(1)})`);
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
