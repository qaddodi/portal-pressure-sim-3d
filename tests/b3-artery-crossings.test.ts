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
