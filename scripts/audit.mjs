#!/usr/bin/env node
// `npm run audit -- "<request>"`: the node runner of the one audit system (docs/audit.md). It reads the request line (src/ui/debug/request/grammar.ts), runs what node can judge with no browser and no
// approval (the repo's own node tests for the request's features, the node scene audit, the typecheck, the lint), and writes ONE zip in the format every runner writes (src/ui/debug/request/bundle.ts):
// README-FIRST.md, REPORT.md, sections/, findings.json, manifest.json. It reuses the tools that exist and rewrites none of them.
//
//   npm run audit -- "feature:junctions"                      a feature (the table is src/ui/debug/request/features.ts)
//   npm run audit -- "deck:tips-complete checks=numbers"      one talk, one check
//   npm run audit -- "random:12@4471/deck"                    12 slides from as many talks as possible; the seed is printed and gives the same slides again
//   npm run audit -- "app checks=types,lint"                  the whole app, two checks
//   --print                 show what the request means and which test files it would run; run nothing
//   --out <dir>             where the zip goes (default /mnt/project-files/audits/ when it exists, else ./audits/)
//   --dir                   also write the files unzipped, next to the zip
//   --json                  print the run's summary as JSON on stdout
//   --jobs <n>              test files at once (default 4)
// Exit code 0 when the audit ran (findings are the output, not a failure); 2 for a request that cannot be read; 1 when the run itself broke.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { parseRequest } from '../src/ui/debug/request/grammar.ts';
import { resolveRequest } from '../src/ui/debug/request/resolve.ts';
import { withIds } from '../src/ui/debug/request/finding.ts';
import { nodeTestPlan } from '../src/ui/debug/request/plan.ts';
import { bundleFiles, zipBytes } from '../src/ui/debug/request/bundle.ts';
import { readWorld, readBuild, ROOT } from './audit/world.mjs';
import { allTestFiles, runTestFiles } from './audit/tests.mjs';
import { typecheck, lint } from './audit/code.mjs';
import { sceneAudit } from './audit/scene.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const valued = new Set(['--out', '--jobs']);
const words = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);

const parsed = parseRequest(words.join(' '));
if (!parsed.ok) { log(`audit: ${parsed.error}`); process.exit(2); }
if (parsed.request.runner !== 'node') { log(`audit: this is the node runner; runner=${parsed.request.runner} is the page's (open ?audit on the address for it, src/ui/debug/request/grammar.ts)`); process.exit(2); }
const world = await readWorld();
const resolved = resolveRequest(parsed.request, world);
if (!resolved.ok) { log(`audit: ${resolved.error}`); process.exit(2); }
const scope = resolved.scope;

const { HP_IDS } = await import('../src/decks/hp/index.ts');
const { RW_IDS } = await import('../src/decks/rw/copied/index.ts');
const plan = nodeTestPlan(scope, allTestFiles(), { hp: HP_IDS, rw: RW_IDS });
const wantTests = plan.files.length > 0;

if (flag('--print')) {
  console.log(`request   ${scope.line}`);
  console.log(`checks    ${scope.checks.join(', ')}${scope.skipped.length ? `   (not done by node: ${scope.skipped.map((s) => s.check).join(', ')})` : ''}`);
  if (scope.random) console.log(`random    ${scope.random.n} @ seed ${scope.random.seed}${scope.random.spread ? ' spread' : ''}: ${scope.random.picked.join(' ')}`);
  console.log(`scope     ${scope.all ? 'whole app' : `${scope.features.length} features, ${scope.decks.length} talks, ${scope.slides.length} slides`}; sizes ${scope.sizes.join(',')}`);
  console.log(`tests     ${plan.files.length} files${Object.keys(plan.env).length ? `, with ${Object.keys(plan.env).join(' ')}` : ''}${plan.noTests.filter((c) => !['types', 'lint', 'motion', 'perf'].includes(c)).length ? `; no test file for: ${plan.noTests.filter((c) => !['types', 'lint', 'motion', 'perf'].includes(c)).join(', ')}` : ''}`);
  for (const f of plan.files) console.log(`  ${f.file}  (${f.feature}, ${f.check})`);
  process.exit(0);
}

