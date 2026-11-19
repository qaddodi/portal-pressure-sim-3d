// The ?gl page's logic, run against a stand-in driver (no browser): a refused program reads red with the driver's log, the others green, and the text Copy puts on the clipboard says which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group } from 'three';
import { checkText, limitsOf, runGlCheck } from '../src/debug/gl-check-run.ts';
import type { GlHandle } from '../src/debug/gl-ref.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';

const FIBRO = readFileSync('src/ui/tests/fibro/copied/fibro-gl.copied.js', 'utf8');

/** A driver that links every program except the ones whose source holds `refuse`. */
function fakeDriver(refuse: string) {
  const sources = new Map<object, string>();
  const bad = new Set<object>();
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, HIGH_FLOAT: 4, RENDERER: 5, VENDOR: 6, VERSION: 7, MAX_VERTEX_ATTRIBS: 8, MAX_VARYING_VECTORS: 9, MAX_VERTEX_UNIFORM_VECTORS: 10, MAX_FRAGMENT_UNIFORM_VECTORS: 11, MAX_TEXTURE_IMAGE_UNITS: 12,
    getExtension: () => null,
    getParameter: (p: number) => ({ 5: 'Fake GPU', 6: 'Fake', 7: 'WebGL 2.0', 8: 16, 9: 15, 10: 256, 11: 224, 12: 16 }[p] ?? 0),
    getShaderPrecisionFormat: () => ({ precision: 23 }),
    createShader: () => ({}), shaderSource: (s: object, src: string) => { sources.set(s, src); },
    compileShader: () => undefined, createProgram: () => ({}),
    attachShader: (p: object, s: object) => { if ((sources.get(s) ?? '').includes(refuse)) bad.add(p); },
    linkProgram: () => undefined, deleteProgram: () => undefined, deleteShader: () => undefined, isContextLost: () => false,
    getProgramParameter: (p: object) => !bad.has(p),
    getShaderInfoLog: (s: object) => ((sources.get(s) ?? '').includes(refuse) ? `ERROR: 0:1: '${refuse}' : redefinition` : ''),
    getProgramInfoLog: (p: object) => (bad.has(p) ? 'link failed' : ''),
  };
  return gl;
}

test('every program is a row: green when it links, red with the driver\'s log when it does not', async () => {
  const gl = fakeDriver('SPK_MARK');
  const r = { getContext: () => gl as unknown as WebGL2RenderingContext, compileAsync: async () => undefined, properties: { get: () => undefined } } as unknown as GlHandle;
  const { limits, rows } = await runGlCheck(r, new Group(), {}, FIBRO);
  assert.equal(rows.length, rawPrograms(FIBRO).length, 'an empty scene leaves the registered programs');
  assert.equal(limits.renderer, 'Fake GPU');
  assert.ok(rows.every((x) => x.how === 'text'));
  assert.ok(rows.every((x) => x.ok), 'a driver that refuses nothing links everything');
  const bad = await runGlCheck({ ...r, getContext: () => fakeDriver('u_size') as unknown as WebGL2RenderingContext } as GlHandle, new Group(), {}, FIBRO);
  const red = bad.rows.filter((x) => !x.ok);
  assert.deepEqual(red.map((x) => x.name), ['charts'], 'only the chart program holds u_size');
  assert.match(red[0]!.log, /u_size.*redefinition/);
  const text = checkText(bad.limits, bad.rows, 'abc1234');
  assert.match(text, /FAIL {2}charts/);
  assert.match(text, /\d+ of \d+ programs link; 1 need a look/);
  assert.match(text, /highp in fragment yes/);
});

test('limits come from the driver, and a program over this device\'s limits is a warning on its row', async () => {
  const gl = fakeDriver('never') as ReturnType<typeof fakeDriver>;
  gl.getParameter = (p: number) => ({ 5: 'Tiny GPU', 6: 'Fake', 7: 'WebGL 2.0', 8: 1, 9: 15, 10: 256, 11: 224, 12: 16 }[p] ?? 0);
  assert.equal(limitsOf(gl as unknown as WebGL2RenderingContext).attributes, 1);
  const r = { getContext: () => gl as unknown as WebGL2RenderingContext, compileAsync: async () => undefined, properties: { get: () => undefined } } as unknown as GlHandle;
  const { rows } = await runGlCheck(r, new Group(), {}, FIBRO);
  assert.ok(rows.find((x) => x.name === 'charts')!.warn.some((w) => /attributes/.test(w)), 'one attribute a device has, the chart program wants two');
});
