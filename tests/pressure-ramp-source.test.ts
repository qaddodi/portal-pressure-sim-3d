// ONE source for the pressure ramp (S1, 22 Nov 2026): lenses/pressure-ramp.ts. The vessels, the legend and its swatches, the charts, the profile, the ladder, the Lobule and the Sinusoid all read it through one function,
// and the vessels wear its colours as they are (no saturation step, no caps) while every other lens keeps its 2D ramp and the transform. This fails on a second reader of the 2D ramp, on a legend that bends the ramp,
// and on a shader program that mixes the lens colour in without telling celTubeBase how much of it is authored as drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRESSURE_RAMP, RAW_LENSES, isRawLens, pressureViolet, pressureWine } from '../src/scene/lenses/pressure-ramp.ts';
import { samplerFor } from '../src/scene/lenses/model.ts';
import { rampStops } from '../src/scene/lenses/legend.ts';
import { celTubeBase, figureHex, tubeInk } from '../src/scene/vessels/cel-ink.ts';
import { hexToRgb01, rgb01ToHex, sampler } from '../src/scene/lenses/oklab.ts';
import { pressureColour } from '../src/ui/charts/profile/pressure-colour.ts';
import { pressureColour as profileColour } from '../src/ui/tests/profile/model.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { lookVars } from '../src/looks/looks.ts';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { CELLS_VS } from '../src/scene/blood/cells/shader.ts';
import { CEL_TUBE_GLSL } from '../src/scene/cel-glsl.ts';
import { LensField } from '../src/scene/lenses/field.ts';

const LOOK_IDS = ['light', 'soft', 'dark', 'navy', 'black'] as const;
const near = (a: readonly number[], b: readonly number[], e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < e);

test('samplerFor(pressure) is the ramp of pressure-ramp.ts; every other lens keeps its 2D ramp', () => {
  for (const look of LOOK_IDS) {
    const s = sampler(PRESSURE_RAMP[look]);
    for (const p of [0, 3.3, 10, 12, 17.5, 30]) assert.ok(near(samplerFor(look, 'pressure').at(p, [0, 0, 0]), s.at(p, [0, 0, 0])), `${look} ${p}`);
    for (const n of ['flow', 'velocity', 'heat', 'drop', 'oxygen'] as const) assert.ok(near(samplerFor(look, n).at(0.4, [0, 0, 0]), sampler(LENS_TOKENS[look][n]).at(0.4, [0, 0, 0])), `${look} ${n}`);
  }
});

test('the legend bar shows the ramp as it is: no transform on the pressure bar, the transform on every other bar', () => {
  for (const look of LOOK_IDS) {
    const s = sampler(PRESSURE_RAMP[look]);
    rampStops(look, 'pressure', 30).forEach(([hex], i) => assert.equal(hex, rgb01ToHex(s.at(i * 3, [0, 0, 0])), `${look} stop ${i}`));
    const f = sampler(LENS_TOKENS[look].flow);
    rampStops(look, 'flow', 1).forEach(([hex], i) => assert.equal(hex, figureHex(rgb01ToHex(f.at(i / 10, [0, 0, 0])), look), `${look} flow ${i}`));
  }
});

test('the charts read the same ramp: the profile\'s pressure colour, the tests profile\'s, the flat violet and wine of the plane (the 12 and 20 mmHg stops)', () => {
  for (const look of LOOK_IDS) {
    const s = sampler(PRESSURE_RAMP[look]);
    for (const p of [0, 7, 12, 20, 35]) {
      const q = Math.round((Math.min(35, p) / 35) * 255) / 255 * 35, ref = s.at(q, [0, 0, 0]);
      assert.ok(near(profileColour(p, look).slice(0, 3), ref), `tests profile ${look} ${p}`);
      assert.ok(near(pressureColour(look, p).slice(0, 3), ref, 0.01), `chart ${look} ${p}`);   // (a chart rounds to whole 0-255 channels, as 2D does)
    }
    const pal = paletteOf(look);
    assert.ok(near(pal.tok('ramp-violet').slice(0, 3), hexToRgb01(pressureViolet(look)), 0.01), `${look} violet is the 12 mmHg stop`);
    assert.ok(near(pal.tok('ramp-wine').slice(0, 3), hexToRgb01(pressureWine(look)), 0.01), `${look} wine is the 20 mmHg stop`);
    assert.equal(lookVars(look)['--ramp-violet'], PRESSURE_RAMP[look][3]![0]);
    assert.equal(lookVars(look)['--ramp-wine'], PRESSURE_RAMP[look][4]![0]);
  }
});

