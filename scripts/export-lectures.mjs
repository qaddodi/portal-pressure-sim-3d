#!/usr/bin/env node
// `npm run export:lectures -- <which> [options]`: any lectures (talks) as one zip of Markdown outlines, in well under a second a talk once its numbers are baked. No browser, no GPU.
// Each talk is one .md file: its cards in full (the words card and the data card, readings printed as the cards print them), the figure's camera in numbers and in words (what it is centred on,
// how far in, what stands in the room, where the labels stand), the lens, marks and vessels in view, and a flat SVG wireframe per slide (the placed organs and vessels through the slide's camera, the
// planned cards over them). Plus INDEX.md. Source: src/ui/debug/export/ (lecture.ts, wire.ts, frame.ts); the picking is the audit's request grammar (docs/audit.md).
//
//   npm run export:lectures -- all                         every talk
//   npm run export:lectures -- tips-complete,ascites       these talks (ids)
//   npm run export:lectures -- "deck:tips-complete+slide:ascites:3"     the audit's request grammar (deck:, slide:, random:12@4471, feature:)
//   --list                  print the talks and their slide counts, and stop
//   --size <id>             the screen the cards are planned for: mac (default), mac-short, ipad, ipad-portrait, iphone, iphone-landscape
//   --no-wire               Markdown only, no wireframes
//   --notes                 also print each slide's speaker notes and question for the room
//   --out <dir>             where the zip goes (default /mnt/project-files/lecture-export/ when it exists, else ./exports/)
//   --name <file>           the zip's file name (default lectures-<commit>-<talks>.zip)
//   --dir                   also write the files unzipped, next to the zip
// Numbers come from the baked per-slide states (public/baked, the same ones the cards read before the worker has them). A talk whose file is missing is baked first (about 15 s a talk, once).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseRequest } from '../src/ui/debug/request/grammar.ts';
import { resolveRequest } from '../src/ui/debug/request/resolve.ts';
import { zipBytes } from '../src/ui/debug/request/bundle.ts';
import { readWorld, readBuild, ROOT } from './audit/world.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const valued = new Set(['--out', '--size', '--name']);
const words = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
const ms = () => performance.now();

(globalThis).location = { search: '', pathname: '/', hostname: 'localhost' };
const world = await readWorld();
if (flag('--list')) { for (const d of world.decks) console.log(`${d.id.padEnd(20)} ${d.slides} slides`); process.exit(0); }

// which talks, and which slides of them
const asked = words.join(' ').trim();
if (!asked) { log('export-lectures: say which talks: all, a list of ids (tips-complete,ascites), or a request (deck:tips-complete, slide:ascites:3, random:12@4471). --list shows the talks.'); process.exit(2); }
let line = asked;
if (asked === 'all') line = 'app';
else if (/^[a-z0-9][a-z0-9,-]*$/.test(asked) && !asked.includes(':')) line = asked.split(',').filter(Boolean).map((id) => `deck:${id}`).join('+');
const parsed = parseRequest(line);
if (!parsed.ok) { log(`export-lectures: ${parsed.error}`); process.exit(2); }
const resolved = resolveRequest(parsed.request, world);
if (!resolved.ok) { log(`export-lectures: ${resolved.error}`); process.exit(2); }
const scope = resolved.scope;
const pick = new Map();   // deck id -> the slides asked for (1-based), or null for the whole talk
for (const id of scope.decks) {
  const n = world.decks.find((d) => d.id === id).slides;
  const ns = scope.slides.filter((k) => k.startsWith(`${id}:`)).map((k) => Number(k.split(':')[1]));
  pick.set(id, ns.length === n ? null : ns);
}
if (!pick.size) { log('export-lectures: that request names no talk'); process.exit(2); }

const { DEVICES } = await import('../src/ui/debug/devices.ts');
const size = DEVICES.find((d) => d.id === opt('--size', 'mac'));
if (!size) { log(`export-lectures: no size "${opt('--size', 'mac')}" (${DEVICES.map((d) => d.id).join(', ')})`); process.exit(2); }

