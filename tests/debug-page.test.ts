// The debug page's pure halves: the catalog from the app's own tables, the Sweep and the Full check driven by a fake app. Each ends in ONE Run report the 2D tools can read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, resolveSpec, defaultSweep, type CatalogSource } from '../src/ui/debug/page/catalog.ts';
import { runSweep, type SweepDeps } from '../src/ui/debug/page/sweep.ts';
import { runCheck, type Journey, type CheckDeps } from '../src/ui/debug/page/check.ts';
import { renderRun, parseReport, validateRun } from '../src/ui/debug/core/api.ts';

const src: CatalogSource = {
  views: [{ id: 'anatomic', label: 'Anatomy' }, { id: 'lobule', label: 'Lobule' }],
  sheets: ['settings', 'help'],
  decks: [{ id: 'hvpg', title: 'Measuring HVPG', slides: [{ title: 'Cannulate' }, { title: 'Wedge' }] }, { id: 'tips', title: 'TIPS', slides: [{ title: 'Why' }] }],
  patients: [{ id: 'csph', label: 'CSPH', group: 'Compensated' }, { id: 'cirr-decomp', label: 'Decompensated', group: 'Cirrhosis' }, { id: 'healthy', label: 'Healthy', group: 'Normal' }],
};
const cat = buildCatalog(src);

test('the catalog lists every view, sheet, slide (outline and quick check too) and patient, each once', () => {
  assert.equal(new Set(cat.map((e) => e.id)).size, cat.length);
  assert.deepEqual(cat.filter((e) => e.section === 'slide').map((e) => e.id), ['slide:hvpg:0', 'slide:hvpg:1', 'slide:hvpg:2', 'slide:hvpg:3', 'slide:tips:0', 'slide:tips:1', 'slide:tips:2']);
  assert.equal(cat.find((e) => e.id === 'sheet:help')!.label, 'Help');
});

test('a spec names ids, sections, a deck or all; what it cannot find is said, not skipped', () => {
  assert.equal(resolveSpec(cat, 'slide:hvpg').entries.length, 4);
  assert.equal(resolveSpec(cat, 'view,sheet:help').entries.length, 3);
  assert.equal(resolveSpec(cat, 'all').entries.length, cat.length);
  assert.deepEqual(resolveSpec(cat, 'slide:nope,view:anatomic').unknown, ['slide:nope']);
  assert.deepEqual(defaultSweep(cat).filter((e) => e.section === 'slide').map((e) => e.id), ['slide:hvpg:0', 'slide:tips:0']);
});

function fakeSweep(over: Partial<SweepDeps> = {}) {
  const log: string[] = []; let look = 'light', errs = 0;
  const deps: SweepDeps = {
    open: async (e) => { log.push(`${look}:${e.id}`); if (e.id === 'sheet:help') throw new Error('did not open'); },
    setLook: (l) => { look = l; }, settle: async () => ({ settled: true, ms: 10 }),
    problems: () => (look === 'dark' ? [{ kind: 'fit-small', text: 'a small line', where: 'card teach' }] : []),
    errors: () => errs, memoryMB: () => 42, size: '390x844', now: () => 1000, ...over,
  };
  return { deps, log };
}

test('the Sweep opens each specimen in each look and ends in one report that names what failed', async () => {
  const { deps, log } = fakeSweep();
  const entries = resolveSpec(cat, 'view:lobule,sheet:help').entries;
  const run = await runSweep(entries, ['light', 'dark'], deps);
  assert.deepEqual(log, ['light:view:lobule', 'light:sheet:help', 'dark:view:lobule', 'dark:sheet:help']);
  assert.ok(validateRun(run).ok);
  assert.ok(run.findings.some((f) => f.rule === 'sweep-open' && /did not open/.test(f.what)));
  assert.ok(run.findings.some((f) => f.rule === 'fit-small'));
  assert.equal(run.tool, 'sweep');
  const back = parseReport(renderRun(run));
  assert.ok(back.ok, String(back.why));
});

test('the Sweep stops when asked and says it stopped early; an unsettled page and counted errors are findings', async () => {
  let n = 0, e = 0;
  const { deps } = fakeSweep({ settle: async () => ({ settled: false, ms: 9000 }), errors: () => e, open: async () => { e++; } });
  const run = await runSweep(cat.slice(0, 5), ['light'], deps, { shouldStop: () => n++ >= 2, unknown: ['slide:nope'] });
  assert.ok(run.findings.some((f) => f.rule === 'sweep-unsettled'));
  assert.ok(run.findings.some((f) => f.rule === 'sweep-errors'));
  assert.ok(run.notes.some((t) => /stopped early: 2 of 5/.test(t)));
  assert.ok(run.missing.some((t) => /slide:nope/.test(t)));
});

const journeys = (log: string[]): Journey[] => [
  { id: 'views', label: 'Views', steps: () => ['anatomic', 'lobule', 'sinusoid'].map((v) => ({ journey: 'views', label: `to ${v}`, run: () => { log.push(v); } })) },
  { id: 'long', label: 'Long walk', full: true, steps: () => [{ journey: 'long', label: 'many slides', run: () => { log.push('long'); } }] },
];
function fakeCheck(mem: number[], over: Partial<CheckDeps> = {}): CheckDeps {
  let i = 0, lastProblems = 0;
  return { settle: async () => ({ settled: true, ms: 5 }), problems: () => (lastProblems++ === 0 ? [] : [{ kind: 'edge-cutoff', text: 'a line runs past the card' }]), errors: () => 0, memoryMB: () => mem[Math.min(i++, mem.length - 1)]!, info: { device: '390x844', look: 'light' }, now: () => 5, ...over };
}

test('the Phone check walks the short journeys and groups one problem across steps', async () => {
  const log: string[] = [];
  const { report, rows } = await runCheck(journeys(log), fakeCheck([40, 41, 42]));
  assert.deepEqual(log, ['anatomic', 'lobule', 'sinusoid']);
  assert.equal(rows.length, 3);
  const f = report.findings.filter((x) => x.rule === 'edge-cutoff');
  assert.equal(f.length, 1);
  assert.match(f[0]!.where ?? '', /2 stops/);
});

test('the Full check adds the long walk, reads memory after each step, and names a climb', async () => {
  const log: string[] = [];
  const { report } = await runCheck(journeys(log), fakeCheck([40, 60, 90, 140]), { full: true });
  assert.deepEqual(log, ['anatomic', 'lobule', 'sinusoid', 'long']);
  assert.ok(report.findings.some((f) => f.rule === 'walk-memory-climb' || /climbed 100 MB/.test(f.what)), JSON.stringify(report.findings.map((f) => f.rule)));
  const ok = await runCheck(journeys([]), fakeCheck([40, 42, 41, 43]), { full: true });
  assert.ok(!ok.report.findings.some((f) => /climbed/.test(f.what)));
});

test('a step that throws is a failed step, and the walk goes on', async () => {
  const j: Journey[] = [{ id: 'x', label: 'X', steps: () => [{ journey: 'x', label: 'bad', run: () => { throw new Error('no such view'); } }, { journey: 'x', label: 'good', run: () => undefined }] }];
  const { rows, report } = await runCheck(j, fakeCheck([1]));
  assert.equal(rows.length, 2);
  assert.ok(report.findings.some((f) => /no such view/.test(f.what)));
});
