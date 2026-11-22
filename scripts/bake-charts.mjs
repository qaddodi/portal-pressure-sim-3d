#!/usr/bin/env node
// Bakes every deck's chart data (Plan 33) into public/baked/charts-<engineKey>-<deck>.json at BUILD time: the deck's states (fingerprints, parameters, trails), every curve and course, the all-patients series,
// the ladders and the summary tables' own rows, worked out in node with the engine core and the page's own data functions (src/ui/charts/baked/make.ts). A chart then draws its first frame from the file
// (a talk fetches its one file when it opens), never from an empty frame waiting on a sweep in the worker. The key is the pinned engine; the deck's signature is its words: a file for other numbers is never read.
// Decks are worked out on several threads; a deck whose file is current (same key and signature) is left alone. A failure only warns: the page then works the charts out live as before.
// `--check` builds nothing and says whether every deck's file is current. `--only a,b` bakes just those decks.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

process.env.PPS_NO_BAKED = '1';   // (the bake works live: it must never read the files it is about to replace)
const dir = fileURLToPath(new URL('../public/baked/', import.meta.url));
const { bakeDecks, allCopiedDecks, encodeDeck } = await import('../src/ui/charts/baked/make.ts');
const { deckSig, engineKey } = await import('../src/ui/charts/baked/key.ts');
const file = (id) => `${dir}charts-${engineKey()}-${id}.json`;

if (!isMainThread) {
  const done = {};
  let t = Date.now();
  await bakeDecks(workerData.ids, (d, b) => { const text = encodeDeck(b); writeFileSync(file(d.id), text); done[d.id] = { ms: Date.now() - t, bytes: text.length, gz: gzipSync(text, { level: 9 }).length }; t = Date.now(); });
  parentPort.postMessage(done);
  process.exit(0);
}

const t0 = Date.now();
const decks = await allCopiedDecks();
const current = (d) => { try { const j = JSON.parse(readFileSync(file(d.id), 'utf8')); return j.key === engineKey() && j.sig === deckSig(d); } catch { return false; } };
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const todo = decks.filter((d) => (!only || only.includes(d.id)) && !current(d)).map((d) => d.id);
if (process.argv.includes('--check')) { console.log(todo.length ? `baked charts: ${todo.length} deck(s) missing or for other numbers` : 'baked charts: current'); process.exit(todo.length ? 1 : 0); }
mkdirSync(dir, { recursive: true });
// (files of another engine key are of no use any more)
for (const f of existsSync(dir) ? readdirSync(dir) : []) if (/^charts-/.test(f) && !f.startsWith(`charts-${engineKey()}-`)) rmSync(`${dir}${f}`);
const n = Math.max(1, Math.min(todo.length, cpus().length, 4)), lanes = Array.from({ length: n }, () => []);
// (the longest first, dealt round the lanes, so the threads end together: a deck's time follows its slide count)
const weight = new Map(decks.map((d) => [d.id, d.slides.length]));
todo.sort((a, b) => weight.get(b) - weight.get(a)).forEach((id, i) => lanes[i % n].push(id));
const results = await Promise.all(lanes.filter((l) => l.length).map((ids) => new Promise((ok, no) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ids }, execArgv: process.execArgv, env: process.env });
  w.once('message', ok); w.once('error', no); w.once('exit', (c) => { if (c) no(new Error(`bake thread exited ${c}`)); });
})));
const all = Object.assign({}, ...results), ids = Object.keys(all);
const sum = (k) => ids.reduce((s, id) => s + all[id][k], 0);
console.log(`baked charts: ${ids.length} of ${decks.length} decks (the rest current), ${(sum('bytes') / 1048576).toFixed(2)} MB, ${(sum('gz') / 1048576).toFixed(2)} MB gzip (largest ${(Math.max(0, ...ids.map((id) => all[id].gz)) / 1024).toFixed(0)} kB), ${n} thread(s), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(0);
