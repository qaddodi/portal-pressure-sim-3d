// The running stitch at a surgical shunt's sewn ends (2D anastomoses, suture-marks.js seamTable / seamDashes): dashes along the curve where the host's wall crosses the shunt; nothing where the shunt is the vein itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEWN_IDS, seamsFor, seamCurvesOf, seamAtA } from '../src/scene/vessels/seams.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { sewnHostIds } from '../src/scene/vessels/shunt-ends.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

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

// ROOT CAUSE of the Warren shunt's stitch running along the limb (23 Nov): the host of an end was the vein the end lies deepest in, and the collateral C6 ends at the same node and runs along the shunt, so its wall "crossed" the shunt 24 units
// along a tube 12.6 wide. A shunt whose host the table names (shunt-ends.ts ROWS) is sewn into that vein. The seam is a line round the shunt, not along it: its span along the tube is at most 1.2 of the tube's width, in the 2D rule and in 3D.
test('a seam drawn on a sewn end spans at most 1.2 of the tube\'s width along it, with smooth joins on (the 3D course) and off', () => {
  const was = smoothJoinsOn();
  try {
    for (const on of [false, true]) {
      setSmoothJoins(on);
      for (const id of SEWN_IDS) {
        const width = 2 * NETWORK_BY_ID.get(id)!.radius * UNITS_PER_SCENE;
        for (const sideToSide of [false, true]) for (const s of seamsFor(id, sideToSide)) {
          if (!s || s.n === 0) continue;
          const d = Array.from({ length: 41 }, (_, i) => seamAtA(s, -1 + i / 20));
          assert.ok(Math.max(...d) - Math.min(...d) <= 1.2 * width, `${id} (${on ? '3D' : '2D'}): ${(Math.max(...d) - Math.min(...d)).toFixed(1)} along a tube ${width.toFixed(1)} wide`);
        }
      }
    }
  } finally { setSmoothJoins(was); }
});

test('the Warren shunt\'s renal end is sewn into the renal vein (the table\'s host), not into a collateral that shares its node', () => {
  assert.deepEqual(sewnHostIds('S_DSR', 1), ['V_KID_L', 'V_KID_L_1']);
  assert.deepEqual(sewnHostIds('S_MC', 0), []);
});
