// Mohammad, 20 Nov: "a chevron cut in two at the fork". A head is drawn in its arm's frame; it used to be weighted by the arm's mesh weight AT THE PIXEL, so where the skin's ownership changes across a head the head was sliced along the line.
// Root fix: a head belongs WHOLE to the arm that owns its centre (skinOwner at the point of the arm's axis at the head's arc), within the arm's own cylinder. Away from junctions nothing changes: a plain tube draws exactly
// what it drew (chevOne's output is untouched; the centre arc is only a side output), and a skin never multiplies a head by the pixel's weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { FLOW_MARKS_GLSL, CHEV_ONE_GLSL } from '../src/scene/vessels/glsl-shared.ts';

const body = (src: string, name: string): string => {
  const at = src.indexOf(name);
  assert.ok(at >= 0, `${name} found`);
  let depth = 0, i = src.indexOf('{', at);
  const start = i;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
};

test('plain tubes are unchanged: the tube shader never reads the head-centre arc or the skin owner', () => {
  const own = VESSEL_FS.split(CHEV_ONE_GLSL).join('').split(FLOW_MARKS_GLSL).join('');   // (the shared code is the one place that touches it)
  assert.ok(!/chevCentreArc|skinOwner/.test(own), 'the tube draws heads exactly as before');
  // chevOne's return value is the same expression as before; the centre arc is a side output written once
  const one = body(CHEV_ONE_GLSL, 'vec2 chevOne(');
  assert.equal((one.match(/chevCentreArc\s*=/g) ?? []).length, 1);
  assert.match(one, /chevCentreArc = sc;/);
});

test('flowHeads hands back the centre arc of the head it drew (blended with the chain exactly as the heads are)', () => {
  const fh = body(FLOW_MARKS_GLSL, 'vec4 flowHeads(');
  assert.match(fh, /chevCentreArc = c4\.w >= 1\.0 \? chevCentreArc : mix\(scOwn, chevCentreArc, c4\.w\)/);
});

test('a skin draws every head whole by the owner of its centre, inside the arm\'s cylinder, and never weights it by the pixel\'s own weight', () => {
  const main = body(SKIN_FS, 'void main(');
  assert.match(main, /skinOwner\(i, seamP \+ tJA\[i\] \* \(\(chevCentreArc - armArc\[i\]\.x\) \/ \(armArc\[i\]\.y \* SKIN_U\)\), kPx\)/);
  assert.match(main, /1\.0 - smoothstep\([0-9.]+, [0-9.]+, latK\)/);
  assert.ok(!/headAcc \+= wI \*/.test(main), 'no head is scaled by its pixel\'s weight any more (that is what sliced it)');
  // the head's own gate runs before the weight test that skips an absent arm, so an arm that owns a head's centre still draws it
  assert.ok(main.indexOf('flowHeads(') < main.indexOf('if (wI < 0.004 || vR <= 0.0) continue;'));
});

