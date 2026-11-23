// A tube never wears more ink than half its own radius on screen (Mohammad, 23 Nov 2026, the SOS slide: black slivers and notches along the tubes' edges). Root cause: every ink hull was pushed out a fixed `px`, whatever the
// tube's own width; the lymph channels taper to nothing in zone 3, so once the strip of tube beside its wall was narrower than the hull only ink showed, and where the tube dived under a crossing vessel the sliver came and went.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INK_HALF, INK_FADE_HI, INK_FADE_LO, MICRO_INK_FS, MICRO_INK_VS, MIN_LINE, inkWidth } from '../src/scene/micro3d/cel3d.ts';

test('the twin: never more than half the radius, none as the tube goes to nothing, the whole hull from twice its width', () => {
  for (const px of [0.8, 1, 1.5, 2.5]) {
    let prev = 0;
    for (let r = 0; r <= 12; r += 0.05) {
      const w = inkWidth(px, r);
      assert.ok(w <= INK_HALF * r + 1e-12, `px ${px} r ${r}: ${w}`);
      assert.ok(w >= prev - 1e-12, 'it grows with the tube');
      if (r >= 2 * px && px >= MIN_LINE) assert.equal(w, px, 'a wide tube keeps its whole line');
      prev = w;
    }
    assert.equal(inkWidth(px, 0), 0);
    assert.ok(inkWidth(px, 1e-6) < 1e-5);
  }
  assert.equal(INK_HALF, 0.5);
});

test('a thread\'s line thins out instead of breaking into dashes: 0 below 0.35 of the minimum line, whole from it, smooth between (in the width, never the opacity)', () => {
  const px = 2;   // (a hull wide enough that the clamp is the half radius over this range)
  assert.equal(inkWidth(px, 0.35 * MIN_LINE * 2), 0); assert.ok(Math.abs(inkWidth(px, 2 * MIN_LINE) - MIN_LINE) < 1e-12); assert.equal(inkWidth(px, 6), px);
  assert.ok(INK_FADE_LO < INK_FADE_HI);
  let prev = 0; for (let r = 0; r <= 3; r += 0.01) { const w = inkWidth(px, r); assert.ok(w >= prev - 1e-12); assert.ok(w - prev < 0.04, 'no step'); prev = w; }
});

test('the ink shader applies the clamp and the fade, in the width, for every part that carries a tube radius (source ratchet)', () => {
  assert.match(MICRO_INK_VS, /#ifdef INKR[\s\S]*float rPx = max\(inkR \+ infl, 0\.0\)[\s\S]*w = min\(px, 0\.5 \* rPx\);[\s\S]*w \*= smoothstep\(0\.35, 1\.0, w \/ 1\.0\);[\s\S]*#endif/);
  assert.match(MICRO_INK_VS, /c\.xy \+= nd \* w \* smoothstep/, 'the push is the clamped width, not px');
  assert.doesNotMatch(MICRO_INK_VS, /c\.xy \+= nd \* px/);
  assert.doesNotMatch(MICRO_INK_FS, /vInkA/, 'no opacity fade: the ink is opaque, so it only darkened the line');
});

test('GLSL: the ink shaders parse (with and without the swell)', async () => {
  const name = '@shaderfrog/glsl-parser'; let parse: ((s: string) => unknown) | null = null;
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  if (!parse) return;
  const strip = (s: string) => s.replace(/^\n/, '').replace(/^#include.*$/gm, '').replace(/^#(ifdef|ifndef|endif|else|define).*$/gm, '');
  parse(strip(MICRO_INK_VS)); parse(strip(MICRO_INK_FS));
});
