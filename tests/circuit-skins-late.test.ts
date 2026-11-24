// The Circuit's baked skins (583 kB on the wire) are not on the boot path (22 Nov splash review, item 6): the boot waits for the Anatomy's file only, the Circuit's is fetched in the background slot after the first picture
// (or at once when the Circuit is opened), and the install list fills it later with the other late files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLate } from '../scripts/pwa.mjs';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('the boot waits for the Anatomy file only: baked.ts load() never fetches the Circuit file', () => {
  const baked = src('scene/vessels/skin/baked.ts');
  const load = baked.match(/async function load\(\)[^\n]*/)![0];
  assert.match(load, /BAKED_SKINS/); assert.doesNotMatch(load, /CIRCUIT/);
  assert.match(baked, /export function requestCircuitSkins/);
  assert.match(src('main.tsx'), /bakedReady[,\]]/);
  assert.doesNotMatch(src('main.tsx'), /requestCircuitSkins|bakedCircuit/);
});

test('the scene builds the Circuit\'s skins only once the file is in, asks for it after the first picture, and at once when the Circuit opens', () => {
  const scene = src('scene/scene.ts');
  assert.match(scene, /if \(!bakedCircuitPending\(\)\) this\.circuitSkins\.build\(\)/, 'nothing is meshed live while the file is on its way');
  assert.match(scene, /setView[\s\S]{0,2500}v === 'circuit' && bakedCircuitPending\(\)\) \{[^}]*fetchCircuitSkins\(\)/);
  assert.match(src('scene/Stage.tsx'), /cel\.startCircuitSkins\(\)/);
});

test('under node (tests, scripts) the file is on disk, so nothing is pending', async () => {
  const { bakedCircuitPending } = await import('../src/scene/vessels/skin/baked.ts');
  assert.equal(bakedCircuitPending(), false);
});

test('the install list keeps the Circuit file out of the first install, and the Anatomy file in it', () => {
  assert.equal(isLate('assets/circuit-skins-AbCd1234.bin'), true);
  assert.equal(isLate('assets/skins-AbCd1234.bin'), false);
  assert.equal(isLate('assets/organs-AbCd1234.bin'), true, 'the raw organs file is the fallback only: the baked one is on the boot path');
  assert.equal(isLate('assets/organs-baked-AbCd1234.bin'), false);
});
