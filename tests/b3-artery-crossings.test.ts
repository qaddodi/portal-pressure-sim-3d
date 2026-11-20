// Mohammad, 20 Nov: "Artery cannot cross the veins"; the red arteriole strands into the sinusoid fans are not drawn; the caudate lobe's fan (unconnected twigs in the liver) is not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';

const P = (id: string): [number, number][] => NETWORK_BY_ID.get(id)!.pts.map((p) => [x2d(p[0]), y2d(p[1])]);
const cross = (a: number[], b: number[], c: number[], d: number[]) => {
  const o = (p: number[], q: number[], r: number[]) => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

test('the hepatic artery crosses no vein (and an arterioportal shunt, which ends in a vein, is the only artery that meets one)', () => {
  const arts = NETWORK.filter((v) => !v.feeder && v.tone === 'artery' && v.kind !== 'shunt');
  assert.ok(arts.some((a) => a.id === 'A_HEP'), 'the trunk stays');
  for (const a of arts) {
    const pa = P(a.id);
    for (const v of NETWORK) {
      if (v.feeder || v.tone === 'artery' || v.kind === 'shunt') continue;
      const pv = P(v.id);
      for (let i = 1; i < pa.length; i++) for (let j = 1; j < pv.length; j++) assert.ok(!cross(pa[i - 1]!, pa[i]!, pv[j - 1]!, pv[j]!), `${a.id} crosses ${v.id}`);
    }
  }
});

test('the arterioles into the sinusoid fans are not drawn', () => {
  assert.ok(!NETWORK_BY_ID.has('A_HR') && !NETWORK_BY_ID.has('A_HL'));
});

test('no vein hangs unconnected in the middle of the liver: the caudate fan is not drawn', () => {
  assert.ok(!NETWORK.some((v) => v.id.startsWith('CAUD')));
});

test('the closed lumbar-azygos collateral is not a dotted pink thread through the sinusoid fan; other closed collaterals still are', async () => {
  const { presenceOf, NETWORK: N } = await import('../src/scene/vessels/network.ts');
  const f = { Q: new Array(200).fill(0), D: new Array(200).fill(0) } as never;
  const of = (id: string) => presenceOf(N.find((v) => v.id === id)!, f, { collaterals: true });
  assert.equal(of('C9'), 'hidden');
  assert.equal(of('C1a'), 'ghost');
});

test('the paraumbilical vein leaves the left portal branch as a filleted Y: thinner than the trunk, its fillet no wider than the trunk is at the node (no blunt stack of equal tubes)', async () => {
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  const c3 = B.get('C3')!, lpv = B.get('PVH_L_1')!, pre = B.get('PRE_L')!;
  assert.ok(c3.radius < 0.7 * lpv.radius, 'narrower than the left portal vein');
  const fl = c3.flare?.[0];
  assert.ok(fl, 'a fillet at its start');
  assert.ok(fl!.wall <= 0.8 * (lpv.radius + pre.radius) / 2 + 1e-9, 'fitted to the trunk\'s width at the node (the mean of the pair that runs on there), not its full width');
});

test('the cava, the hepatic veins and the right atrium lie in one plane: no S in depth (a side-tilted view showed one: Mohammad, 20 Nov)', async () => {
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  const { TIER_Z } = await import('../src/scene/frame2d.ts');
  const { ORGAN_Z } = await import('../src/scene/organs/z.ts');
  const { NODE_RISE } = await import('../src/scene/vessels/smooth-joins.ts');
  for (const id of ['IVC_IS_1', 'IVC_IS', 'IVCS_RA', 'SVC_RA', 'RHV_IVC', 'LRV_IVC']) {
    const z = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts.map((p) => p[2]);
    assert.ok(Math.max(...z) - Math.min(...z) < 0.02, `${id} is level`);
    assert.ok(Math.abs(z[0]! - TIER_Z.back) < 0.02, `${id} is on the cava's plane`);
  }
  assert.equal(NODE_RISE.get('RA')!.z, TIER_Z.back, 'the cava enters the atrium level');
  assert.ok(Math.abs(ORGAN_Z['heart-ra']! + 0.11 - TIER_Z.back) < 1e-9, 'the atrium (mesh centre 0.11) is centred on the same plane');
});

test('the sinusoid beds are not drawn: the portal branches fade out into the liver and the hepatic veins fade in from it (Mohammad, 20 Nov)', async () => {
  const { presenceOf, NETWORK: N } = await import('../src/scene/vessels/network.ts');
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  const f = { Q: new Array(200).fill(1), D: new Array(200).fill(5) } as never;
  for (const id of ['SIN_RR', 'SIN_LL', 'PRE_R', 'PRE_L', 'POST_R_RHV', 'POST_L_LHV']) assert.equal(presenceOf(N.find((v) => v.id === id)!, f, { collaterals: true }), 'hidden', id);
  for (const id of ['PVH_R_2', 'PVH_L_1']) { const x = fadeOf(id, false)!; assert.equal(x.mode, 1); assert.deepEqual([x.to, x.a0, x.a1], [1, 1, 0], `${id} ends in the liver's tissue`); }
  for (const id of ['RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']) { const x = fadeOf(id, false)!; assert.equal(x.mode, 1); assert.deepEqual([x.from, x.a0, x.a1], [0, 0, 1], `${id} begins in the liver's tissue`); }
});
