// The hepatic artery runs BETWEEN the cava and the portal vein: behind the portal vein, in front of the cava (Mohammad, 20 Nov: "fix the hepatic artery to be between the IVC and PV").
// The tiers (frame2d.ts TIER_Z) said so, but a round tube's front stands its radius in front of its axis and the cava (radius 0.027 at z -0.02) bulged past the artery (z 0, radius 0.005):
// on screen the artery went under the cava. The vessel vertex shader now writes the axis's depth plus TUBE_DEPTH_SHARE of the bulge; these tests compute the depth it writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { TIER_Z } from '../src/scene/frame2d.ts';
import { TUBE_DEPTH_SHARE, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

/** The depth (scene z toward the viewer) a pixel of a tube writes at `lat` of its radius from the axis (-1 to 1): the axis's depth plus the share of the round bulge the shader keeps (the twin of the vertex shader's mix). */
const written = (z: number, r: number, lat: number): number => z + TUBE_DEPTH_SHARE * r * Math.sqrt(Math.max(0, 1 - lat * lat));
const net = MAPPED.filter((v) => !v.feeder);
const axisZ = (v: (typeof net)[number]): number => Math.max(...v.pts.map((p) => p[2]));
const named = (re: RegExp) => net.filter((v) => re.test(String(v.label)));

test('the vertex shader moves a tube\'s depth to its axis\'s plus a share of the bulge, along the pixel\'s own ray', () => {
  assert.match(VESSEL_VS, /c\.z = mix\(cc\.z \/ cc\.w, c\.z \/ c\.w, [0-9.]+\) \* c\.w;/);
  assert.ok(TUBE_DEPTH_SHARE > 0 && TUBE_DEPTH_SHARE <= 0.2, `${TUBE_DEPTH_SHARE}: under a fifth of the radius, over zero so two tubes of one tier still sort`);
  assert.ok(VESSEL_VS.indexOf('c.z = mix(') < VESSEL_VS.indexOf('gl_Position = c;'));
});

test('the hepatic artery is in front of the cava and behind the portal vein, wherever they cross (every lateral position of each)', () => {
  const ivc = named(/^IVC$|^Inferior vena cava/i), art = named(/hepatic artery/i), pv = named(/^Portal vein$|^Right portal vein$|^Left portal vein$/);
  assert.ok(ivc.length >= 3 && art.length >= 3 && pv.length >= 4, `${ivc.length} cava, ${art.length} artery, ${pv.length} portal pieces`);
  for (const a of art) for (const c of ivc) {
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const la = -1 + i / 10, lc = -1 + j / 10;
      assert.ok(written(axisZ(a), a.radius, la) > written(axisZ(c), c.radius, lc), `${a.id} (${la.toFixed(1)}) is behind ${c.id} (${lc.toFixed(1)})`);
    }
  }
  for (const a of art) for (const p of pv) {
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const la = -1 + i / 10, lp = -1 + j / 10;
      assert.ok(written(axisZ(a), a.radius, la) < written(axisZ(p), p.radius, lp), `${a.id} (${la.toFixed(1)}) is in front of ${p.id} (${lp.toFixed(1)})`);
    }
  }
});

test('every tier is in front of the tiers below it, whatever the tubes\' widths: the tiers\' order is the depth the shader writes (the arteries, the cava, the hepatic veins, the portal tree, the shunts)', () => {
  const tiers = Object.keys(TIER_Z) as (keyof typeof TIER_Z)[];
  const byTier = new Map<string, typeof net>();
  for (const v of net) byTier.set(v.tier, [...(byTier.get(v.tier) ?? []), v]);
  const bad: string[] = [];
  for (const lo of tiers) for (const hi of tiers) {
    if (!(TIER_Z[lo] < TIER_Z[hi])) continue;
    for (const a of byTier.get(lo) ?? []) {
      const front = written(axisZ(a), a.radius, 0);
      // the tube's nearest pixel is still behind the axis of every vessel of a higher tier
      for (const b of byTier.get(hi) ?? []) if (!(front < axisZ(b))) bad.push(`${a.id} (${lo}, ${front.toFixed(4)}) is not behind ${b.id} (${hi}, axis ${axisZ(b).toFixed(4)})`);
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 8).join('\n'));
});

test('the old depth (the whole bulge) put the cava in front of the hepatic artery: the failure this fixes', () => {
  const c = named(/^IVC$/)[0]!, a = named(/hepatic artery/i)[0]!;
  assert.ok(axisZ(c) + c.radius > axisZ(a), 'with the full bulge the cava front stood past the artery axis');
  assert.ok(written(axisZ(c), c.radius, 0) < axisZ(a), 'with the share it is behind');
});
