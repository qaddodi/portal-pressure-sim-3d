#!/usr/bin/env node
// Production build to dist/ (bundled, minified, hashed file names). The build id (short commit) is stamped into the bundle for ?perf
// and written to dist/build-info.txt so "which build am I looking at" has one answer.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
// (VITE_BUILD, when the caller sets it, is the build id as "branch@commit": the Pages workflow builds two checkouts and names each.)
const preset = process.env.VITE_BUILD?.split('@');
const commit = preset?.[1] || sh('rev-parse', '--short=8', 'HEAD') || process.env.GITHUB_SHA?.slice(0, 8) || 'local';
const branch = preset?.[0] || sh('rev-parse', '--abbrev-ref', 'HEAD') || process.env.GITHUB_REF_NAME || 'unknown';

// The release: package.json's version, stamped into the bundle as VITE_RELEASE (About and the feedback draft show it; docs/release.md says how it is bumped).
const release = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;

// The Lobule's weld plan is made here, once, and shipped as a file (a phone plans nothing). A failure only warns: the page then plans in a worker.
const bake = spawnSync(process.execPath, [fileURLToPath(new URL('./bake-welds.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
if (bake.status !== 0) console.warn('warning: the Lobule weld plan was not baked; the page will plan it in a worker');

// The Anatomy's junction skins (src/scene/vessels/skin) are made here too: planning and meshing the 14 of them is seconds of CPU, a stall before the first picture. A failure only warns: the page then builds them live.
const bakeSkins = spawnSync(process.execPath, [fileURLToPath(new URL('./bake-skins.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
if (bakeSkins.status !== 0) console.warn('warning: the Anatomy skins were not baked; the page will build them at load');

const r = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BUILD: `${branch}@${commit}`, VITE_RELEASE: release } });
if (r.status !== 0) process.exit(r.status ?? 1);
// The 2D stylesheets are copied whole; the rules that style something this app never makes are taken out of the BUILT file (scripts/css-unused.mjs; the copies in src/ui/css2d stay byte for byte). PPS_NO_CSS_PRUNE=1 skips it.
if (!process.env.PPS_NO_CSS_PRUNE) { const cp = spawnSync(process.execPath, [fileURLToPath(new URL('./css-unused.mjs', import.meta.url)), '--write'], { cwd: root, stdio: 'inherit' }); if (cp.status !== 0) console.warn('warning: the stylesheet was not pruned; it ships whole'); }
writeFileSync(`${root}dist/build-info.txt`, `version ${release}\nbranch ${branch}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\n`);
const pw = spawnSync(process.execPath, [fileURLToPath(new URL('./pwa.mjs', import.meta.url)), `${root}dist`, `${commit}`], { cwd: root, stdio: 'inherit' });
if (pw.status !== 0) process.exit(pw.status ?? 1);
console.log(`built v${release} ${branch}@${commit} → dist/`);