// the numbers: bake what is missing (once), then read them from disk as the cards do
const { chartsFile } = await import('../src/ui/charts/baked/store.ts');
const missing = [...pick.keys()].filter((id) => !existsSync(join(ROOT, 'public', chartsFile(id))));
if (missing.length) {
  log(`baking the numbers of ${missing.length} talk(s) once: ${missing.join(', ')} ...`);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/bake-charts.mjs'), '--only', missing.join(',')], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) log('(the bake failed: readings will print as "…" for those talks)');
}

const { loadSource } = await import('../src/decks/source.ts');
const { toDeck } = await import('../src/decks/hp/deck.ts');
const { trustBaked, bakedById } = await import('../src/ui/charts/baked/store.ts');
const { mergeStates } = await import('../src/ui/charts/baked/view.ts');
const { lectureOf } = await import('../src/ui/debug/export/lecture.ts');
const { viewportOf } = await import('../src/ui/debug/export/frame.ts');

const vp = viewportOf(size.w, size.h);
const build = readBuild();
const files = [], rows = [];
const t0 = ms();
for (const [id, only] of pick) {
  const copied = await loadSource(id);
  const deck = toDeck(copied);
  trustBaked(copied);
  const out = lectureOf({ deck, copied, states: mergeStates(id, undefined), baked: bakedById(id), vp, screen: size.name, wire: !flag('--no-wire'), notes: flag('--notes'), only: only ?? undefined }, ms);
  files.push({ name: `lectures/${out.file}`, text: out.markdown }, ...out.wires.map((w) => ({ name: `lectures/${w.name}`, text: w.svg })));
  rows.push({ id, title: deck.title, level: deck.level, minutes: deck.minutes, slides: out.slides, whole: !only, missing: out.missing, seconds: out.seconds });
  log(`${id}: ${out.slides.length} slide(s), ${out.wires.length} wireframe(s), ${(out.seconds * 1000).toFixed(0)} ms`);
}
const total = (ms() - t0) / 1000;

// the index: every talk, its slides in order
const idx = [`# Lecture export`, '', `Built from commit \`${build.commit.slice(0, 8)}\` (${build.branch}), engine \`${String(build.engine).slice(0, 8)}\`. Request: \`${scope.line}\`. Screen planned: ${size.name}. ${rows.length} talk(s), ${rows.reduce((a, r) => a + r.slides.length, 0)} slide(s).`, '',
  'Each talk is one Markdown file in `lectures/`; each slide lists its two cards in full (readings as the cards print them), the figure\'s camera in numbers and words, the lens, marks and vessels in view, and a flat wireframe in `lectures/wire/`.', '',
  'What the wireframe is: the placed organs and vessels drawn flat through the slide\'s own camera, with the cards placed by the layout planner at their estimated heights. It shows framing, zoom and where things stand. It shows no shading, no real text wrapping and no look, and a card\'s true height is only known in the page.', '',
  '| Talk | Level | Slides | File |', '| --- | --- | ---: | --- |', ...rows.map((r) => `| ${r.title} | ${r.level} | ${r.slides.length}${r.whole ? '' : ' (picked)'} | [${r.id}.md](lectures/${r.id}.md) |`), '',
  ...rows.flatMap((r) => [`## ${r.title}`, '', ...r.slides.map((s) => `${s.n}. ${s.title}`), '']),
  ...(rows.some((r) => r.missing) ? [`> Numbers missing for: ${rows.filter((r) => r.missing).map((r) => `${r.id} (${r.missing} slides)`).join(', ')}.`, ''] : [])].join('\n');
files.unshift({ name: 'INDEX.md', text: `${idx}\n` });

const outDir = opt('--out', existsSync('/mnt/project-files') ? '/mnt/project-files/lecture-export' : join(ROOT, 'exports'));
mkdirSync(outDir, { recursive: true });
const zipName = opt('--name', `lectures-${build.commit.slice(0, 8)}-${rows.length === 1 ? rows[0].id : `${rows.length}-talks`}.zip`);
writeFileSync(join(outDir, zipName), zipBytes(files, new Date()));
if (flag('--dir')) for (const f of files) { const p = join(outDir, zipName.replace(/\.zip$/, ''), f.name); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, f.text); }
console.log(`${rows.length} talk(s), ${rows.reduce((a, r) => a + r.slides.length, 0)} slide(s) in ${total.toFixed(2)} s: ${join(outDir, zipName)}`);
process.exit(0);
