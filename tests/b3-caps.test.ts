// Round caps only at free ends (atlas-look-plan §3.2, WP3): where a vessel runs on into another the tubes meet end to end, so there is no ball of ink and no second layer in the veil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';

const byId = new Map(MAPPED.map((v) => [v.id, v]));

test('the pieces of one cut vein, which meet end to end, have no cap where they meet; their free ends keep theirs', () => {
  const a = byId.get('RHV_IVC')!, b = byId.get('RHV_IVC_1')!;
  const joined = (v: typeof a) => v.joined ?? [false, false];
  const shared = a.to === b.from ? [1, 0] : a.from === b.to ? [0, 1] : null;
  assert.ok(shared, 'the two pieces share a node');
  assert.equal(joined(a)[shared![0]!], true); assert.equal(joined(b)[shared![1]!], true);
  // (restated for the placed anatomy, the only one now: the far end of the outer piece is the vein's tip in the liver, where the hidden sinusoid bed's venule (POST_R_RHV) meets the node, so the
  //  network marks that node joined; the vein is cut at its split there (liver-branches.ts) and its tip is built free and capped. What is drawn is the course, so the far ends are read from it)
  const free = (v: typeof a, end: number) => coursesOf(v, REST)[0]!.capless?.[end] !== true;
  assert.ok(free(a, 1 - shared![0]!) && free(b, 1 - shared![1]!), 'the far ends are free');
  for (const [v, end] of [[a, shared![0]!], [b, shared![1]!]] as const) assert.equal(coursesOf(v, REST)[0]!.capless?.[end], true, `${v.id}: no cap where the pieces meet`);
});

test('a capless end builds its cap at a hair and rk 0 (never drawn); a free end builds a round cap at the tube\'s own last-ring radius', () => {
  let capless = 0, round = 0;
  for (const v of MAPPED) {
    const cs = coursesOf(v, REST), c = cs[0]!;
    const b = buildTubes(cs, tubularOf(v, 16), v.radius), run = b.runs[0]!, rk = b.geometry.getAttribute('rk');
    for (let end = 0; end < 2; end++) {
      const at = run.capStart + end * run.capCount;
      const ringAt = run.tubeStart + (end ? run.tubular : 0) * (run.radial + 1);
      if (c.capless?.[end]) { capless++; assert.equal(rk.getX(at), 0, `${v.id} end ${end}`); }
      else if (c.radius > 0) { round++; assert.ok(Math.abs(rk.getX(at) - rk.getX(ringAt)) < 1e-6 || v.flare?.[end], `${v.id} end ${end}: the cap's radius is the last ring's`); }
    }
  }
  assert.ok(capless > 10, `${capless} joined ends`);
  assert.ok(round > 10, `${round} free ends`);
});