test('nothing but the ramp module (and the copy and parity files that hold 2D\'s own) reads the 2D pressure ramp', () => {
  const ALLOWED = new Set(['src/scene/lenses/tokens.copied.ts', 'src/scene/lenses/pressure-ramp.ts', 'src/scene/lenses/model.ts', 'src/scene/lenses/legend.ts', 'src/scene/labels/names.copied.ts', 'src/parity/b3.ts',
    'src/ui/charts/looks2d/theme-tokens.js', 'src/ui/charts/tokens.generated.ts', 'src/ui/css2d/tokens.css', 'src/ui/charts/profile/pressure-colour.ts']);
  const bad: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js)$/.test(f) && !ALLOWED.has(p)) {
    const t = readFileSync(p, 'utf8');
    if (/LENS_TOKENS\s*(\[[^\]]*\]|\.\w+)\s*\.pressure\b|\.pressure\s*\)?\s*as\b.*Ramp|'ramp-pressure'/.test(t) || /LENS_TOKENS as unknown as Record<string, \{ pressure/.test(t)) bad.push(p);
  } } };
  walk('src');
  assert.deepEqual(bad, [], 'a second reader of the 2D pressure ramp: read samplerFor(look, "pressure") or PRESSURE_RAMP');
});

test('as-drawn path: celTubeBase and figureHex are the identity for the pressure ramp, and unchanged for everything else', () => {
  for (const look of LOOK_IDS) for (const h of ['#92BDE2', '#D3ECFE', '#5F011F']) {
    const c = hexToRgb01(h);
    assert.deepEqual(celTubeBase(c, look === 'dark', true), c);
    assert.equal(figureHex(h, look, true), h);
    assert.notDeepEqual(celTubeBase(c, look === 'dark'), c, 'the default path still bends a colour');
    assert.deepEqual(tubeInk(look, c, true), tubeInk(look, celTubeBase(c, look === 'dark', true), true));
  }
  assert.ok(isRawLens('pressure') && RAW_LENSES.size === 1, 'only the pressure lens is authored as drawn');
  for (const l of ['flow', 'velocity', 'heat', 'drop', 'oxygen', 'delta', 'direction', 'origin', 'firstpass', 'system', 'since', 'neutral'] as const) assert.ok(!isRawLens(l), l);
});

test('every program that mixes a lens colour into the vessel\'s base also sets tubeRawK from the sets\' lensRaw, crossfaded by lensMix (a lens switch eases from the transform to the raw colour: nothing pops)', () => {
  assert.match(CEL_TUBE_GLSL, /float tubeRawK = 0\.0;/);
  assert.match(CEL_TUBE_GLSL, /, b, tubeRawK\);/, 'celTubeBase ends on the as-drawn mix');
  for (const [name, fs] of [['vessel', VESSEL_FS], ['skin', SKIN_FS], ['cells', CELLS_VS]] as const) {
    assert.match(fs, /uniform float lensRawA;/, `${name} declares lensRawA`);
    assert.match(fs, /uniform float lensRawB;/, `${name} declares lensRawB`);
    assert.match(fs, /(tubeRawK|rawAcc) \+?= [^;]*lensRawA[^;]*lensRawB[^;]*lensMix/, `${name} takes both sets' flags, crossfaded`);
    assert.match(fs, /tubeRawK = (rawAcc|mix\()/, `${name} sets tubeRawK`);
  }
  assert.match(VESSEL_FS, /chevCreamOf\(la, lensGradA, lensModeA, lensI, col, lensRawA\)/);
});

test('the lens field hands the shaders the as-drawn flag with the lens: 1 for the pressure set, 0 for the others; the leaving set keeps its own', () => {
  const f = new LensField();
  f.setLens('pressure', 0, true);
  assert.equal(f.shared.lensRawB.value, 1);
  f.setLens('flow', 10);
  assert.equal(f.shared.lensRawA.value, 1, 'pressure is the leaving set, crossfading out');
  assert.equal(f.shared.lensRawB.value, 0, 'flow is the arriving set');
  f.setLens('pressure', 20, true);
  assert.equal(f.shared.lensRawB.value, 1);
});