const t0 = Date.now(), startedAt = new Date().toISOString();
const build = readBuild();
const inputs = [], checkRuns = [], items = [], validity = [], notJudged = [];
const has = (c) => scope.checks.includes(c);
const addItem = (section, id, label, checks, findings = []) => items.push({ section, id, label, checks, findings });
// (a finding is added with its section and owner; ids are made at the end, from rule, target and state)
const add = (f) => inputs.push(f);

// 1. the typecheck and the lint
if (has('types')) {
  log('typecheck ...');
  const r = typecheck();
  for (const e of r.errors) add({ rule: `tsc:${e.code}`, check: 'types', severity: 'high', target: e.file, state: e.message, owner: e.file, where: `${e.file}:${e.line}`, message: `${e.code}: ${e.message}`, repro: 'npm run typecheck', section: 'code' });
  if (r.crashed) add({ rule: 'tsc:crashed', check: 'types', severity: 'high', target: 'typecheck', state: '', owner: '', where: '', message: `the typecheck did not run: ${r.crashed}`, repro: 'npm run typecheck', section: 'code' });
  checkRuns.push({ id: 'types', ran: true, seconds: r.seconds, summary: r.errors.length ? `${r.errors.length} type errors` : r.crashed ? 'did not run' : '0 errors' });
  log(`  ${r.errors.length} errors, ${r.seconds.toFixed(0)} s`);
  addItem('code', 'typecheck', 'Typecheck (tsc --noEmit)', { types: r.errors.length || r.crashed ? 'fail' : 'pass' });
}
if (has('lint')) {
  log('lint ...');
  const r = lint();
  for (const p of r.problems) {
    const rule = /^([\w-]+):/.exec(p.head)?.[1] ?? 'problem', long = /^long-line: (\S+) has/.exec(p.head);
    add({ rule: `lint:${rule}`, check: 'lint', severity: 'medium', target: long ? long[1] : rule, state: p.head, owner: long ? long[1] : 'scripts/lint-rules.mjs', where: p.places[0] ?? '', message: [p.head, ...p.places.slice(0, 8)].join('\n'), repro: 'npm run lint', section: 'code' });
  }
  checkRuns.push({ id: 'lint', ran: true, seconds: r.seconds, summary: r.problems.length ? `${r.problems.length} problems` : 'ok' });
  log(`  ${r.problems.length} problems, ${r.seconds.toFixed(0)} s`);
  addItem('code', 'lint', 'Lint (scripts/lint.mjs)', { lint: r.problems.length ? 'fail' : 'pass' });
}

