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
  assert.match(main, /1\.0 - smoothstep\(SKIN_HEAD_LAT_FROM|1\.0 - smoothstep\([0-9.]+, [0-9.]+, latK\)/);
  assert.ok(!/headAcc \+= wI \*/.test(main), 'no head is scaled by its pixel\'s weight any more (that is what sliced it)');
  // the head's own gate runs before the weight test that skips an absent arm, so an arm that owns a head's centre still draws it
  assert.ok(main.indexOf('flowHeads(') < main.indexOf('if (wI < 0.004 || vR <= 0.0) continue;'));
});

test('the owner is the mesh\'s own rule: a softmax of the arms\' distances in px, summing to one over the arms', () => {
  const own = body(SKIN_FS, 'float skinOwner(');
  assert.match(own, /exp\(-4\.0 \* \(d\[k\] - lo\) \/ max\(kPx, 1e-3\)\)/);
  assert.match(own, /return mine \/ max\(sum, 1e-6\)/);
});

test('?joins=noheads still removes the heads from a skin', () => {
  const main = body(SKIN_FS, 'void main(');
  const at = main.indexOf('#ifndef SKIN_NOHEADS');
  assert.ok(at >= 0 && main.indexOf('headAcc += hI', at) > at && main.indexOf('#endif', at) > main.indexOf('headAcc += hI', at));
});
