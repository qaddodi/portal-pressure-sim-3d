// Braid strands that land on a host's wall fan out and are cut at the wall (Mohammad, 22 Nov: "retroperitoneal veins aren't welded into the IVC ... they should just fan out with smooth gradient and seamless joint and each fan fades").
// Root cause: the 2D braid brings every strand back to the trunk's one point and a sewn end sinks to the host's axis, so the strands piled into one pointed wedge inside the faint cava, outlines crossing; and the cava's cut-at-the-wall,
// cava colour and cava opacity rule (shaders.ts cavaCut) was keyed to a list of hepatic veins, so the retroperitoneal collateral (which fades into the cava, fades.ts ivcJoinSpan) had none of it.
// Node only. Run: node --test tests/strand-fan.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAN_PITCH, fanEnd, leaveAsBundle } from '../src/scene/vessels/strand-fan.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { braidRootEnds } from '../src/scene/vessels/skin/braid-arm.ts';
import { cavaMateOf, neighbourAttr } from '../src/scene/vessels/neighbour.ts';
import { cavaJoinShare, ivcJoinSpan, landsOnCava, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';

type V = [number, number, number];
/** three strands that leave one point side by side and meet again at the other: the 2D braid */
const braid = (): V[][] => [-1, 0, 1].map((k) => Array.from({ length: 40 }, (_, i): V => { const t = i / 39; return [t, k * 0.05 * Math.sin(Math.PI * t), 0]; }));
const endOf = (p: readonly V[], end: 0 | 1): V => p[end ? p.length - 1 : 0]!;

test('fanEnd lands the strands side by side along the host, in the order they come in, and leaves them alone beyond its reach', () => {
  const s = braid(), r = 0.004, out = fanEnd(s, 1, [0, 1, 0], r);
  const ys = out.map((p) => endOf(p, 1)[1]).sort((a, b) => a - b);
  assert.ok(Math.abs(ys[1]! - ys[0]! - FAN_PITCH * r) < 0.05 * FAN_PITCH * r && Math.abs(ys[2]! - ys[1]! - FAN_PITCH * r) < 0.05 * FAN_PITCH * r, 'the landings are one pitch apart');
  assert.ok(out.every((p, i) => Math.abs(endOf(p, 1)[0] - endOf(s[i]!, 1)[0]) < 0.3 * FAN_PITCH * r), 'they land on the line across the host the strands came to, not further along');
  // the strand that lay lower comes in lower: no crossing added at the wall
  assert.ok(endOf(out[0]!, 1)[1] < endOf(out[1]!, 1)[1] && endOf(out[1]!, 1)[1] < endOf(out[2]!, 1)[1]);
  // the far half is untouched, and the move eases (no point jumps by more than the pitch over a step)
  assert.deepEqual(out.map((p) => p[0]), s.map((p) => p[0]));
  out.forEach((p) => p.forEach((q, i) => { if (i > 1) assert.ok(Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) < 0.06, 'no kink'); }));
});

test('a host that runs along the way in, or one strand, changes nothing; a bundle is told from a braid end', () => {
  const s = braid();
  assert.deepEqual(fanEnd(s, 1, [1, 0, 0], 0.004), s, 'host along the strands: nothing to fan along');
  assert.deepEqual(fanEnd([s[0]!], 1, [0, 1, 0], 0.004), [s[0]]);
  const leave = [0, 0.4, -0.4].map((k) => Array.from({ length: 40 }, (_, i): V => [i / 39, k * 0.001 * Math.min(1, i / 39 * 20), 0]));
  assert.ok(leaveAsBundle(leave, 0, 0.01), 'strands that part only late leave as one bundle');
  assert.ok(!leaveAsBundle(s, 1, 0.004), 'strands a pitch apart at the end do not');
});

