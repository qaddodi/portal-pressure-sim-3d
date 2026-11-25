// Organ depth and organ fill (Settings > Figure depth): the baked tuck term is in range, deterministic and cheap, the shader adds nothing when the switch is off, the uniforms follow the
// settings live, and the solid fill is opaque while the see-through wash stays exactly the layer's opacity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry } from 'three';
import manifest from '../src/scene/organs/organs-manifest.json' with { type: 'json' };
import { bakeOrganDepth, creaseOf, type DepthPart } from '../src/scene/organs/organ-depth.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { bindOrganSettings } from '../src/scene/organs/organ-settings.ts';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { useSettings } from '../src/state/settings.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
setOrganData(buf);

function realParts(): Record<string, DepthPart> {
  const out: Record<string, DepthPart> = {};
  for (const id of Object.keys(manifest.organs)) {
    const g: BufferGeometry = ORGAN_MESHES[id]!();
    out[id] = { pos: g.getAttribute('position').array, normal: g.getAttribute('normal').array, index: g.index!.array };
  }
  return out;
}

test('the baked term is a byte per vertex, in range, deterministic, and small (well under 256 KB, none of it shipped)', async () => {
  await organsReady;
  const parts = realParts();
  const t0 = performance.now();
  const a = bakeOrganDepth(parts);
  const ms = performance.now() - t0;
  const b = bakeOrganDepth(parts);
  let bytes = 0, lo = 255, hi = 0, sum = 0, n = 0;
  for (const id of Object.keys(parts)) {
    assert.equal(a[id]!.length, parts[id]!.pos.length / 3, `${id}: one byte per vertex`);
    assert.deepEqual(a[id], b[id], `${id}: the same meshes give the same bytes`);
    bytes += a[id]!.length;
    for (const v of a[id]!) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; n++; }
  }
  assert.ok(bytes < 256 * 1024, `${bytes} bytes of baked data`);
  assert.ok(hi > 100, `some points are tucked in (max ${hi})`);
  assert.ok(sum / n / 255 < 0.5, `most of the surface is open (mean ${(sum / n / 255).toFixed(2)})`);
  assert.ok(sum / n / 255 > 0.01, 'and the term is not all zero');
  assert.ok(lo >= 0);
  console.log(`# organ depth bake: ${n} vertices, ${bytes} bytes, ${ms.toFixed(1)} ms in node (mean ${(sum / n / 255).toFixed(3)}, max ${hi})`);
  // (placed path: the approved placement's meshes have 134 752 vertices to today's 76 378, the gut tubes and the twice-refined rims; the bar is the same time per vertex)
  assert.ok(ms < 400 * (n / 76378), `the bake took ${ms} ms`);
});

test('a crease is tucked more than a flat or a bulge; where one organ meets another is tucked, and the same organ never darkens itself', () => {
  // a strip of triangles folded into a valley (z = |x|), a flat strip and a ridge (z = -|x|), normals facing +z
  const strip = (f: (x: number) => number): DepthPart => {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [], N = 21, M = 6;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const x = (i - 10) * 0.01; pos.push(x, j * 0.01, f(x)); nor.push(0, 0, 1); }
    for (let j = 0; j < M - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i; idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N); }
    return { pos, normal: nor, index: idx };
  };
  const mid = (v: Float32Array) => v[3 * 21 + 10]!;
  const valley = mid(creaseOf(strip((x) => Math.abs(x) * 1.5))), flat = mid(creaseOf(strip(() => 0))), ridge = mid(creaseOf(strip((x) => -Math.abs(x) * 1.5)));
  assert.ok(valley > 0.2 && flat < 0.01 && ridge < 0.1 && valley > 4 * ridge,`valley ${valley}, flat ${flat}, ridge ${ridge}`);
  // two single-vertex-thick sheets that touch, one far away; an atlas of the same group
  const sheet = (z: number): DepthPart => { const pos: number[] = [], nor: number[] = [], idx: number[] = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { pos.push(i * 0.02, j * 0.02, z); nor.push(0, 0, 1); } for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const a = j * 4 + i; idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4); } return { pos, normal: nor, index: idx }; };
  const r = bakeOrganDepth({ liver: sheet(0), stomach: sheet(0.01), far: sheet(1), heart: sheet(2), 'heart-ra': sheet(2.01) });
  const avg = (v: Uint8Array) => v.reduce((s, x) => s + x, 0) / v.length;
  assert.ok(avg(r.liver!) > 60 && avg(r.stomach!) > 60, 'two organs that meet darken each other (a 2-cell sheet: the contact is a continuous field now, read between cells)');
  assert.equal(avg(r.far!), 0, 'an organ with nothing near it has no contact shade');
  assert.equal(avg(r.heart!), 0, 'the atrium is part of the heart: no contact between them');
});