test('the owner is the mesh\'s own rule (a softmax of the arms\' distances in px) read as a WINNER, never as a third: a head in a three-way fillet is whole or not this arm\'s, never a pale ghost', () => {
  const own = body(SKIN_FS, 'float skinOwner(');
  assert.match(own, /exp\(-4\.0 \* \(d\[k\] - lo\) \/ max\(kPx, 1e-3\)\)/);
  assert.match(own, /return smoothstep\([0-9.]+, [0-9.]+, \(mine - other\) \/ max\(sum, 1e-6\)\)/);
  assert.ok(!/return mine \/ max\(sum/.test(own), 'not the bare share');
});

test('?joins=noheads still removes the heads from a skin', () => {
  const main = body(SKIN_FS, 'void main(');
  const at = main.indexOf('#ifndef SKIN_NOHEADS');
  assert.ok(at >= 0 && main.indexOf('headAcc += hI', at) > at && main.indexOf('#endif', at) > main.indexOf('headAcc += hI', at));
});

test('a head is whole or gone: its owner share is sharpened (the two arms still sum to 1) and its lateral gate closes at the head\'s own reach (smeared blobs in a fork\'s crotch, 21 Nov)', async () => {
  const m = await import('../src/scene/vessels/skin/shaders.ts');
  assert.ok(m.SKIN_HEAD_OWN_FROM < 0.5 && m.SKIN_HEAD_OWN_TO === 1 - m.SKIN_HEAD_OWN_FROM, 'symmetric about one half, so two arms\' shares sum to 1');
  assert.ok(m.SKIN_HEAD_GATE_TO <= 1.0 && m.SKIN_HEAD_GATE_TO < m.SKIN_HEAD_LAT_FROM, 'no head past the wall of its own cylinder');
  const main = body(m.SKIN_FS, 'void main(');
  assert.match(main, /smoothstep\([0-9.]+, [0-9.]+, skinOwner\(i, seamP/);
});

// Mohammad, 24 Nov: "chevrons hide under the joins, in every lens". Rendered (software GL, Pressure lens, the portal confluence): with the skins on, the heads along the bent trunks were pale ghosts; with ?joins=old they were whole.
// Root cause: the head's lateral gate measured the pixel's distance to the STRAIGHT line through the seam, which a bending vessel leaves within a radius or two, so the gate half-closed on a head standing mid-lumen. A head's owner
// share was also a third at a three-way fillet. Now the gate reads the pixel's lateral from the arm's live axis chain (skinArmLat) and the owner is the winner of the arms' shares.
test('a head\'s lateral gate follows the arm\'s live bent axis, never the straight line through the seam', () => {
  const main = body(SKIN_FS, 'void main(');
  const at = main.indexOf('flowHeads(');
  const gate = main.slice(at, main.indexOf('hI = vec4(0.0);', at));
  assert.match(gate, /skinArmLat\(gl_FragCoord\.xy, i, swAt\(i\), rPxH\)/);
  assert.ok(!/dot\(relP, tJA\[i\]\)/.test(gate), 'no distance to the straight line');
});

// Mohammad, 24 Nov (build 4f3b63d3, iPhone): half a chevron at the left gastric vein's mouth and a faded one on the portal vein under the bifurcation. Rendered (software GL, dark look, Healthy): the tube draws a head up to its seam,
// the skin finished it only when its arm OWNED the place the head's centre would be in the skin, and at a mouth that place is as near the trunk's wall as the vein's own, so the head was cut at the seam or drawn a ghost.
test('a head centred on the tube\'s side of the seam is finished by the skin whoever owns the place; only a head well inside the skin goes by the owner', async () => {
  const m = await import('../src/scene/vessels/skin/shaders.ts');
  const main = body(m.SKIN_FS, 'void main(');
  assert.match(main, /float aIn = \(chevCentreArc - armArc\[i\]\.x\) \* armArc\[i\]\.y \/ max\(rOwn, 1e-4\);/);
  assert.match(main, /float ownH = max\(step\(0\.5, smoothstep\([0-9.]+, [0-9.]+, skinOwner\(/);
  assert.match(main, /, tubeSide\);/);
  assert.ok(m.SKIN_HEAD_TUBE_SIDE > 0 && m.SKIN_HEAD_TUBE_SIDE < 0.6, 'the tube\'s side ends within a head\'s first half length past the seam: further in, two arms\' heads would pile up at a node');
  assert.ok(m.SKIN_HEAD_TIE < m.SKIN_HEAD_WIN && m.SKIN_HEAD_WIN <= 0.15, 'the band where no arm wins a head is narrow: a ghost lives only there');
});

// Mohammad, 24 Nov: a pale head on the portal vein under the hepatic artery's leader (render, arm-coloured: drawn by the arm that owns the place, faded by the wall rule). Numbers: the skin's radius at a pixel (vR) blends the arms'
// radii and can exceed the arm's own lumen near a node; a head sized by it (half width 0.55 of vR) was wider than the lumen, reached the wall (the wall rule starts at 0.90 of the way to the ink) and was faded to a ghost.
test('a skin\'s head is sized by the smaller of the pixel\'s radius and its arm\'s own radius, never by the pixel\'s alone', () => {
  const main = body(SKIN_FS, 'void main(');
  assert.match(main, /float vRH = min\(vR, rOwn \* swAt\(i\)\);/);
  assert.match(main, /flowHeads\(acrossI, acrossW, sI, Lw, vRH, wpcM,/);
});