test('the real network: the retroperitoneal veins land on the cava as three separate strands, the end a skin welds is untouched', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    const v = NETWORK_BY_ID.get('C7')!, cs = coursesOf(v, REST), strands = cs.slice(1);
    assert.equal(strands.length, 3);
    const host = cs[0]!.sewn?.[1];
    assert.ok(host?.dir, 'the end on the cava knows the host\'s direction');
    const ends = strands.map((c) => endOf(c.pts as V[], 1)), along = host!.dir!;
    const t = ends.map((p) => p[0] * along[0] + p[1] * along[1] + p[2] * along[2]).sort((a, b) => a - b);
    assert.ok(t[1]! - t[0]! > 1.5 * strands[0]!.radius && t[2]! - t[1]! > 1.5 * strands[0]!.radius, `the three strands land ${((t[1]! - t[0]!) / strands[0]!.radius).toFixed(1)} and ${((t[2]! - t[1]!) / strands[0]!.radius).toFixed(1)} of their own radii apart`);
    const start = strands.map((c) => c.pts[0]!);
    for (const p of start) assert.ok(Math.hypot(p[0] - start[0]![0], p[1] - start[0]![1], p[2] - start[0]![2]) < 1e-9, 'the end a skin welds still leaves the node as one bundle');
    assert.deepEqual(braidRootEnds(v), [0], 'and it is still the only end the skin takes');
  } finally { setSmoothJoins(was); }
});

test('every braid end that lands on a host and is not a bundle is fanned, never a vessel by name', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    for (const v of NETWORK) {
      if (v.id === 'C8' || v.id === 'C5' || v.plan?.kind !== 'coil' || !v.plan.strands) continue;
      const cs = coursesOf(v, REST), strands = cs.slice(1);
      if (strands.length < 2) continue;
      for (const end of [0, 1] as const) {
        const e = cs[0]!.sewn?.[end];
        if (!e?.dir || braidRootEnds(v).includes(end)) continue;
        const p = strands.map((c) => endOf(c.pts as V[], end ? 1 : 0)) ;
        const spread = Math.max(...p.map((a) => Math.max(...p.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])))));
        assert.ok(spread > 1.5 * strands[0]!.radius, `${v.id} end ${end}: its strands land ${(spread / strands[0]!.radius).toFixed(1)} radii apart`);
      }
    }
  } finally { setSmoothJoins(was); }
});

test('the retroperitoneal collateral takes the cava\'s cut-at-the-wall rule like a hepatic vein, keyed by where it ends', () => {
  assert.ok(landsOnCava('C7') && ivcJoinSpan('C7') > 0);
  assert.ok(!landsOnCava('RHV_IVC') && opensIntoCava('RHV_IVC'), 'a hepatic vein is the old rule, untouched');
  assert.ok(!landsOnCava('S_PC') && !landsOnCava('C9') && !landsOnCava('C1b'), 'a shunt has a junction skin; a collateral that does not end on the cava has no cava to take');
  assert.equal(cavaMateOf('C7'), 'ILI_IVC_1');
  assert.equal(cavaJoinShare('C7'), 0);
  assert.equal(cavaJoinShare('RHV_IVC'), 1);
  assert.equal(cavaJoinShare('LRV_IVC'), 0);
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    const v = NETWORK_BY_ID.get('C7')!, g = buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor('C7')), v.radius).geometry;
    const pos = g.getAttribute('position').array as Float32Array, nb = neighbourAttr('C7', pos)!;
    assert.ok(nb, 'every vertex of the strands knows where it stands against the cava');
    let inside = 0, outside = 0;
    for (let i = 0; i < pos.length / 3; i++) { const r = nb[2 * i + 1]!; if (r > 0 && Math.abs(nb[2 * i]!) < r) inside++; else outside++; }
    assert.ok(inside > 20, `the part of the strands inside the lumen (${inside} vertices) is what the shader cuts`);
    assert.ok(inside < 0.25 * (inside + outside), `and it is only the end (${inside} of ${inside + outside}): the rest of the strands is outside the cava`);
  } finally { setSmoothJoins(was); }
});