test('with the switch off the shader adds nothing: the depth block is behind depthAmt, and the baked attribute defaults to 0', () => {
  assert.match(ORGAN_FS, /uniform float depthAmt;/);
  assert.match(ORGAN_FS, /if \(depthAmt > 0\.001\) \{/);
  // everything the depth adds is inside that block and scaled by depthAmt; the wash above it is untouched
  const block = ORGAN_FS.slice(ORGAN_FS.indexOf('if (depthAmt > 0.001)'), ORGAN_FS.indexOf('// Cel shaded: the wash'));
  assert.equal((block.match(/depthAmt/g) ?? []).length, 3);
  assert.match(block, /fill = mix\(fill, ogDark\.rgb,.*\* depthAmt\)/);
  assert.match(block, /fill = mix\(fill, ogLight\.rgb,.*\* depthAmt\)/);
  assert.match(ORGAN_VS, /attribute float depthAo;/);
  assert.match(ORGAN_VS, /vAo = depthAo;/);
  // palette tokens only: the colours it mixes are the look's og-dark and og-light, no literal colours
  assert.doesNotMatch(block, /vec3\(\s*[01]\.\d+\s*,\s*[01]\.\d+\s*,\s*[01]\.\d+\s*\)\s*[,)]\s*[^;]*depthAmt/);
});

test('the organ fill is the see-through wash only: the layer\'s opacity, no cel branch, no solid uniform', () => {
  assert.doesNotMatch(ORGAN_FS, /uniform float solid;|celBands|celBase|uniform float wash;/, 'no cel fill and no wash switch');
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, lay \* fade \* win\)/);
  assert.doesNotMatch(ORGAN_FS, /mix\(page, fill, layer\)/);
});

async function sceneWithOrgans() {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  return s;
}

test('every organ carries the baked byte, as a normalized attribute, and the shaders\' uniforms are shared and follow the settings live', async () => {
  const s = await sceneWithOrgans();
  const organs = s.disease.organs;
  assert.ok(organs.ids.length >= 9);
  for (const o of organs.objects) {
    const at = o.toonMesh.geometry.getAttribute('depthAo');
    assert.ok(at && at.normalized && at.itemSize === 1, 'depthAo is one normalized byte');
    assert.ok(o.toon.uniforms.depthAmt, 'depthAmt'); assert.ok(!o.toon.uniforms.solid, 'no fill switch');
  }
  const u = (k: string) => organs.objects.map((o) => o.toon.uniforms[k]!.value as number);
  const t0 = u('depthAmt');
  assert.ok(t0.every((v) => v === 0), 'nothing before a setting is bound');

  const calls: string[] = [];
  const un = bindOrganSettings(organs, useSettings, (why) => calls.push(why));
  // the saved choice is taken at once on the first update: the default is depth on
  organs.update(1000);
  assert.ok(u('depthAmt').every((v) => v === 1), 'Organ depth on by default: the uniform is 1');
  // off: it eases to zero on the clock, then is exactly zero (the shader then skips the whole block)
  useSettings.getState().set('organDepth', false);
  assert.ok(calls.length >= 2, 'a frame is asked for');
  let moving = organs.update(1016);
  assert.ok(moving && u('depthAmt')[0]! < 1 && u('depthAmt')[0]! > 0, 'it eases, it does not pop');
  for (let t = 1032; t < 4000 && organs.update(t); t += 16);
  assert.ok(u('depthAmt').every((v) => v === 0), 'off: the uniform ends at exactly 0');
  useSettings.getState().set('organDepth', true);
  for (let t = 4016; t < 8000 && organs.update(t); t += 16);
  assert.ok(u('depthAmt').every((v) => v === 1), 'depth on again');
  // the layer's own opacity never changes with either setting
  const layers = organs.objects.map((o) => o.toon.uniforms.layer!.value as number);
  assert.ok(layers.every((v) => v > 0 && v < 1), 'the see-through opacity logic is untouched');
  moving = organs.update(16100);
  assert.equal(moving, false, 'nothing eases once settled: no frames asked for');
  un();
  s.dispose?.();
});
