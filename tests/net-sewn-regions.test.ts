// J3 (sewn ends as ray-marched regions, ?geom=net&junc=sdf): a sewn end is a region of its own (the arm's bare capsule, then the host's capsule and its run-on partner's), written only under the flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEWN_HOST_R, SEWN_REACH_R, sewnRegions } from '../src/scene/vessels/net/sewn.ts';
import { REGION_HEAD, REGION_PTS, REGION_TEXELS, regionTexture } from '../src/scene/vessels/net/regions.ts';
import { edgeRegions, JUNC_GEOM_VS } from '../src/scene/vessels/net/junc-sdf.ts';
import { NET_CAP_VS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { makeSkeleton } from './net-lib.ts';
import type { FixEdge } from './net-lib.ts';

const lin = (a: number, b: number) => (u: number): number => a + (b - a) * u;
const perm = (id: string): boolean => id.startsWith('TR');
const landing = (collateral = 'C9') => makeSkeleton([{ id: 'N', runOn: ['TR0', 'TR1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
  { id: 'TR0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
  { id: 'TR1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
  { id: collateral, from: 'N', to: 'c', curve: (u) => [0, 3 * u, 0], rad: lin(0.03, 0.03), bones: 60 },
] as FixEdge[]);

test('a collateral landing on a split host is one region: its bare arm capsule first (point 0 at the host), then the host\'s two pieces as mates', () => {
  const skel = landing(), rs = sewnRegions(skel, [2], perm);
  assert.equal(rs.length, 1);
  const r = rs[0]!;
  assert.equal(r.arms, 1); assert.equal(r.hostFrom, 1); assert.equal(r.bare, 1);
  assert.equal(r.vertCount, 0);
  assert.equal(r.caps.length, 3);
  // the arm: out from the host along its own edge, reaching the collar's reach (plain tube beyond the cut plane)
  const arm = r.caps[0]!.bones.map((b) => skel.bones[b]!);
  assert.ok(arm.every((b) => b.edge === 2));
  assert.equal(arm[0]!.pos[0][1], 0);
  for (let i = 1; i < arm.length; i++) assert.ok(arm[i]!.pos[0][1] >= arm[i - 1]!.pos[0][1] - 1e-12);
  assert.ok(arm[arm.length - 1]!.pos[0][1] >= SEWN_REACH_R * 0.1 - 1e-9, 'the arm\'s capsule runs on past the collar');
  // the host: both pieces of the trunk, joined as a run-on (mates), each at most SEWN_HOST_R radii from the landing
  assert.deepEqual(r.caps.slice(1).map((c) => skel.bones[c.bones[0]!]!.edge).sort(), [0, 1]);
  assert.equal(r.caps[1]!.mate, 2); assert.equal(r.caps[2]!.mate, 1);
  for (const c of r.caps.slice(1)) for (const b of c.bones) assert.ok(Math.abs(skel.bones[b]!.pos[0][0]) <= SEWN_HOST_R * 0.1 + 0.1);
  for (const c of r.caps) assert.equal(c.bones.length, REGION_PTS);
});

test('a permanent edge has no sewn region, an edge with no sewn end neither, and a name is one per end', () => {
  const skel = landing();
  assert.deepEqual(sewnRegions(skel, [0, 1], perm), []);
  assert.equal(sewnRegions(skel, [2], perm)[0]!.node, 'C9:sewn0');
});

test('the region texture carries the bare mask in texel 4.w, and the capsule pass reads it per capsule, so only the arm loses its collar', () => {
  const skel = landing(), rs = sewnRegions(skel, [2], perm), rt = regionTexture(rs, 0);
  assert.equal(rt.data[4 * (REGION_HEAD - 1) + 3], 1);
  assert.equal(rt.data.length, 4 * REGION_TEXELS);
  assert.equal(regionTexture([{ ...rs[0]!, bare: undefined }], 0).data[4 * (REGION_HEAD - 1) + 3], 0);
  assert.match(NET_CAP_VS, /netBare = float\(\(int\(texelFetch\(regionTex, ivec2\(4, rr\), 0\)\.w \+ 0\.5\) >> \(slot \/ 8\)\) & 1\);/);
  assert.match(NET_VS, /if \(netBare < 0\.5\) swell \*= sewnCollar\(/);
});

test('a host is no arm: a host with many sewn ends registers none of them, and each arm registers its own edge', () => {
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  const skel = makeSkeleton([{ id: 'N', runOn: ['TR0', 'TR1'] }, { id: 'a' }, { id: 'b' }, ...ids.map((_, i) => ({ id: `c${i}` }))], [
    { id: 'TR0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'TR1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
    ...ids.map((id, i): FixEdge => ({ id, from: 'N', to: `c${i}`, curve: (u) => [0.05 * i * u, 3 * u, 0.2 * (i - 2.5) * u], rad: lin(0.03, 0.03), bones: 40 })),
  ] as FixEdge[]);
  const rs = sewnRegions(skel, [2, 3, 4, 5, 6, 7], perm);
  assert.equal(rs.length, 6);
  const er = edgeRegions(skel, rs, rs.map((_, i) => i));   // (six sewn ends on one host: more than the four an edge may be an arm of, were the host one)
  assert.deepEqual([...er.subarray(0, 8)], new Array(8).fill(-1), 'the host edges register nothing');
  for (let k = 0; k < 6; k++) assert.equal(er[4 * (2 + k)], k);
});

test('a region whose narrowest arm has no radius is not marched (a sewn collateral that is not there)', () => {
  assert.match(JUNC_GEOM_VS, /rArm < 0\.02 \* rmax \? vec4\(0\.0\)/);
});
