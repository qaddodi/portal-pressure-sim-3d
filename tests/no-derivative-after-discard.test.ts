// ROOT CAUSE of the specks on the welded junctions (Mohammad, 20 Nov: green, navy, black and yellow-green specks and dashes at every crotch and seam): a screen-space derivative (fwidth, dFdx, dFdy) taken AFTER a
// `discard` in a fragment shader. On a GPU that drops a discarded lane from its quad (Apple's), the lanes that stay next to it read garbage, so every mark built from a derivative (the heads, the shade band, the lane
// colour, the streaks) came out as clusters of wrongly coloured pixels exactly where neighbours are dropped: seams, crotches, silhouettes. This test is the ONE invariant over EVERY program the app draws with (the
// registry and the scene graph, the same list glsl-compile.test.ts compiles): in `main`, no derivative and no call of a function that takes one comes after the first `discard`. A derivative is taken at the top and
// handed down (a parameter, or a global like gStreakFw or lensAcrossFw that main sets first).
// ROOT CAUSE (the specks of 20 Nov, and Plan 41's implicit-LOD texture call): see tests/gl-derivative.ts, which holds the checker. This test runs it over EVERY program the app draws with, from the one shared loader
// (tests/gl-all-programs.ts: the organs, the micro views and the late classes, 120+ programs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCARD_ALLOWED, afterDiscardProblems, derivativeAfterDiscard } from './gl-derivative.ts';
import { loadAllPrograms } from './gl-all-programs.ts';

const { programs } = await loadAllPrograms();

test('the checker finds a derivative after a discard, and passes one taken first or handed down', () => {
  assert.equal(derivativeAfterDiscard('void main() { float w = fwidth(x); if (a) discard; use(w); }').length, 0);
  assert.equal(derivativeAfterDiscard('void main() { if (a) discard; float w = fwidth(x); }').length, 1);
  assert.equal(derivativeAfterDiscard('float soft(float f) { return fwidth(f); }\nvoid main() { if (a) discard; float w = soft(x); }').length, 1);
  assert.equal(derivativeAfterDiscard('float soft(float f) { return gStreakFw > 0.0 ? gStreakFw : fwidth(f); }\nvoid main() { if (a) discard; float w = soft(x); }').length, 0);
});

test('an implicit-LOD texture call after a discard is the same bug; Lod, Grad and texelFetch are not', () => {
  assert.equal(derivativeAfterDiscard('void main() { if (a) discard; vec4 t = texture2D(tex, uv); }').length, 1);
  assert.equal(derivativeAfterDiscard('void main() { if (a) discard; vec4 t = texture(tex, uv); }').length, 1);
  assert.equal(derivativeAfterDiscard('vec4 look(vec2 u) { return texture(tex, u); }\nvoid main() { if (a) discard; vec4 t = look(uv); }').length, 1);
  assert.equal(derivativeAfterDiscard('void main() { vec4 t = texture2D(tex, uv); if (a) discard; use(t); }').length, 0);
  assert.equal(derivativeAfterDiscard('void main() { if (a) discard; vec4 t = textureLod(tex, uv, 0.0) + textureGrad(tex, uv, dx, dy) + texelFetch(tex, ivec2(0), 0); }').length, 0);
});

test('EVERY program the app draws takes its screen-space derivatives and its mipmapped texture samples before its first discard (after one it is garbage on Apple GPUs: specks at every seam and crotch)', () => {
  assert.ok(programs.length >= 77, `${programs.length} programs (the organs, the micro views and the late classes are loaded)`);
  const found = programs.flatMap(afterDiscardProblems);
  assert.deepEqual(found, [], 'move these to the top of main (before the first discard) and hand the value down');
  for (const a of DISCARD_ALLOWED) assert.ok(a.proof(), `${a.program}: ${a.why} no longer holds`);
});
