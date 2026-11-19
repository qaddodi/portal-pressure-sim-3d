#!/usr/bin/env node
// Production build to dist/ (bundled, minified, hashed file names). The build id (short commit) is stamped into the bundle for ?perf
// and written to dist/build-info.txt so "which build am I looking at" has one answer.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
const commit = process.env.GITHUB_SHA?.slice(0, 8) || sh('rev-parse', '--short=8', 'HEAD') || 'local';
const branch = process.env.GITHUB_REF_NAME || sh('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown';

const r = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BUILD: `${branch}@${commit}` } });
if (r.status !== 0) process.exit(r.status ?? 1);
writeFileSync(`${root}dist/build-info.txt`, `branch ${branch}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\n`);
console.log(`built ${branch}@${commit} → dist/`);
