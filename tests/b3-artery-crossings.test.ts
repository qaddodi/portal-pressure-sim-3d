// Mohammad, 20 Nov: "Artery cannot cross the veins"; the red arteriole strands into the sinusoid fans are not drawn; the caudate lobe's short veins are one clean smooth fan, not a worm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { FEEDERS_2D } from '../src/scene/vessels/coil.copied.ts';
import { cleanFeeders } from '../src/scene/vessels/starts.ts';

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

test('the caudate lobe\'s veins are a few smooth twigs: each a gentle bow, none wiggling', () => {
  const fan = NETWORK.find((v) => v.id.startsWith('CAUD~F'))!;
  const list = (fan.plan as unknown as { list: { pts: readonly (readonly [number, number])[]; fan: boolean }[] }).list.filter((f) => f.fan);
  assert.ok(list.length >= 2 && list.length <= 5, `${list.length} twigs`);
  assert.ok(list.length < FEEDERS_2D.CAUD!.filter((f) => f.fan).length, 'the thin tangle is gone');
  for (const f of list) {
    let len = 0, turn = 0, prev = 0;
    for (let i = 1; i < f.pts.length; i++) {
      const dx = f.pts[i]![0] - f.pts[i - 1]![0], dy = f.pts[i]![1] - f.pts[i - 1]![1];
      len += Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (i > 1) { let d = ang - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += Math.abs(d); }
      prev = ang;
    }
    const chord = Math.hypot(f.pts.at(-1)![0] - f.pts[0]![0], f.pts.at(-1)![1] - f.pts[0]![1]);
    assert.ok(len / chord < 1.1, `a twig is nearly straight (${(len / chord).toFixed(3)})`);
    assert.ok(turn < 0.6, `and turns one way, smoothly (${turn.toFixed(2)} rad in all)`);
  }
  assert.equal(cleanFeeders('AZY_SVC', FEEDERS_2D.AZY_SVC!).length, FEEDERS_2D.AZY_SVC!.length, 'only the caudate fan is redrawn');
});
