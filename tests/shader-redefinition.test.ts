// A real GPU refuses a shader that declares the same attribute, uniform or varying twice (or one three.js already declares for a ShaderMaterial), and the vessel then draws
// nothing: this happened on 19 Nov when the Circuit's block and the vessel's own both declared `rk` (the vessels vanished on an iPhone; the node tests compile nothing). The
// parser the other shader tests use checks syntax only, so this reads the declarations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../src/scene/materials/shaders.ts';
import { DOT_FS, DOT_VS, PLATE_FS, PLATE_VS } from '../src/scene/circuit/map-layer.ts';

// what three.js puts before a ShaderMaterial's own vertex and fragment source
const THREE_VS = ['position', 'normal', 'uv', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic'];
const THREE_FS = ['viewMatrix', 'cameraPosition', 'isOrthographic'];

function declared(src: string): string[] {
  const text = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const names: string[] = [];
  for (const m of text.matchAll(/^\s*(?:uniform|attribute|varying|in|out)\s+(?:(?:highp|mediump|lowp|flat|smooth)\s+)?\w+\s+([^;{(]+);/gm)) {
    for (const part of m[1]!.split(',')) { const n = /^\s*(\w+)/.exec(part); if (n) names.push(n[1]!); }
  }
  return names;
}

const SHADERS: [string, string, string[]][] = [
  ['VESSEL_VS', VESSEL_VS, THREE_VS], ['VESSEL_FS', VESSEL_FS, THREE_FS], ['TOON_VS', TOON_VS, THREE_VS], ['TOON_FS', TOON_FS, THREE_FS], ['INK_VS', INK_VS, THREE_VS], ['INK_FS', INK_FS, THREE_FS],
  ['PLATE_VS', PLATE_VS, THREE_VS], ['PLATE_FS', PLATE_FS, THREE_FS], ['DOT_VS', DOT_VS, THREE_VS], ['DOT_FS', DOT_FS, THREE_FS],
];

for (const [name, src, builtin] of SHADERS) {
  test(`${name} declares nothing twice, and nothing three.js already declares`, () => {
    const names = declared(src);
    assert.ok(names.length > 0, 'found declarations');
    const seen = new Set<string>();
    for (const n of names) {
      assert.ok(!seen.has(n), `${name} declares ${n} twice`);
      seen.add(n);
    }
    for (const n of names) assert.ok(!builtin.includes(n), `${name} redeclares ${n}, which three.js declares`);
  });
}

test('the vessel shader names the per-vertex attributes the geometry carries, once each', () => {
  const names = declared(VESSEL_VS);
  for (const a of ['tang', 'rk', 'narrow', 'cC', 'tC', 'fr', 'pk']) assert.equal(names.filter((n) => n === a).length, 1, `${a} is declared once`);
});