// 2. the scene audit (motion: pops and stuck eases; perf: the slowest frame and the rebuild count)
const sceneChecks = ['motion', 'perf'].filter(has);
if (sceneChecks.length) {
  log('scene audit ...');
  const r = sceneAudit();
  if (!r.json) {
    for (const c of sceneChecks) add({ rule: 'scene:crashed', check: c, severity: 'high', target: 'scene-audit', state: '', owner: 'scripts/scene-audit.mjs', where: '', message: `the scene audit did not run: ${r.crashed}`, repro: 'node scripts/scene-audit.mjs', section: 'scene' });
  } else {
    const B = r.json.budget;
    for (const row of r.json.rows) {
      const st = { motion: has('motion') ? 'pass' : undefined, perf: has('perf') ? 'pass' : undefined };
      const here = [];
      const put = (check, f) => { if (!has(check)) return; st[check] = 'fail'; here.push(f); add({ ...f, check, section: 'scene', owner: 'scripts/scene-audit.mjs', repro: 'node scripts/scene-audit.mjs', severity: f.severity ?? 'medium' }); };
      if (row.updateMaxMs > B.updateMs) put('perf', { rule: 'scene:frame-budget', target: `scene:${row.step}`, state: row.worstLaps, where: `step "${row.step}", worst frame at ${row.at} ms`, message: `the slowest update took ${row.updateMaxMs} ms (budget ${B.updateMs}); ${row.over50} frames over; spent in: ${row.worstLaps || 'not named'}. Node CPU: a phone is 2 to 4 times slower.` });
      if (row.rebuilds > B.rebuilds) put('perf', { rule: 'scene:rebuilds', target: `scene:${row.step}`, state: row.lastNode, where: `step "${row.step}"`, message: `${row.rebuilds} skin rebuilds (budget ${B.rebuilds}), the last of ${row.lastNode}` });
      for (const p of row.pops) put('motion', { rule: 'scene:pop', target: `scene:${row.step}:${p.k}`, state: '', where: `step "${row.step}", ${p.at} ms`, message: `${p.k} moved from ${p.from} to ${p.to} in one frame (a pop candidate, budget ${B.pop})` });
      for (const s of row.stuck) put('motion', { rule: 'scene:stuck', target: `scene:${row.step}`, state: s, where: `step "${row.step}"`, message: `an ease did not reach its goal: ${s}` });
      addItem('scene', row.step, `${row.step} (max ${row.updateMaxMs} ms)`, Object.fromEntries(Object.entries(st).filter(([, v]) => v)), []);
    }
    if (r.json.missing.length) for (const c of sceneChecks) add({ rule: 'scene:probe-missing', check: c, severity: 'medium', target: 'scene-audit', state: r.json.missing.join(','), owner: 'scripts/scene-audit.mjs', where: '', message: `the audit cannot read ${r.json.missing.join(', ')} (a renamed private field: it would pass without looking)`, repro: 'node scripts/scene-audit.mjs', section: 'scene' });
    if (!r.json.construct.baked) validity.push('The baked skins were NOT laid in, so the scene remeshed live: update times include meshing.');
  }
  for (const c of sceneChecks) checkRuns.push({ id: c, ran: true, seconds: r.seconds, summary: r.json ? `${r.json.rows.length} scene steps (shared with ${sceneChecks.filter((x) => x !== c).join('') || 'none'})` : 'did not run' });
  log(`  ${r.json ? r.json.rows.length : 0} steps, ${r.seconds.toFixed(0)} s`);
}

// 3. the repo's node tests for the request's features
const testResults = new Map();
if (wantTests) {
  log(`tests: ${plan.files.length} files${Object.keys(plan.env).length ? ` (full replays: ${Object.keys(plan.env).join(', ')})` : ''} ...`);
  Object.assign(process.env, plan.env);
  let done = 0;
  const r = await runTestFiles(plan.files.map((f) => f.file), { concurrency: Number(opt('--jobs', 4)), onFile: () => { done++; if (done % 10 === 0) log(`  ${done}/${plan.files.length} files`); } });
  for (const res of r.results) testResults.set(res.file, res);
  const red = r.results.filter((x) => x.fail).length;
  for (const p of plan.files) {
    const res = testResults.get(p.file);
    for (const fl of res?.failures ?? []) add({ rule: 'test-fails', check: p.check, severity: 'high', target: `tests/${p.file} > ${fl.name}`, state: '', owner: `tests/${p.file}`, where: `tests/${p.file}`, message: fl.message, repro: `${Object.entries(plan.env).map(([k, v]) => `${k}=${v} `).join('')}node --test tests/${p.file}`, section: `feature:${p.feature}` });
    if (res && !res.failures.length && res.fail === 0 && res.pass + res.skip === 0) add({ rule: 'test-empty', check: p.check, severity: 'medium', target: `tests/${p.file}`, state: '', owner: `tests/${p.file}`, where: '', message: 'the file ran no test (it crashed before its first, or has none)', repro: `node --test tests/${p.file}`, section: `feature:${p.feature}` });
  }
  const tc = [...new Set(plan.files.map((p) => p.check))];
  for (const c of tc) {
    const fs = plan.files.filter((p) => p.check === c), rs = fs.map((p) => testResults.get(p.file)).filter(Boolean);
    checkRuns.push({ id: c, ran: true, seconds: r.seconds, summary: `${fs.length} test files (${rs.reduce((a, x) => a + x.pass, 0)} pass, ${rs.reduce((a, x) => a + x.fail, 0)} fail, ${rs.reduce((a, x) => a + x.skip, 0)} skipped)` });
  }
  log(`  ${red} red file${red === 1 ? '' : 's'} of ${plan.files.length}, ${r.seconds.toFixed(0)} s`);
  for (const p of plan.files) {
    const res = testResults.get(p.file);
    addItem(`feature:${p.feature}`, p.file, `tests/${p.file}${res ? ` (${res.pass} pass, ${res.fail} fail${res.skip ? `, ${res.skip} skipped` : ''})` : ''}`, { [p.check]: !res || res.fail || res.pass + res.skip === 0 ? 'fail' : 'pass' });
  }
}

