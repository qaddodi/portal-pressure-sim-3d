// A vessel sewn onto a vein (2D SIDE_HOSTS / SINK / FLARED): narrowed to the host's caliber at that end, sunk inside the wall, flared at its heel. The Warren and portocaval shunts have their own rows; every other collateral, shunt and stent end that lands on a wall (within 1.5 radii of a host's axis) gets one generated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { endProfile, endProfileFor, endShare, shuntEnds, SHUNT_END_MIN } from '../src/scene/vessels/shunt-ends.ts';

const byId = new Map(MAPPED.map((v) => [v.id, v]));

test('the Warren and the portocaval shunt keep their own rows; a permanent vessel is never sewn; every collateral, shunt and stent that lands on a wall is, at that end', () => {
  assert.equal(shuntEnds('IVC_IS'), null, 'a vein is no sewn vessel');
  for (const id of ['S_MC', 'REX', 'TIPS', 'DIPS', 'C3', 'C9']) assert.ok(shuntEnds(id), `${id} lands on a wall and is sewn there`);
  // (C9 lands on the cava; its upper end, placed, runs on into the azygos's arch as one curve (anatomy/placed-network.ts WHOLE_PIECES azygos: C9 is the azygos's lower course), so it is a run-on there and is not
  //  sewn (tests/run-on-ends.test.ts). On the 2D figure it landed on the azygos's side wall.)
  assert.ok(endProfile('C9', 0), 'C9 lands on the cava');
  assert.equal(endProfile('C9', 1), null, 'C9 runs on into the azygos arch');
  assert.ok(endProfile('C3', 1), 'C3\'s far end lands on the epigastric vein\'s wall (tests/skin-grow.test.ts moves it onto the trunks\' common joint, 1.7 radii it stood off before), so it is sewn there');
  assert.deepEqual(endProfile('S_PC', 1), shuntEnds('S_PC')![1]);
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

test('the tube narrows toward the end inside its host, and its heel never stands wider than the host', () => {
  const v = byId.get('S_DSR')!, cs = coursesOf(v, REST), c = cs[0]!;
  assert.ok(c.sewn, 'the course carries its sewn ends');
  const plain = { ...c, sewn: undefined, taper: undefined }, sewn = { ...c, taper: undefined };
  const rk = (course: typeof c) => { const g = buildTubes([course], tubularOf(v, 32), v.radius); return { a: g.geometry.getAttribute('rk'), run: g.runs[0]! }; };
  const p = rk(plain), s = rk(sewn), n = p.run.tubular, ring = p.run.radial + 1;
  const at = (g: ReturnType<typeof rk>, k: number) => g.a.getX(g.run.tubeStart + k * ring);
  assert.ok(at(s, n) < at(p, n), 'the end inside the renal vein is narrower than the plain tube');
  // (28 Nov, Mohammad: a shunt draws 1x its vein or less, docs/approved/shunt-width.md: the renal end's heel flare is cut at the renal vein's width, and the shunt is wider than it, so the heel no longer stands past the plain tube)
  for (let k = 0; k <= n; k++) assert.ok(at(s, k) <= Math.max(at(p, k), c.sewn![1]!.hostR / v.radius) + 1e-6, `ring ${k}: the heel is no wider than the plain tube or the renal vein`);
});

test('a path made at run time (a custom shunt of the Circuit) is sewn at each end that lands on one of its hosts', () => {
  const host = { pts: [[0, 0, 0], [1, 0, 0]] as [number, number, number][], radius: 0.05 };
  const e = endProfileFor([[0.5, 0.06, 0], [0.5, 0.5, 0], [0.9, 0.9, 0]], [host])!;
  assert.ok(e[0] && !e[1]);
  assert.deepEqual(e[0], { hostR: 0.05, inside: true, sink: false, flare: true, capped: true, dir: [1, 0, 0] });   // (dir: the host's way at the landing, which fans a braid's strands out along it: strand-fan.ts)
  assert.equal(endProfileFor([[0.5, 0.5, 0], [0.9, 0.9, 0]], [host]), null);
});
