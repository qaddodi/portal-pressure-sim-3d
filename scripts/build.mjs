#!/usr/bin/env node
// Production build to dist/ (bundled, minified, hashed file names). The build id (short commit) is stamped into the bundle for ?perf
// and written to dist/build-info.txt so "which build am I looking at" has one answer.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
// (VITE_BUILD, when the caller sets it, is the build id as "branch@commit": the Pages workflow builds two checkouts and names each.)
const preset = process.env.VITE_BUILD?.split('@');
const commit = preset?.[1] || sh('rev-parse', '--short=8', 'HEAD') || process.env.GITHUB_SHA?.slice(0, 8) || 'local';
const branch = preset?.[0] || sh('rev-parse', '--abbrev-ref', 'HEAD') || process.env.GITHUB_REF_NAME || 'unknown';

// The Lobule's weld plan is made here, once, and shipped as a file (a phone plans nothing). A failure only warns: the page then plans in a worker.
const bake = spawnSync(process.execPath, [fileURLToPath(new URL('./bake-welds.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
if (bake.status !== 0) console.warn('warning: the Lobule weld plan was not baked; the page will plan it in a worker');

const r = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BUILD: `${branch}@${commit}` } });
if (r.status !== 0) process.exit(r.status ?? 1);
writeFileSync(`${root}dist/build-info.txt`, `branch ${branch}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\n`);
const pw = spawnSync(process.execPath, [fileURLToPath(new URL('./pwa.mjs', import.meta.url)), `${root}dist`, `${commit}`], { cwd: root, stdio: 'inherit' });
if (pw.status !== 0) process.exit(pw.status ?? 1);
console.log(`built ${branch}@${commit} → dist/`);
