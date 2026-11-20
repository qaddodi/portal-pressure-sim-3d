// The running stitch at a surgical shunt's sewn ends (2D anastomoses, suture-marks.js seamTable / seamDashes): dashes along the curve where the host's wall crosses the shunt; nothing where the shunt is the vein itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEWN_IDS, seamsFor, seamCurvesOf, seamAtA } from '../src/scene/vessels/seams.ts';

test('every sewn shunt has a seam a few units in from each end, never past the middle of the shunt, with a dash count', () => {
  for (const id of SEWN_IDS) {
    for (const s of seamCurvesOf(id)) {
      assert.ok(s, `${id} has a seam at both ends`);
      for (const a of [-0.97, 0, 0.97]) { const d = seamAtA(s!, a); assert.ok(Number.isFinite(d) && d > 0 && d < 80, `${id} at ${a}: ${d}`); }
      assert.ok(s!.n === 0 || (s!.n >= 2 && s!.dash > 0 && s!.dash <= 1 && s!.per >= s!.dash), `${id}: dashes ${s!.n} ${s!.dash} ${s!.per}`);
    }
  }
});

test('a seam that meets a host at a slant is a slanted curve, not a ring (the wall crosses the shunt at a different distance on each side), and a straight one is flat', () => {
  const slants = SEWN_IDS.flatMap((id) => [...seamCurvesOf(id)]).filter((s) => s && s.n > 0).map((s) => Math.abs(seamAtA(s!, 0.9) - seamAtA(s!, -0.9)));
  assert.ok(slants.length >= 4, 'the seams found on a host');
  assert.ok(Math.max(...slants) > 0.3, `some seam leans across the shunt: ${slants.map((x) => x.toFixed(2))}`);
});

test('the Warren shunt\'s start and an end-to-side portocaval shunt\'s start carry no stitches (the vein itself); a side-to-side portocaval shunt is sewn at both', () => {
  assert.equal(seamsFor('S_DSR', false)[0], null); assert.ok(seamsFor('S_DSR', false)[1]);
  assert.equal(seamsFor('S_PC', false)[0], null); assert.ok(seamsFor('S_PC', true)[0]);
  assert.ok(seamsFor('S_MC', false)[0] && seamsFor('S_MC', false)[1]);
});
