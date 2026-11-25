// The hepatic artery runs BETWEEN the cava and the portal vein: behind the portal vein, in front of the cava (Mohammad, 20 Nov: "fix the hepatic artery to be between the IVC and PV").
// The tiers (frame2d.ts TIER_Z) said so, but a round tube's front stands its radius in front of its axis and the cava (radius 0.027 at z -0.02) bulged past the artery (z 0, radius 0.005):
// on screen the artery went under the cava. The vessel vertex shader now writes the axis's depth plus TUBE_DEPTH_SHARE of the bulge; these tests compute the depth it writes.
// Since the cut-over (25 Nov) the anatomy is the approved placement: every course carries its own depth (anatomy/placed-network.ts PLACED_Z), no longer its tier's one plane, so a vessel's
// deepest point says nothing about another vessel it crosses (the cava climbs from the pelvis to the atrium through a range of depths). The checks below were written against the tier planes
// (a whole vessel's front against another's axis); they are restated at the crossings themselves: where two vessels overlap on the screen, the depth the shader writes there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { TUBE_DEPTH_SHARE, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { connected, screenOverlaps } from './helpers/crossings.ts';

/** The depth (scene z toward the viewer) a pixel of a tube writes at `lat` of its radius from the axis (-1 to 1): the axis's depth plus the share of the round bulge the shader keeps (the twin of the vertex shader's mix). */
const written = (z: number, r: number, lat: number): number => z + TUBE_DEPTH_SHARE * r * Math.sqrt(Math.max(0, 1 - lat * lat));
const net = MAPPED.filter((v) => !v.feeder);
const named = (re: RegExp) => net.filter((v) => re.test(String(v.label)));

test('the vertex shader moves a tube\'s depth to its axis\'s plus a share of the bulge, along the pixel\'s own ray', () => {
  assert.match(VESSEL_VS, /c\.z = mix\(cc\.z \/ cc\.w, c\.z \/ c\.w, [0-9.]+ \* \(1\.0 - circT\)\) \* c\.w;/);
  assert.ok(TUBE_DEPTH_SHARE > 0 && TUBE_DEPTH_SHARE <= 0.2, `${TUBE_DEPTH_SHARE}: under a fifth of the radius, over zero so two tubes of one tier still sort`);
  assert.ok(VESSEL_VS.indexOf('c.z = mix(') < VESSEL_VS.indexOf('gl_Position = c;'));
});

/** At every sample where `front` overlaps `back` on the screen, at every lateral position of each (-1 to 1 of its radius, `written`), the depth `front` writes is nearer than `back`'s; returns the misses and the overlap count. */
function inFront(front: (typeof net)[number], back: (typeof net)[number], share = TUBE_DEPTH_SHARE): { n: number; miss: string[] } {
  const miss: string[] = [], at = screenOverlaps(front, back);
  for (const { az, bz } of at) {
    // the nearest the back tube writes is its axis's own depth plus the whole share (lat 0); the farthest the front one writes is its axis (lat +-1)
    const near = bz + share * back.radius, far = written(az, front.radius, 1);
    if (!(far > near)) { miss.push(`${front.id} (axis ${az.toFixed(4)}) is not in front of ${back.id} (axis ${bz.toFixed(4)})`); break; }
  }
  return { n: at.length, miss };
}

test('the hepatic artery is in front of the cava and behind the portal vein, wherever they cross (every lateral position of each)', () => {
  const ivc = named(/^IVC$|^Inferior vena cava/i), art = named(/hepatic artery/i), pv = named(/^Portal vein$|^Right portal vein$|^Left portal vein$/);
  assert.ok(ivc.length >= 3 && art.length >= 3 && pv.length >= 4, `${ivc.length} cava, ${art.length} artery, ${pv.length} portal pieces`);
  let overCava = 0, underPortal = 0;
  const bad: string[] = [];
  for (const a of art) for (const c of ivc) { const r = inFront(a, c); overCava += r.n; bad.push(...r.miss); }
  for (const a of art) for (const p of pv) { const r = inFront(p, a); underPortal += r.n; bad.push(...r.miss); }
  // the placed artery crosses the cava twice on the screen (the common one, the left one) and runs under the left portal vein twice (the right one, the left one)
  assert.ok(overCava > 100 && underPortal > 100, `${overCava} samples over the cava, ${underPortal} under the portal vein: they do cross`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('wherever two vessels that do not join cross on the screen, the one whose axis is nearer is nearer at every lateral position of each: the share of the bulge never turns a crossing over, whatever the tubes\' widths', () => {
  // (Before the cut-over the tiers were the depth: this asked every tier to stand in front of the tiers below it. Placed, the depth is each course's own and the tiers no longer order it, so the
  //  same promise, that the shader's depth keeps the figure's over and under, is asked of every crossing.)
  const bad: string[] = [];
  let crossings = 0;
  for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
    const a = net[i]!, b = net[j]!;
    if (connected(a, b)) continue;
    const at = screenOverlaps(a, b);
    if (!at.length) continue;
    crossings++;
    for (const { az, bz } of at) {
      const [f, k, fz, kz] = az > bz ? [a, b, az, bz] : [b, a, bz, az];
      if (!(fz > kz + TUBE_DEPTH_SHARE * k.radius)) { bad.push(`${f.id} (${fz.toFixed(4)}) over ${k.id} (${kz.toFixed(4)}): its bulge (${(TUBE_DEPTH_SHARE * k.radius).toFixed(4)}) stands past`); break; }
    }
  }
  assert.ok(crossings > 5, `${crossings} crossings`);
  assert.deepEqual(bad, [], bad.slice(0, 8).join('\n'));
});

test('the old depth (the whole bulge) would turn a crossing over, and only the share keeps the nearer axis in front: the formula, with the real radii of two shunts that once crossed 0.013 apart', () => {
  // (Before the cut-over this was the cava bulging past the hepatic artery; placed, the gastrorenal shunt (C5) passed 0.013 behind the spontaneous splenorenal one (C6), round 18. C6 is bowed off its sibling since
  //  25 Nov (placed-network.ts SIBLINGS APART) and the two no longer overlap on the screen at all, so the pair is no longer a drawn crossing and the drawn crossings are judged by the test above. The claim itself is the
  //  shader's: a tube 0.013 nearer than another, over a back tube of C5's radius, is turned over by the whole bulge and not by the share.)
  const c5 = net.find((v) => v.id === 'C5')!, c6 = net.find((v) => v.id === 'C6')!;
  assert.ok(c5 && c6, 'both shunts are drawn');
  const gap = 0.013, bz = 0, az = bz + gap;
  const wholeBulgePutsBackInFront = bz + 1 * c5.radius >= az, shareKeepsFront = az > bz + TUBE_DEPTH_SHARE * c5.radius;
  assert.ok(wholeBulgePutsBackInFront, `the whole bulge of a ${c5.radius.toFixed(4)} tube passes a ${gap} gap`);
  assert.ok(shareKeepsFront, `the share (${TUBE_DEPTH_SHARE} of it) does not`);
  assert.ok(written(az, c6.radius, 1) > written(bz, c5.radius, 0), 'and the nearer axis stays in front at every lateral position');
  assert.equal(screenOverlaps(c5, c6).length, 0, 'C5 and C6 no longer overlap on the screen: the old closest call is gone');
});
