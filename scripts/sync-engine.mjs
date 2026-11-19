#!/usr/bin/env node
// Copies hales-engine (the engine) and the simulation host (the worker's message loop, today still living in the 2D app) into
// src/engine/hales/ and src/engine/host/ at pinned commits, and records them in src/engine/PINNED.json with a hash of every file.
// Nothing in the 3D app edits those folders by hand; tests/engine-pinned.test.ts fails when a file and its hash disagree.
//
//   node scripts/sync-engine.mjs [--engine <dir>] [--engine-ref <ref>] [--host <dir>] [--host-ref <ref>]
//
// Defaults: ../hales-engine at origin/main, ../portal-pressure-simulator at origin/main. A ref is read straight from git
// (git show), so the working tree of either clone can be dirty or on another branch.
// The host is a stopgap: when hales-engine ships its own worker host, --host goes away and this script copies that instead.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const engineDir = resolve(root, arg('engine', '../hales-engine')), hostDir = resolve(root, arg('host', '../portal-pressure-simulator'));
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const resolveRef = (dir, ref) => git(dir, 'rev-parse', '--verify', `${ref}^{commit}`).trim();
const engineRef = resolveRef(engineDir, arg('engine-ref', 'origin/main'));
const hostRef = resolveRef(hostDir, arg('host-ref', 'origin/main'));
const remote = (dir) => git(dir, 'remote', 'get-url', 'origin').trim().replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');

const files = {};   // path (relative to src/engine) -> text
const CORE = ['gap', 'linalg', 'physiology'];

for (const path of git(engineDir, 'ls-tree', '-r', '--name-only', engineRef, 'src').split('\n').filter((p) => p.endsWith('.js'))) {
  files[`hales/${path.slice('src/'.length)}`] = git(engineDir, 'show', `${engineRef}:${path}`);
}

// The host: its imports named the 2D app's flat engine folder; point them at the core/portal layout, and its one UI import (the
// camera's easing curve, also used for a change of patient) at a copy of that curve.
let host = git(hostDir, 'show', `${hostRef}:src/worker-core.js`);
host = host.replace(/from '\.\/engine\/([\w-]+)\.js'/g, (_, n) => `from '../hales/${CORE.includes(n) ? 'core' : 'portal'}/${n}.js'`)
  .replace("from './ui/ease.js'", "from './ease.js'");
const unresolved = [...host.matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]).filter((p) => !p.startsWith('../hales/') && p !== './ease.js');
if (unresolved.length) throw new Error(`host imports not mapped: ${unresolved.join(', ')}`);
const missing = [...host.matchAll(/from '\.\.\/hales\/([^']+)'/g)].map((m) => m[1]).filter((p) => !files[`hales/${p}`]);
if (missing.length) throw new Error(`host needs engine files that hales-engine does not have at ${engineRef.slice(0, 8)}: ${missing.join(', ')}`);
files['host/worker-core.js'] = `// @ts-nocheck\n${host}`;
files['host/ease.js'] = `// The quintic smoothstep the 2D app calls easeMove (src/ui/ease.js there), for a change of patient.\nexport const easeMove = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));\n`;

const out = join(root, 'src/engine');
for (const d of ['hales', 'host']) rmSync(join(out, d), { recursive: true, force: true });
const hashes = {};
for (const [p, text] of Object.entries(files)) {
  mkdirSync(dirname(join(out, p)), { recursive: true });
  writeFileSync(join(out, p), text);
  hashes[p] = createHash('sha256').update(text).digest('hex');
}
const pinned = { note: 'Written by scripts/sync-engine.mjs. Do not edit the folders it lists.',
  engine: { repo: remote(engineDir), commit: engineRef }, host: { repo: remote(hostDir), commit: hostRef, file: 'src/worker-core.js' }, files: hashes };
writeFileSync(join(out, 'PINNED.json'), `${JSON.stringify(pinned, null, 2)}\n`);
console.log(`engine ${pinned.engine.repo}@${engineRef.slice(0, 8)}, host ${pinned.host.repo}@${hostRef.slice(0, 8)}: ${Object.keys(files).length} files`);
