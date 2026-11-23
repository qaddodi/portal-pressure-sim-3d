#!/usr/bin/env node
// `npm run test:time tests/a.test.ts tests/b.test.ts` runs each named test file ALONE (one at a time, so the seconds are its own) and records them in tests/timings.json, which the pre-push uses to start the
// longest files first. Only the files you name: never the whole suite in the cloud. `--all` times every file (a laptop, once in a while).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), file = `${root}tests/timings.json`;
const args = process.argv.slice(2).filter((a) => a !== '--all');
const names = process.argv.includes('--all') ? readdirSync(`${root}tests`).filter((f) => f.endsWith('.test.ts')) : args.map((a) => a.replace(/^.*tests\//, ''));
if (!names.length) { console.error('usage: npm run test:time tests/x.test.ts [more files]   (or --all)'); process.exit(2); }
const timings = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
for (const n of names) {
  const t = Date.now(), r = spawnSync(process.execPath, ['--test', `tests/${n}`], { cwd: root, stdio: 'ignore' });
  const s = Math.round((Date.now() - t) / 100) / 10;
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${n} ${s} s`);
  if (r.status === 0) timings[n] = s;
}
writeFileSync(file, `${JSON.stringify(Object.fromEntries(Object.entries(timings).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1)}\n`);
