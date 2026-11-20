// Junction skins, WP5: the JS twins of the tube's vertex stage that hand each arm's live alpha, highlight weight and lens position to its skin (vessels/skin/arm-twins.ts). The alpha twin is held to the resting-state
// twin the app already trusts (fade-alpha.ts tipAlpha, which clots read) for EVERY fade the figure has; the highlight twin to the GLSL's own line; both to the shader text so a changed rule fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { tipAlpha, vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';
import { hiWeightAt, lensUAt, liveFadeAt, type FadeState } from '../src/scene/vessels/skin/arm-twins.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { HI_NONE } from '../src/scene/materials/shaders.ts';

const stateOf = (f: NonNullable<ReturnType<typeof fadeOf>>, len = 1): FadeState => ({
  mode: f.mode, a: [f.from, f.to, f.a0, f.a1], line: f.line ?? [0, 0, 0, 1], cavaEnd: [0, 1], stumpCut: 0, len, units: 300,
});

test('the live alpha twin equals the resting twin for every fade in the figure, along the vessel and across the figure', () => {
  let n = 0;
  for (const v of NETWORK) {
    const f = fadeOf(v.id, v.tone === 'artery', v.feeder?.host);
    if (!f) continue;
    for (const u of [0, 0.1, 0.33, 0.5, 0.8, 1]) for (const [x, y] of [[-0.4, -0.6], [0.1, 0.2], [0.5, 0.9]] as const) {
      assert.ok(Math.abs(liveFadeAt(stateOf(f), u, x, y) - tipAlpha(f, u, x, y)) < 1e-12, `${v.id} u=${u}`);
      n++;
    }
  }
  assert.ok(n > 300, `${n} samples`);
  // (and the vessel-level twin the clots read, for vessels with no cava end: the same number)
  assert.equal(vesselAlphaAt('A_HEP', 0.2, 0, 0), liveFadeAt(stateOf(fadeOf('A_HEP', true)!), 0.2, 0, 0));
});

test('no fade is 1; a hepatic vein\'s cava end and a divided vein\'s stump scale it as the vertex stage does', () => {
  const none: FadeState = { mode: 0, a: [0, 1, 1, 1], line: [0, 0, 0, 1], cavaEnd: [0, 1], stumpCut: 0, len: 2, units: 300 };
  assert.equal(liveFadeAt(none, 0.5, 0, 0), 1);
  assert.equal(liveFadeAt({ ...none, cavaEnd: [0.4, 0.45] }, 0.5, 0, 0), 1, 'before its span');
  assert.ok(Math.abs(liveFadeAt({ ...none, cavaEnd: [0.4, 0.45] }, 1, 0, 0) - 0.45) < 1e-12, 'the cava\'s alpha at its end');
  assert.equal(liveFadeAt({ ...none, stumpCut: 300 }, 0.4, 0, 0), 0, '0.4 x 2 x 300 = 240 figure units: inside the divided stretch');
  assert.equal(liveFadeAt({ ...none, stumpCut: 300 }, 0.6, 0, 0), 1, '360: past it');
});

test('the highlight twin: the picked vein\'s own line, and the glow running ahead of and behind a bolus', () => {
  const base = { on: 1, dir: 0, offset: 0, ahead: 1, behind: 1, ends: [HI_NONE, HI_NONE] as const, fade: 0.2, len: 2 };
  assert.equal(hiWeightAt({ ...base, on: 0 }, 0.5), 0, 'off');
  assert.equal(hiWeightAt(base, 0.5), 1, 'in the middle of a picked vein: its line is whole');
  assert.ok(hiWeightAt({ ...base, ends: [0, 5] }, 0) < 1e-9 && hiWeightAt({ ...base, ends: [0, 5] }, 0.3) > 0.5, 'nothing at the outer start, full a fade\'s length in');
  const ahead = { ...base, dir: 1, offset: 0, ahead: 1 };
  assert.equal(hiWeightAt(ahead, 0), 1, 'at the bolus');
  assert.equal(hiWeightAt(ahead, 0.5), 0, 'a length ahead: gone (u 0.5 x len 2 = 1)');
  const behind = { ...base, dir: -1, offset: 0, behind: 1 };
  assert.equal(hiWeightAt(behind, 1), 1);
  assert.equal(hiWeightAt(behind, 0.5), 0);
});

test('the lens position at a seam is the ramp\'s stretch the vessel wears, at u', () => {
  assert.equal(lensUAt([0, 1], 0.37), 0.37);
  assert.ok(Math.abs(lensUAt([0.25, 0.75], 0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(lensUAt([0.2, 0.6], 0.25) - 0.3) < 1e-12);
});

test('the twins mirror the vertex stage: the fade, the highlight and the lens span are the lines they read', () => {
  // the highlight: vHi = hiOn * (|hiDir| > 0.5 ? 1 - smoothstep(0, max(limitH, 0.0001), distH) : ownH)
  assert.match(VESSEL_VS, /vHi = hiOn \* \(abs\(hiDir\) > 0\.5 \? 1\.0 - smoothstep\(0\.0, max\(limitH, 0\.0001\), distH\) : ownH\);/);
  assert.match(VESSEL_VS, /float ownH = smoothstep\(0\.0, max\(hiFade, 0\.0001\), min\(hiEnds\.x \+ aU, hiEnds\.y \+ \(len - aU\)\)\);/);
  assert.match(VESSEL_VS, /float distH = hiDir > 0\.5 \? hiOffset \+ aU : \(hiDir < -0\.5 \? hiOffset \+ \(len - aU\) : 0\.0\);/);
  // the fade
  assert.match(VESSEL_VS, /fa = mix\(fadeA\.z, fadeA\.w, ft\);/);
  assert.match(VESSEL_VS, /if \(cavaEnd\.x > 0\.0\) fa \*= mix\(mix\(1\.0, cavaEnd\.y, smoothstep\(1\.0 - cavaEnd\.x, 1\.0, uv\.x\)\), 1\.0, circT\);/);
});