// 4. checks asked for that nothing here ran: said, never passed
for (const c of scope.checks) if (!checkRuns.some((k) => k.id === c)) checkRuns.push({ id: c, ran: false, why: c === 'motion' || c === 'perf' ? 'the scene audit did not run' : scope.features.length && !scope.explicit ? `the request names a feature and none of its tests serves ${c}: add checks=${c} to run its base tests` : 'no node test file or tool judges it for this request', seconds: 0, summary: '' });
for (const s of scope.skipped) checkRuns.push({ id: s.check, ran: false, why: s.why, seconds: 0, summary: '' });

// 5. the talks and cases of the request, listed with what was judged on them
const hpFull = !!plan.env.DECKS_HP_FULL, rwFull = !!plan.env.RW_FULL;
const familyOf = (id) => (HP_IDS.includes(id) ? 'hp' : RW_IDS.includes(id) ? 'rw' : 'ag');
const idsWithFindings = (check) => inputs.filter((f) => f.check === check);
for (const id of has('numbers') ? scope.decks : []) {
  const section = `deck:${id}`, fam = familyOf(id);
  const replayed = has('numbers') && ((fam === 'hp' && hpFull) || (fam === 'rw' && rwFull));
  const named = idsWithFindings('numbers').filter((f) => new RegExp(`(^|[^a-z-])${id}([^a-z-]|$)`).test(`${f.target} ${f.message}`));
  const st = has('numbers') ? (named.length ? 'fail' : replayed ? 'pass' : 'not-run') : undefined;
  const mk = (s) => (st ? { numbers: s ?? st } : {});
  addItem(section, `${id}:*`, '(whole talk)', mk(), []);
  items.at(-1)._named = named;
  for (const k of scope.slides.filter((x) => x.startsWith(`${id}:`))) addItem(section, k, `slide ${k.split(':')[1]}`, mk());
}
for (const c of scope.cases) addItem(`case:${c}`, c, `case ${c}`, Object.fromEntries(scope.checks.map((k) => [k, 'not-run'])));

// ids, then each item's findings by section (a finding belongs to the items of its section that named it)
const findings = withIds(inputs);
const bySectionTarget = (f) => items.filter((i) => i.section === f.section && (f.section.startsWith('feature:') ? f.target.startsWith(`tests/${i.id} >`) || f.target === `tests/${i.id}` : f.section === 'scene' ? f.target === `scene:${i.id}` || f.target.startsWith(`scene:${i.id}:`) : f.section === 'code' ? (f.rule.startsWith('tsc') ? i.id === 'typecheck' : i.id === 'lint') : false));
for (const f of findings) {
  const hit = bySectionTarget(f);
  for (const i of hit) i.findings.push(f.id);
}
for (const i of items) if (i._named) { i.findings.push(...findings.filter((f) => i._named.some((n) => n.rule === f.rule && n.target === f.target && n.message === f.message)).map((f) => f.id)); delete i._named; }

