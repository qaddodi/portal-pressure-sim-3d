#!/usr/bin/env node
// Production build to dist/ (bundled, minified, hashed file names). The build id (short commit) is stamped into the bundle for ?perf
// and written to dist/build-info.txt so "which build am I looking at" has one answer.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { organsDigest } from './organs-digest.mjs';
import { testsNote } from './tests-status.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
// (VITE_BUILD, when the caller sets it, is the build id as "branch@commit": the Pages workflow builds two checkouts and names each.)
const preset = process.env.VITE_BUILD?.split('@');
const commit = preset?.[1] || sh('rev-parse', '--short=8', 'HEAD') || process.env.GITHUB_SHA?.slice(0, 8) || 'local';
const branch = preset?.[0] || sh('rev-parse', '--abbrev-ref', 'HEAD') || process.env.GITHUB_REF_NAME || 'unknown';

// The release: package.json's version, stamped into the bundle as VITE_RELEASE (About and the feedback draft show it; docs/release.md says how it is bumped).
const release = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;

// The four bakes (the weld plan, the Anatomy's junction skins, the finished organs, every deck's chart data) run AT ONCE, and each one skips itself when what it is made from is unchanged (Plan 50: a signature of its
// import graph beside its file, scripts/bake-sig.mjs; the charts' own key): the deploy restores last run's files from the Actions cache, so a typical push bakes nothing. A failure only warns on a branch preview,
// and the page then does that work live as before; on main (the shipped site) nothing is allowed to fail quietly.
const onMain = branch === 'main';
const failed = [];
const bakeNow = (script) => new Promise((done) => { const c = spawn(process.execPath, [fileURLToPath(new URL(`./${script}`, import.meta.url))], { cwd: root, stdio: 'inherit' }); c.once('error', () => done(1)); c.once('close', (code) => done(code ?? 1)); });
// (the typecheck and the lint, about 8 s together, run beside the bakes: they read the source, the bakes write files)
const capture = (args) => new Promise((done) => { let out = '', err = ''; const c = spawn(process.execPath, args, { cwd: root }); c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.once('error', () => done({ status: 1, stdout: out, stderr: err })); c.once('close', (code) => done({ status: code ?? 1, stdout: out, stderr: err })); });
const [weldCode, skinCode, organCode, chartCode, tsc, lint] = await Promise.all([...['bake-welds.mjs', 'bake-skins.mjs', 'bake-organs.mjs', 'bake-charts.mjs'].map(bakeNow),
  capture([fileURLToPath(new URL('../node_modules/typescript/lib/tsc.js', import.meta.url)), '--noEmit']), capture([fileURLToPath(new URL('./lint.mjs', import.meta.url))])]);
// (the Lobule's weld plan: a phone plans nothing, it fetches the file)
if (weldCode !== 0) { console.warn('warning: the Lobule weld plan was not baked; the page will plan it in a worker'); failed.push('weld bake'); }
// (the Anatomy's junction skins: planning and meshing the 14 of them is seconds of CPU, a stall before the first picture)
if (skinCode !== 0) { console.warn('warning: the Anatomy skins were not baked; the page will build them at load'); failed.push('skin bake'); }
// (the organs are finished here too, src/scene/organs/prepare.ts: the digest of their inputs goes into the page, VITE_ORGANS_DIGEST, which lays the file in only when it is equal; no digest, and the page makes the organs live)
if (organCode !== 0) { console.warn('warning: the organs were not baked; the page will make them at load'); failed.push('organ bake'); }
// (every deck's chart data, Plan 33: the page fetches a talk's file when it opens and draws its first frame from it)
if (chartCode !== 0) { console.warn('warning: the charts were not baked; the page will work their data out live'); failed.push('chart bake'); }
const organsId = organCode === 0 ? organsDigest() : '';

