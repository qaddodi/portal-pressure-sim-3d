#!/usr/bin/env node
// Copies hales-engine (core, portal and the simulation host with its typed protocol) into src/engine/hales/ at a pinned commit, and records it
// in src/engine/PINNED.json with a hash of every file. Nothing in the 3D app edits that folder by hand; tests/engine-pinned.test.ts fails when
// a file and its hash disagree. (Until 22 Nov the host, worker-core.js, came from the 2D app's repo; it is the engine's own now: src/host/.)
//
//   node scripts/sync-engine.mjs [--engine <dir>] [--engine-ref <ref>]
//
// Default: ../hales-engine at origin/main. A ref is read straight from git (git show), so the working tree can be dirty or on another branch.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const engineDir = resolve(root, arg('engine', '../hales-engine'));
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const resolveRef = (dir, ref) => git(dir, 'rev-parse', '--verify', `${ref}^{commit}`).trim();
const engineRef = resolveRef(engineDir, arg('engine-ref', 'origin/main'));
const remote = (dir) => git(dir, 'remote', 'get-url', 'origin').trim().replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');

const files = {};   // path (relative to src/engine) -> text

for (const path of git(engineDir, 'ls-tree', '-r', '--name-only', engineRef, 'src').split('\n').filter((p) => p.endsWith('.js') || p.endsWith('.d.ts'))) {
  files[`hales/${path.slice('src/'.length)}`] = git(engineDir, 'show', `${engineRef}:${path}`);
}

const out = join(root, 'src/engine');
for (const d of ['hales']) rmSync(join(out, d), { recursive: true, force: true });
const hashes = {};
for (const [p, text] of Object.entries(files)) {
  mkdirSync(dirname(join(out, p)), { recursive: true });
  writeFileSync(join(out, p), text);
  hashes[p] = createHash('sha256').update(text).digest('hex');
}
const pinned = { note: 'Written by scripts/sync-engine.mjs. Do not edit the folders it lists.',
  engine: { repo: remote(engineDir), commit: engineRef }, files: hashes };
writeFileSync(join(out, 'PINNED.json'), `${JSON.stringify(pinned, null, 2)}\n`);
console.log(`engine ${pinned.engine.repo}@${engineRef.slice(0, 8)}: ${Object.keys(files).length} files`);
console.log('next: npm run gen:departures (re-records where this engine departs from the 2D numbers; tests/engine-departures.test.ts fails until it is run)');
