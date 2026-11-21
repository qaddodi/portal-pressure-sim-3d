// Mohammad, 20 Nov: "what are those at the end of the artery? on both sides; remove" (a dotted pink and blue patch at the old end of both hepatic arteries, by the Right and Left sinusoid nodes, left after the arteries' fade was tied to their portal branches).
// ROOT CAUSE: the body does not draw the liver's beds, so at SIN_R and SIN_L the skin has ONE arm that is there (the arteriole) and two that are hidden (PRE_R, SIN_RR). The skin is dithered by its arms' presence (pres), but its ALPHA blended every arm's fade by weight,
// hidden ones too (PRE_R 1, SIN_RR 0.8), so at the pixels the artery's own share let through it kept an alpha, and the hidden beds' colours, after the artery had faded to nothing. The alpha is now the weighted fade of the arms that are there. Run: node --test tests/skin-present-alpha.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentAlpha } from '../src/scene/vessels/skin/arm-twins.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';

test('the shader\'s alpha is over the arms that are there: each arm\'s presence multiplies its term and the sum is divided by pres', () => {
  assert.match(SKIN_FS, /\* armCopy\[0\]\[SKIN_COPY\] \* armAF\[0\]\.w \+/);
  assert.match(SKIN_FS, /\) \/ max\(pres, 1\.0e-4\) \* circK;/);   // (the Circuit's factor now follows the division; the division by pres is the rule)
  assert.match(SKIN_FS, /float pres = wAt\(0\) \* armAF\[0\]\.w/);
});

test('twin: an arm that is not drawn adds no alpha, wherever its weight is; arms that are all there are as before', () => {
  // the sinusoid node in the body: the arteriole (faded to nothing at its seam) is the one arm there, the two beds' fades are whole and 0.8
  const fades = [0, 1, 0.8], pres = [1, 0, 0];
  for (const w of [[1, 0, 0], [0.6, 0.3, 0.1], [0.34, 0.33, 0.33], [0.1, 0.5, 0.4], [0, 0.5, 0.5]]) {
    const a = presentAlpha(w, fades, pres);
    assert.ok(a < 1e-9, `weights ${w}: the skin is gone with the one arm that is there (${a})`);
  }
  // no arm there: nothing (the skin is not drawn at all)
  assert.equal(presentAlpha([0.3, 0.3, 0.4], fades, [0, 0, 0]), 0);
  // all there: the plain weighted blend of the fades
  const w = [0.5, 0.3, 0.2];
  assert.ok(Math.abs(presentAlpha(w, [1, 0.5, 0.2], [1, 1, 1]) - (0.5 + 0.15 + 0.04)) < 1e-12);
  // a partly drawn arm counts by its presence, never more than the arms it blends
  const part = presentAlpha([0.5, 0.5], [1, 0.4], [1, 0.25]);
  assert.ok(part > 0.4 && part < 1);
});

test('the case in the app: both hepatic arteries are gone at their bed node (fade 0), and the beds\' own fades there are not', () => {
  for (const [a, beds] of [['A_HR', ['PRE_R', 'SIN_RR']], ['A_HL', ['PRE_L', 'SIN_LL']]] as const) {
    assert.equal(fadeOf(a, true)!.a1, 0);
    assert.ok(vesselAlphaAt(a, 1, 0, 0) < 1e-9, `${a} is nothing at its end`);
    assert.ok(vesselAlphaAt(beds[0], 1, 0, 0) > 0.9 && vesselAlphaAt(beds[1], 0, 0, 0) > 0.5, `the beds ${beds} carry alpha of their own at the node: the old blend took it`);
  }
});