// validity and what was not judged
validity.push(`Node ${process.version} on ${os.platform()} ${os.arch()}, ${os.cpus().length} cores, no GPU and no browser. The scene audit's times are node CPU: a phone is 2 to 4 times slower.`);
if (wantTests) validity.push(`Test files ran ${opt('--jobs', 4)} at a time in separate processes, each file whole: a test is never narrowed by slide, so a finding names a test, not a slide.`);
if (build.dirty) validity.push('The working tree had uncommitted changes to tracked files: this is not exactly the commit named.');
for (const c of scope.checks) if (c === 'numbers' && wantTests && !hpFull && !rwFull) validity.push('The numbers tests ran in their fast mode (a few decks), not the full replay of every slide: the request named no talk of those families. Name a talk, or use `app`, for the full replay.');
if (scope.skipped.length === 0 && !scope.checks.includes('pictures')) notJudged.push('pictures: the node runner takes none; colour, shape, shaders and how the figure looks need runner=gpu on a device.');
notJudged.push('layout: the real page is not opened. Card sizes are measured in a browser; node judged only the layout tests (which place cards from numbers). Use runner=layout (npm run layout-check, one approved run) for the page itself.');
if (scope.sizes.length && (has('layout') || has('a11y'))) notJudged.push(`sizes (${scope.sizes.join(', ')}): the node tests pick their own sizes; the request's sizes steer the layout and gpu runners.`);
if (scope.lenses.length || scope.looks.length) notJudged.push(`lenses and looks (${[...scope.lenses, ...scope.looks].join(', ')}): named in the request; nothing in node draws them.`);
if (scope.cases.length) notJudged.push(`cases (${scope.cases.join(', ')}): listed; no node check judges one case.`);
if (has('numbers')) notJudged.push('numbers: the tests hold every reading to the recorded baseline; they do not say whether a moved reading crosses a clinical cut-off (10 or 12 mmHg). Read any numbers finding against the cut-offs before recording.');

// (a check that two tools judged, the scene audit and the tests, is one row)
const merged = [];
for (const k of checkRuns) {
  const m = merged.find((x) => x.id === k.id);
  if (!m) merged.push({ ...k }); else { m.seconds += k.seconds; m.summary = [m.summary, k.summary].filter(Boolean).join('; '); m.ran = m.ran || k.ran; }
}
checkRuns.length = 0; checkRuns.push(...merged);
const result = { info: { build, runner: 'node', startedAt, seconds: (Date.now() - t0) / 1000, device: `node ${process.version}, ${os.platform()} ${os.arch()}` }, scope, checks: checkRuns, items, findings, validity, notJudged, pictures: [] };
const files = bundleFiles(result);
const outDir = opt('--out', existsSync('/mnt/project-files') ? '/mnt/project-files/audits' : join(ROOT, 'audits'));
const stamp = startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
const name = `audit-${build.commit.slice(0, 8)}-${scope.line.replace(/\s+/g, '_').replace(/[^a-z0-9_@:+,=/.-]/gi, '').replace(/[:/=,+@]/g, '-').slice(0, 60)}-${stamp}`;
if (!flag('--no-write')) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.zip`), zipBytes(files, new Date()));
  if (flag('--dir')) for (const f of files) { mkdirSync(join(outDir, name, f.name, '..'), { recursive: true }); writeFileSync(join(outDir, name, f.name), f.text); }
}
const counts = Object.fromEntries(['high', 'medium', 'low', 'info'].map((s) => [s, findings.filter((f) => f.severity === s).length]));
if (flag('--json')) console.log(JSON.stringify({ zip: flag('--no-write') ? null : join(outDir, `${name}.zip`), request: scope.line, build: build.commit, findings: findings.length, counts, seconds: Math.round(result.info.seconds) }));
else {
  console.log(`audit ${scope.line}: ${findings.length} finding${findings.length === 1 ? '' : 's'} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}) in ${Math.round(result.info.seconds)} s`);
  for (const f of findings.slice(0, 15)) console.log(`  ${f.id}  ${f.severity.padEnd(6)} ${f.check.padEnd(9)} ${f.target}`);
  if (findings.length > 15) console.log(`  ... ${findings.length - 15} more in the zip`);
  if (!flag('--no-write')) console.log(`zip: ${join(outDir, `${name}.zip`)}`);
}
process.exit(0);
