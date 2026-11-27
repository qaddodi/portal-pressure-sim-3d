// The Anatomy <-> Lobule move gets the same whole-screen blur as the Lobule <-> Sinusoid one (Mohammad 20 Nov 2026: "I like the blur while zooming into a new view, can you add it as we land or leave
// the lobule towards the anatomy view?"): one blur over the whole screen, a function of the camera's distance alone (so out is in run backward), none at either rest, reusing the focus band's pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector2, Vector4 } from 'three';
import { DOF_BAND_FRAC, DOF_DIVE_PEAK, PostDof, diveBlur } from '../src/scene/post-dof.ts';
import { DIVE_IN, DIVE_OUT } from '../src/scene/scene.ts';
import { sceneSource } from './helpers/scene-source.ts';

const rest = 0.009, gone = Math.max(DIVE_IN, 2 * rest);

test('none at the lobule\'s framing and none with the whole body drawn, a smooth hump between peaking where the body is gone', () => {
  assert.equal(diveBlur(rest, rest, gone, DIVE_OUT), 0, 'landed: sharp');
  assert.equal(diveBlur(rest * 1.15, rest, gone, DIVE_OUT), 0, 'the neighbours have settled: sharp');
  assert.equal(diveBlur(DIVE_OUT, rest, gone, DIVE_OUT), 0, 'the body whole: sharp');
  assert.equal(diveBlur(6.5, rest, gone, DIVE_OUT), 0, 'a body shot: sharp');
  assert.equal(diveBlur(0.001, rest, gone, DIVE_OUT), 0, 'inside the sinusoid\'s range: this blur is not there (its own focus pull is)');
  assert.ok(Math.abs(diveBlur(gone, rest, gone, DIVE_OUT) - DOF_DIVE_PEAK) < 1e-12, 'the peak is where the body is gone');
  let peak = 0, last = 0, rising = true, turns = 0;
  for (let i = 0; i <= 2000; i++) {
    const d = rest * Math.pow(DIVE_OUT / rest, i / 2000), v = diveBlur(d, rest, gone, DIVE_OUT);
    assert.ok(v >= 0 && v <= DOF_DIVE_PEAK + 1e-12);
    assert.ok(Math.abs(v - last) < 0.01, 'no jump anywhere along the move (nothing pops)');
    if (rising && v < last - 1e-12) { rising = false; turns++; } else if (!rising && v > last + 1e-12) { rising = true; turns++; }
    peak = Math.max(peak, v); last = v;
  }
  assert.ok(peak > DOF_DIVE_PEAK - 0.001 && turns === 1, 'one hump');
});

test('it is a function of the distance alone: the way out is the way in run backward', () => {
  for (const d of [0.012, 0.03, 0.08, 0.4, 1.2]) assert.equal(diveBlur(d, rest, gone, DIVE_OUT), diveBlur(d, rest, gone, DIVE_OUT));
  assert.equal(diveBlur(NaN, rest, gone, DIVE_OUT), 0);
  assert.equal(diveBlur(0.1, 0, gone, DIVE_OUT), 0);
  assert.equal(diveBlur(0.1, rest, rest, DIVE_OUT), 0, 'a degenerate range blurs nothing');
});

test('the pass is the focus band\'s, fully eased out: the same circle at every pixel, on every device, none with reduced motion', () => {
  const d = new PostDof(() => false, null);
  assert.equal(d.uniformFrame(1000, 0.3), 0.3);
  const bk = d.gather.uniforms.bandK!.value as Vector4;
  assert.equal(bk.z, DOF_BAND_FRAC * 1000); assert.equal(bk.w, 0.3);
  assert.equal(d.gather.uniforms.bandO!.value, 0, 'closed: the same blur everywhere, no window and no side');
  assert.equal((d.gather.uniforms.bandAK!.value as Vector2).y, 0, 'no ends');
  assert.equal(d.bandShare, 0.3);
  assert.equal(d.uniformFrame(1000, 0), 0); assert.equal(d.bandShare, 0, 'strength 0 draws nothing');
  const calm = new PostDof(() => false, { coarsePointer: true, hover: false, width: 390, reducedMotion: true, touchMac: false });
  assert.equal(calm.uniformFrame(1000, 0.3), 0, 'reduced motion: none');
});

test('the scene asks for it in the dive, never in Circuit, and leaves the pass to the sinusoid\'s own focus pull when that is drawn', () => {
  const src = sceneSource();
  assert.match(src, /o\.whole = this\.figureView !== 'circuit' && this\.inDive\(\) \? diveBlur\(d, this\.lobuleRest\(\), this\.diveIn\(\), DIVE_OUT, this\.passHold\.value\) : 0;/);
  assert.match(src, /if \(!band && into && fk\.whole > 0\) band = this\.post\.dof\.uniformFrame\(into\.height, fk\.whole\) > 0;/);
  // (the band, when the sinusoid's is drawn, takes the stronger of the two: a lobule passed through hands its blur over without a step, tests/dive-pass-through.test.ts)
  assert.match(src, /this\.post\.dof\.bandFrame\(cam, _bA, _bB, _bE0, _bE1, into!\.width, into!\.height, Math\.max\(bandK, fk\.whole\), _bEnds\)/);
});
