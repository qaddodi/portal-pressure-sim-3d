// The sinusoid, cel shaded: 2D's shader is wrapped, never edited, and the step reads the figure's one style (src/scene/cel-style.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_DEAD_DISSE, CEL_DEAD_LUMEN, CEL_EDGE_HI, CEL_EDGE_LO, CEL_INK, CEL_MAIN_GLSL, CEL_STEP, celAnchored, celEdge, celQuantRel, celSinusoidFS } from '../src/scene/sinusoid/cel.ts';
import { SINUSOID_FS } from '../src/scene/sinusoid/gl.copied.ts';
import { SINUSOID_CEL_FS } from '../src/scene/sinusoid/view.ts';

const light = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('the cel step reads cel-style.ts: one band step is one shade step, the ink is the shade three times over, no number of its own', () => {
  assert.ok(Math.abs(Math.exp(-CEL_STEP) - (1 - CEL_STYLE.SHADE)) < 1e-12, 'a band is one shade step: x (1 - SHADE)');
  assert.equal(CEL_EDGE_LO, CEL_STYLE.TISSUE.SIN_EDGE_LO); assert.equal(CEL_EDGE_HI, CEL_STYLE.TISSUE.SIN_EDGE_HI);   // the painted lines' own contrast: a stronger tone must not unink a cell's outline
  assert.ok(Math.abs(CEL_INK - (1 - CEL_STYLE.SHADE) ** 3) < 1e-12);
  assert.match(CEL_MAIN_GLSL, new RegExp(`CEL_STEP \\* ${CEL_STYLE.EDGE_PX.toFixed(2)}`), 'the band edge is EDGE_PX across');
  const src = readFileSync(new URL('../src/scene/sinusoid/cel.ts', import.meta.url), 'utf8');
  assert.ok(!/0\.17|0\.15\b|0\.16\b|-0\.16|0\.24\b/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'no second copy of the style numbers');
});

test('2D\'s shader is wrapped, not edited: its main is renamed and the cel main calls it, the copy is otherwise whole', () => {
  assert.equal(celSinusoidFS(SINUSOID_FS), SINUSOID_CEL_FS);
  assert.ok(SINUSOID_CEL_FS.includes('void main2d() {') && SINUSOID_CEL_FS.includes('main2d();'));
  const rest = SINUSOID_CEL_FS.slice(0, SINUSOID_CEL_FS.indexOf('\n' + CEL_MAIN_GLSL)).replace('void main2d() {', 'void main() {');
  assert.equal(rest, SINUSOID_FS, 'everything before the cel main is 2D\'s text, byte for byte, but the one rename');
  assert.throws(() => celSinusoidFS(SINUSOID_FS + '\nvoid main() {}'), /exactly one/);
  assert.match(SINUSOID_CEL_FS, /o = vec4\(mix\(o\.rgb, cq \* a, step\(0\.003, a\)\), a\)/, 'premultiplied, 2D\'s own alpha (the dive\'s crossfade) untouched');
  assert.match(SINUSOID_CEL_FS, /vec3 c = o\.rgb \/ max\(a, 1e-4\)/);
});

test('the step keeps hue and chroma, is idempotent, moves a flat fill by at most half a band and gives hard bands', () => {
  const fills: [number, number, number][] = [[0.89, 0.72, 0.65], [0.45, 0.26, 0.2], [0.35, 0.3, 0.55], [0.08, 0.1, 0.07]];
  for (const c of fills) {
    const q = celQuantRel(c);
    assert.ok(Math.abs(q[0] / c[0] - q[1] / c[1]) < 1e-9 && Math.abs(q[1] / c[1] - q[2] / c[2]) < 1e-9, 'the colour is scaled, never remixed: hue and chroma ratios kept');
    const again = celQuantRel(q);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(again[i]! - q[i]!) < 1e-6, 'a stepped colour stays where it is');
    assert.ok(Math.abs(Math.log(light(q) / light(c))) <= CEL_STEP / 2 + 1e-9, 'at most half a band from 2D\'s own colour');
  }
  // a smooth ramp (the lumen's shading) comes out as a few flat tones
  const levels = new Set<string>();
  for (let i = 0; i <= 200; i++) { const t = 0.5 + 0.5 * i / 200; levels.add(light(celQuantRel([0.6 * t, 0.4 * t, 0.8 * t])).toFixed(5)); }
  assert.ok(levels.size >= 3 && levels.size <= 6, `a 2:1 ramp is ${levels.size} flat tones`);
});

test('the ink: a flat or gently shaded pixel carries none, a cell edge carries it fully', () => {
  assert.equal(celEdge(0, 0.6), 0);
  assert.equal(celEdge(0.02, 0.6), 0, 'a smooth gradient is not an edge');
  assert.equal(celEdge(0.6 * CEL_EDGE_HI * 1.01, 0.6), 1);
  assert.equal(celEdge(0.6 * CEL_EDGE_LO * 0.9, 0.6), 0, 'a change just under the edge threshold (a membrane, a lymph dash) is not inked');
  assert.ok(celEdge(0.6 * (CEL_EDGE_LO + CEL_EDGE_HI) / 2, 0.6) > 0.4 && celEdge(0.6 * (CEL_EDGE_LO + CEL_EDGE_HI) / 2, 0.6) < 0.6);
});

test('the Disse and the wall are one flat tone in 2D\'s own colour; the lumen still steps; the ink skips low contrast', () => {
  const lb = 0.78;   // 2D's Disse colour's lightness (say)
  // a Disse-like low-amplitude ramp: lymph dashes, collagen bands, the wall's soft blend: under 1.5 shade steps across
  const seen = new Set<string>();
  for (let i = 0; i <= 400; i++) { const u = (i / 400 * 2 - 1) * (CEL_DEAD_DISSE - 0.01); seen.add(celAnchored(lb * Math.exp(u * CEL_STEP), lb, CEL_DEAD_DISSE).toFixed(6)); }
  assert.equal(seen.size, 1, 'within +-0.75 steps of 2D\'s Disse colour it is that colour, exactly');
  assert.ok(Math.abs([...seen][0]! as unknown as number - lb) < 1e-6);
  // ... while a real change of tone (a tick, the lilac wall: a step and a half or more) is a different, flat rung
  assert.notEqual(celAnchored(lb * Math.exp(-1.2 * CEL_STEP), lb, CEL_DEAD_DISSE), lb);
  assert.notEqual(celAnchored(lb * Math.exp(1.2 * CEL_STEP), lb, CEL_DEAD_DISSE), lb);
  // the lumen: a 2:1 ramp around its colour still steps into 3 to 6 tones
  const lum = new Set<string>(), base = 0.5;
  for (let i = 0; i <= 400; i++) lum.add(celAnchored(base * (0.7 + 0.6 * i / 400), base, CEL_DEAD_LUMEN).toFixed(6));
  assert.ok(lum.size >= 3 && lum.size <= 6, `the lumen's shading is ${lum.size} tones`);
  assert.ok(lum.has(base.toFixed(6)), 'its own colour is one of them');
  // the ink: none for the Disse's gradients and dashes, full on a wall's outline
  assert.equal(celEdge(lb * CEL_EDGE_LO * 0.35, lb), 0); assert.equal(celEdge(lb * CEL_EDGE_LO * 0.9, lb), 0);
  assert.equal(celEdge(lb * CEL_EDGE_HI * 1.2, lb), 1);
  assert.match(CEL_MAIN_GLSL, /onDisse \* smoothstep/, 'no ink inside the Disse band');
});
