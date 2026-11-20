// The shared vessel GLSL (src/scene/vessels/glsl-shared.ts) was cut out of vessels/shaders.ts for the junction skin (rebuild-3d/junction-skin-spec.md WP3). The move must change no pixel of any vessel: the assembled
// VESSEL_VS and VESSEL_FS are held to the text they had BEFORE the move (tests/fixtures/glsl/vessel.vert.glsl and vessel.frag.glsl, taken at the parent commit), byte for byte.
//
// A later change to the vessel shaders that is meant (a new uniform, a new branch) makes this fail on purpose: read the diff, then rewrite the two fixtures with
//   UPDATE_GLSL_SNAPSHOT=1 node --test tests/glsl-shared.test.ts
// and commit them with the change. An accident (a chunk that drifted, a helper that changed its text) is what the failure is for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CHEV_CREAM_GLSL, LENS_OF_AT_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl } from '../src/scene/vessels/glsl-shared.ts';

const DIR = join('tests', 'fixtures', 'glsl');
const files: Array<[string, string, string]> = [['vessel.vert.glsl', VESSEL_VS, 'VESSEL_VS'], ['vessel.frag.glsl', VESSEL_FS, 'VESSEL_FS']];

/** The first line that differs, so a failure says where the vessel shader moved. */
function firstDiff(a: string, b: string): string {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return `line ${i + 1}:\n  now:    ${x[i]}\n  before: ${y[i]}`;
  return 'no line differs (the texts differ in length only)';
}

for (const [file, now, name] of files) {
  test(`${name} is byte for byte the text it had before the shared GLSL was cut out`, () => {
    if (process.env.UPDATE_GLSL_SNAPSHOT) { writeFileSync(join(DIR, file), now); return; }
    const before = readFileSync(join(DIR, file), 'utf8');
    assert.ok(now === before, `${name} changed: ${firstDiff(now, before)}`);
  });
}

test('the vessel programs splice the shared chunks (they are the one copy, not a second one beside it)', () => {
  assert.ok(VESSEL_VS.includes(SWELL_OF_GLSL), 'VESSEL_VS holds swellOf from the shared file');
  assert.ok(VESSEL_FS.includes(LENS_OF_AT_GLSL), 'VESSEL_FS holds lensOfAt from the shared file');
  assert.ok(VESSEL_FS.includes(CHEV_CREAM_GLSL), 'VESSEL_FS holds chevCreamOf from the shared file');
  assert.ok(VESSEL_FS.includes(inkColourGlsl('baseH')), 'the ink colour rule is the shared one');
  assert.ok(VESSEL_VS.includes(inkPxGlsl('rCssV', 'rCssV / narrowK')), 'the ink width rule is the shared one');
  assert.ok(VESSEL_VS.includes(wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'vU')) && VESSEL_FS.includes(wpcGlsl('vW', 'projY', 'vU')), 'the pixel rule is the shared one');
});

test('a chunk is a complete function and declares no uniform of its own (the program that includes it does)', () => {
  for (const [name, chunk] of [['swellOf', SWELL_OF_GLSL], ['lensOfAt', LENS_OF_AT_GLSL], ['chevCreamOf', CHEV_CREAM_GLSL]] as const) {
    assert.ok(!/^\s*uniform\s/m.test(chunk), `${name}: a uniform inside a chunk would be declared twice by a program that has its own`);
    const open = (chunk.match(/\{/g) ?? []).length, close = (chunk.match(/\}/g) ?? []).length;
    assert.equal(open, close, `${name}: balanced braces`);
  }
});
