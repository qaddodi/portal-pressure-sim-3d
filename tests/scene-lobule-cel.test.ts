// The lobule's tissue is cel shaded from the figure's ONE style (cel-style.ts): three tones about the pixel's own local lightness, hard edges, 2D's casing ink on strong edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_QUANT_GLSL, CEL_TISSUE_BANDS } from '../src/scene/materials/cel-quant.ts';
import { CEL_TISSUE_GLSL, EDGE_HI, EDGE_LO, ZONE_EDGES, celTissueJS, tissueInk, tissueTone } from '../src/scene/lobule/cel.ts';
import { LOBULE_PLATE_FS } from '../src/scene/lobule/plate.ts';
import { LOBULE_FIELD_FS } from '../src/scene/lobule/field.ts';

const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
const cell: [number, number, number] = [0.89, 0.72, 0.65];
const lb = luma(cell);
const scale = (c: readonly [number, number, number], g: number): [number, number, number] => [c[0] * g, c[1] * g, c[2] * g];

test('three tones, from the figure\'s one style: the band count is CEL_STYLE.BANDS = 3 everywhere the tissue reads it', () => {
  assert.equal(CEL_STYLE.BANDS, 3);
  assert.equal(CEL_TISSUE_BANDS, CEL_STYLE.BANDS);
  assert.equal(tissueTone(lb, lb), 1, 'the base');
  assert.equal(tissueTone(lb * (1 + 2 * CEL_STYLE.TISSUE.SHADE_AT), lb), 0, 'a shade');
  assert.equal(tissueTone(lb * (1 + 2 * CEL_STYLE.TISSUE.LIT_AT), lb), 2, 'a lit');
});

test('a flat cell is exactly 2D\'s colour; a shaded one takes SHADE off the base, a lit one lifts LIT toward white; the colour keeps its hue and chroma', () => {
  const flat = celTissueJS(cell, lb);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(flat[i]! - cell[i]!) < 1e-9, 'flat stays');
  // a little shade within a tone's width is still the base (no stripes on a near-flat area)
  const near = celTissueJS(scale(cell, 1 + CEL_STYLE.TISSUE.SHADE_AT / 2), lb);
  assert.ok(Math.abs(luma(near) - lb) < 1e-9, 'inside the dead zone it is the base lightness');
  const shade = celTissueJS(scale(cell, 1 + 2 * CEL_STYLE.TISSUE.SHADE_AT), lb);
  assert.ok(Math.abs(luma(shade) - lb * (1 - CEL_STYLE.SHADE)) < 1e-9, 'shade tone');
  const lit = celTissueJS(scale(cell, 1 + 2 * CEL_STYLE.TISSUE.LIT_AT), lb);
  assert.ok(Math.abs(luma(lit) - (lb + (1 - lb) * CEL_STYLE.LIT)) < 1e-9, 'lit tone');
  for (const c of [shade, lit]) {   // the ratios between the channels are the painted colour's (hue and chroma kept)
    assert.ok(Math.abs(c[0] / c[1] - cell[0] / cell[1]) < 1e-9 && Math.abs(c[2] / c[1] - cell[2] / cell[1]) < 1e-9);
  }
});

test('detail much darker or lighter than a tone (a membrane line, a nucleolus) is left as the painter drew it', () => {
  const dark = scale(cell, 1 - 1.2 * CEL_STYLE.TISSUE.DETAIL), bright: [number, number, number] = [1, 1, 1];
  assert.deepEqual(celTissueJS(dark, lb), dark);
  assert.deepEqual(celTissueJS(bright, 0.5), bright, 'white on a mid tone');
});

test('the shaders read the figure\'s numbers: tone strengths, where the tones change, the line, and the edge widths', () => {
  assert.match(CEL_QUANT_GLSL, new RegExp(`CEL_SHADE = ${CEL_STYLE.SHADE.toFixed(2)}`));
  assert.match(CEL_QUANT_GLSL, new RegExp(`CEL_LIT = ${CEL_STYLE.LIT.toFixed(2)}`));
  assert.match(CEL_TISSUE_GLSL, new RegExp(`CEL_SHADE_AT = ${CEL_STYLE.TISSUE.SHADE_AT.toFixed(5)}`));
  assert.match(CEL_TISSUE_GLSL, new RegExp(`CEL_LIT_AT = ${CEL_STYLE.TISSUE.LIT_AT.toFixed(5)}`));
  assert.match(CEL_TISSUE_GLSL, new RegExp(`CEL_LINE_MIN = ${CEL_STYLE.LINE_MIN.toFixed(5)}`));
  assert.ok(EDGE_LO < EDGE_HI && EDGE_HI < CEL_STYLE.SHADE, 'an edge is stronger than a tone\'s soft gradient');
  assert.equal(EDGE_LO, CEL_STYLE.TISSUE.EDGE_LO); assert.equal(EDGE_HI, CEL_STYLE.TISSUE.EDGE_HI);
  assert.match(CEL_TISSUE_GLSL, new RegExp(`CEL_DETAIL = ${CEL_STYLE.TISSUE.DETAIL.toFixed(5)}`));
  assert.ok(CEL_STYLE.TISSUE.SHADE_AT < 0 && CEL_STYLE.TISSUE.LIT_AT > 0 && CEL_STYLE.TISSUE.DETAIL > Math.abs(CEL_STYLE.TISSUE.SHADE_AT) && CEL_STYLE.TISSUE.DETAIL > CEL_STYLE.TISSUE.LIT_AT, 'the dead zone is inside the detail limit, on both sides');
  assert.ok(CEL_STYLE.SHADE < CEL_STYLE.TISSUE.DETAIL, 'the shade tone itself is not detail');
});

test('the plate is cel shaded with clean ink; the neighbours are cel shaded and quieter (no ink); the Zones are three hard zones with a line', () => {
  assert.match(LOBULE_PLATE_FS, /celTissue\(/);
  assert.match(LOBULE_PLATE_FS, /celEdge\(map/);
  assert.match(LOBULE_PLATE_FS, /uniform vec3 ink/);
  assert.match(LOBULE_FIELD_FS, /celTissue\(/);
  assert.doesNotMatch(LOBULE_FIELD_FS, /celEdge\(tile/, 'the neighbours carry no ink');
  assert.ok(ZONE_EDGES[0] > 0.18 && ZONE_EDGES[0] < 0.5 && ZONE_EDGES[1] > 0.5 && ZONE_EDGES[1] < 0.85);
});

test('the ink is 2D\'s casing over the look\'s cell colour, in every look', () => {
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const ink = tissueInk(look);
    assert.ok(ink.every((v) => v >= 0 && v <= 1), look);
    assert.ok(luma(ink) < 0.75, `${look}: a line darker than the cell`);
  }
});
