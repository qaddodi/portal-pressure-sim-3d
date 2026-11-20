// A surgical shunt sewn onto a vein (2D SIDE_HOSTS / SINK / FLARED): narrowed to the host's caliber at that end, sunk inside the wall, flared at its heel. Only the Warren and portocaval shunts have such ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { endShare, shuntEnds, SHUNT_END_MIN } from '../src/scene/vessels/shunt-ends.ts';

const byId = new Map(MAPPED.map((v) => [v.id, v]));

test('only the Warren and the portocaval shunt have sewn ends; the others are plain tubes as in 2D', () => {
  for (const id of ['S_MC', 'REX', 'TIPS', 'DIPS', 'IVC_IS']) assert.equal(shuntEnds(id), null, id);
  const w = shuntEnds('S_DSR')!, pc = shuntEnds('S_PC')!;
  assert.ok(w && pc);
  assert.equal(w[0]?.inside ?? false, false, 'the Warren start runs on from the divided splenic vein, not inside it');
  assert.equal(w[1]?.inside, true); assert.equal(w[1]?.flare, true, 'its renal end flares');
  assert.equal(pc[1]?.sink, true); assert.equal(pc[1]?.flare, true, 'the portocaval end sinks into the cava and flares');
});

test('the share of its width a shunt narrows to is the host\'s caliber, 0.4 at the least and 1 at the most', () => {
  const e = { hostR: 0.01, inside: true, sink: false, flare: true };
  assert.equal(endShare(null, 0.02), 1);
  assert.equal(endShare(e, 0.02), 0.5);
  assert.equal(endShare(e, 1), SHUNT_END_MIN);
  assert.equal(endShare({ ...e, hostR: 1 }, 0.02), 1);
});

test('the tube narrows toward the end inside its host, and flares in front of the wall', () => {
  const v = byId.get('S_DSR')!, cs = coursesOf(v, REST), c = cs[0]!;
  assert.ok(c.sewn, 'the course carries its sewn ends');
  const plain = { ...c, sewn: undefined, taper: undefined }, sewn = { ...c, taper: undefined };
  const rk = (course: typeof c) => { const g = buildTubes([course], tubularOf(v, 32), v.radius); return { a: g.geometry.getAttribute('rk'), run: g.runs[0]! }; };
  const p = rk(plain), s = rk(sewn), n = p.run.tubular, ring = p.run.radial + 1;
  const at = (g: ReturnType<typeof rk>, k: number) => g.a.getX(g.run.tubeStart + k * ring);
  assert.ok(at(s, n) < at(p, n), 'the end inside the renal vein is narrower than the plain tube');
  let flared = 0;
  for (let k = 0; k <= n; k++) if (at(s, k) > at(p, k) * 1.01) flared++;
  assert.ok(flared > 0, 'its heel is wider in front of the wall');
});
