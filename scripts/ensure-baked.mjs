#!/usr/bin/env node
// `npm test` runs this first (pretest): when the baked skin files are missing, bake them once (about 35 s), so every `new CelScene()` in the tests lays them in instead of remeshing (baked.ts reads them under node).
// A file that is there but stale is left alone: its digest fails, the scene plans live as before, and `node scripts/bake-skins.mjs` (or `--check`) refreshes it. Set PPS_NO_BAKED=1 to test the live path.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const files = ['skins.bin', 'circuit-skins.bin'].map((n) => fileURLToPath(new URL(`../public/anatomy/${n}`, import.meta.url)));
if (files.every(existsSync)) process.exit(0);
console.log('baked skins missing: baking once so the tests do not remesh every scene');
const r = spawnSync(process.execPath, [fileURLToPath(new URL('./bake-skins.mjs', import.meta.url))], { stdio: 'inherit' });
if (r.status !== 0) console.warn('warning: bake failed; the tests will build skins live (slow)');
process.exit(0);
