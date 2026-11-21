#!/usr/bin/env node
// `npm test` runs this first (pretest): when the baked skin files are missing, bake them once (about 35 s), so every `new CelScene()` in the tests lays them in instead of remeshing (baked.ts reads them under node).
// A file older than the skin code is baked again (a git checkout stamps every file alike, so a fresh clone with files present is also rebaked once). Set PPS_NO_BAKED=1 to test the live path.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const files = ['skins.bin', 'circuit-skins.bin'].map((n) => fileURLToPath(new URL(`../public/anatomy/${n}`, import.meta.url)));
// (the digest only covers what the tubes are made FROM, not the mesher: a file older than the skin code or the circuit's skins was made by other code, so it is baked again)
const srcDir = fileURLToPath(new URL('../src/scene/vessels/skin/', import.meta.url)), circuitSkins = fileURLToPath(new URL('../src/scene/circuit/skins.ts', import.meta.url));
const newest = Math.max(statSync(circuitSkins).mtimeMs, ...readdirSync(srcDir).filter((f) => f.endsWith('.ts')).map((f) => statSync(srcDir + f).mtimeMs));
if (files.every(existsSync) && files.every((f) => statSync(f).mtimeMs >= newest)) process.exit(0);
console.log('baked skins missing or older than the skin code: baking once so the tests do not remesh every scene');
const r = spawnSync(process.execPath, [fileURLToPath(new URL('./bake-skins.mjs', import.meta.url))], { stdio: 'inherit' });
if (r.status !== 0) console.warn('warning: bake failed; the tests will build skins live (slow)');
process.exit(0);