// The two fast checks (about 5 s, in this one deploy job: no new workflow): the typecheck and the project's lint. A preview still ships (fast previews), but the result is stamped on the
// pill (VITE_CHECKS, src/ui/shell/build-pill.ts buildChecks) and in build-info.txt so a broken branch cannot go unseen; on main any failure fails the build.
const typeErrors = tsc.status === 0 ? 0 : ((tsc.stdout ?? '').match(/error TS\d+/g) ?? []).length || 1;
if (typeErrors) console.warn(`warning: ${typeErrors} type error(s)\n${(tsc.stdout ?? '').split('\n').slice(0, 20).join('\n')}`);
if (lint.status !== 0) console.warn(`warning: lint failed\n${lint.stderr ?? ''}`);
const checks = [typeErrors ? `types: ${typeErrors} error${typeErrors === 1 ? '' : 's'}` : '', lint.status !== 0 ? 'lint failed' : '', ...failed.map((f) => `${f} failed`)].filter(Boolean).join(', ');
// The last full test run (scripts/tests-daily.mjs wrote tests-status.json; W6): "tests: N failing" rides on the pill and in build-info.txt, but never fails a build by itself (a stale or missing file says nothing).
let testsLine = '';
try { testsLine = testsNote(JSON.parse(readFileSync(`${root}tests-status.json`, 'utf8'))); } catch { /* (no run recorded yet) */ }
if (onMain && checks) { console.error(`main does not ship with a failed check: ${checks}`); process.exit(1); }

const r = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BUILD: `${branch}@${commit}`, VITE_RELEASE: release, VITE_CHECKS: [checks, testsLine].filter(Boolean).join(', '), VITE_ORGANS_DIGEST: organsId } });
if (r.status !== 0) process.exit(r.status ?? 1);
// The rules that style something this app never makes are taken out of the BUILT file (scripts/css-unused.mjs; src/ui/styles was pruned the same way when it was retired from the 2D copy, so this finds only what has gone dead since). PPS_NO_CSS_PRUNE=1 skips it.
if (!process.env.PPS_NO_CSS_PRUNE) { const cp = spawnSync(process.execPath, [fileURLToPath(new URL('./css-unused.mjs', import.meta.url)), '--write'], { cwd: root, stdio: 'inherit' }); if (cp.status !== 0) { console.warn('warning: the stylesheet was not pruned; it ships whole'); failed.push('css prune'); if (onMain) { console.error('main does not ship with an unpruned stylesheet'); process.exit(1); } } }
// The figure's data files get content-hashed names under assets/ (scripts/hash-data.mjs): a deploy that does not touch the figure downloads none of them again, and the worker needs no special case for them. A failure stops the build: the page would fetch a name that does not exist.
const hd = spawnSync(process.execPath, [fileURLToPath(new URL('./hash-data.mjs', import.meta.url)), `${root}dist`], { cwd: root, stdio: 'inherit' });
if (hd.status !== 0) process.exit(hd.status ?? 1);
// Every name a page, style sheet or script gives must be a file the build wrote (scripts/dist-refs.mjs): a dangling name is a 404 for every visitor, so it stops the build on a branch as well as on main.
const dr = spawnSync(process.execPath, [fileURLToPath(new URL('./dist-refs.mjs', import.meta.url)), `${root}dist`], { cwd: root, stdio: 'inherit' });
if (dr.status !== 0) process.exit(dr.status ?? 1);
writeFileSync(`${root}dist/build-info.txt`, `version ${release}\nbranch ${branch}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\nchecks ${[checks, ...(failed.includes('css prune') ? ['css prune failed'] : [])].filter(Boolean).join(', ') || 'ok'}\n${testsLine ? `${testsLine}\n` : ''}`);
const pw = spawnSync(process.execPath, [fileURLToPath(new URL('./pwa.mjs', import.meta.url)), `${root}dist`, `${commit}`], { cwd: root, stdio: 'inherit' });
if (pw.status !== 0) process.exit(pw.status ?? 1);
// What a first visit downloads before the app is usable (scripts/boot-bytes.mjs, the budget in scripts/boot-budget.json): printed, written to build-info.txt, and a build over the budget fails on main and says so on a branch.
const bb = spawnSync(process.execPath, [fileURLToPath(new URL('./boot-bytes.mjs', import.meta.url)), `${root}dist`, '--check'], { cwd: root, encoding: 'utf8' });
process.stdout.write(bb.stdout ?? ''); process.stderr.write(bb.stderr ?? '');
writeFileSync(`${root}dist/build-info.txt`, `${readFileSync(`${root}dist/build-info.txt`, 'utf8')}boot ${((bb.stdout ?? '').match(/before usable: \d+ files, ([\d,]+) kB/) ?? [])[1] ?? '?'} kB before usable${bb.status === 1 ? ', OVER BUDGET' : ''}\n`);
if (onMain && bb.status === 1) { console.error('main does not ship over its boot-byte budget'); process.exit(1); }
console.log(`built v${release} ${branch}@${commit} → dist/`);
