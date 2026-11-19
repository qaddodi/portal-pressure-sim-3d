#!/usr/bin/env node
// Fast repo rules that are not types: the one-clock rule lives in tests/one-clock.test.ts; this checks the files a person may not hand-edit.
// (Kept tiny on purpose: node only, well under a second.)
import { readFileSync, existsSync } from 'node:fs';
const problems = [];
const pinned = JSON.parse(readFileSync(new URL('../src/engine/PINNED.json', import.meta.url), 'utf8'));
if (!pinned.engine?.commit || !pinned.host?.commit) problems.push('src/engine/PINNED.json has no pinned commits: run npm run sync:engine');
for (const f of ['AGENTS.md', 'CLAUDE.md', 'index.html']) if (!existsSync(new URL(`../${f}`, import.meta.url))) problems.push(`missing ${f}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('lint: ok');
