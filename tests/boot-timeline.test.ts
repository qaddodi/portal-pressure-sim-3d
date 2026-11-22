// Loading plan L2: the late-compile sentinel, the boot timeline, the long-task counter, and their lines in ?perf's Copy and the audit's report.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = { documentElement: { dataset: {} as Record<string, string> } };
(globalThis as { document?: unknown }).document = doc;
const { setRenderer } = await import('../src/debug/gl-ref.ts');
const late = await import('../src/boot/late-programs.ts');
const tl = await import('../src/boot/timeline.ts');
const lt = await import('../src/boot/longtasks.ts');
const { bootLines } = await import('../src/boot/boot-lines.ts');
const { release, holdSplash } = await import('../src/boot/ready.ts');
const { perfReport } = await import('../src/ui/perf/report.ts');
const { renderText } = await import('../src/ui/debug/audit/report.ts');

const programs: { name: string }[] = [{ name: 'vessel' }, { name: 'organ' }];
const fakeGl = { getContext: () => ({ getExtension: () => null }) as never, compileAsync: async () => undefined, properties: { get: () => undefined }, info: { programs } };

test('a program built after release() gets one late row with its name, the view and the draw time; frames with no growth get none', () => {
  late.resetLateWatch();
  setRenderer(fakeGl);
  holdSplash(() => undefined);
  release();   // (the lift arms the watch with the renderer's count: 2)
  assert.equal(late.lateProgramCheck(programs, 'body', 3, 100), null, 'nothing new');
  programs.push({ name: 'MeshToonMaterial' });
  const row = late.lateProgramCheck(programs, 'lobule', 41.26, 200);
  assert.ok(row, 'a new program is a late row');
  assert.deepEqual(row!.names, ['MeshToonMaterial']); assert.equal(row!.view, 'lobule'); assert.equal(row!.ms, 41.3); assert.equal(row!.count, 1);
  assert.equal(late.lateProgramCheck(programs, 'lobule', 3, 300), null, 'and only once');
  assert.equal(late.lateTotal(), 1); assert.equal(late.lateRows().length, 1);
  // (a freed program, or a rebase after a restore, is not a late build)
  programs.length = 1; assert.equal(late.lateProgramCheck(programs, 'body', 3, 400), null);
  late.rebaseLateWatch(); programs.push({ name: 'a' }, { name: 'b' }); assert.equal(late.lateProgramCheck(programs, 'body', 3, 500), null);
  assert.equal(late.lateTotal(), 1);
  setRenderer(null);
});

test('before the lift nothing is counted (the splash is the one place allowed to be slow)', () => {
  late.resetLateWatch();
  const p = [{ name: 'a' }];
  assert.equal(late.lateProgramCheck(p, 'body', 1, 1), null); p.push({ name: 'b' });
  assert.equal(late.lateProgramCheck(p, 'body', 1, 2), null);
  assert.equal(late.lateTotal(), 0);
});

test('the timeline lists every stage in order and marks the ones that did not happen with –', () => {
  tl.resetTimeline();
  const labels = tl.STAGES.map(([, l]) => l);
  assert.deepEqual(labels, ['first byte', 'engine ready', 'scene built', 'compile done', 'first draw', 'labels in', 'lift', 'micro primed', 'instruments warm', 'fill done']);
  const empty = tl.timelineLine({});
  let at = -1; for (const l of labels) { const i = empty.indexOf(l); assert.ok(i > at, `${l} comes after the one before`); at = i; }
  assert.equal((empty.match(/ –/g) ?? []).length, 10);
  tl.stamp('engine'); tl.stamp('lift');
  const part = tl.timelineLine(tl.stamps(), 120);
  assert.match(part, /first byte 120 → engine ready \d+ → scene built – → compile done –/);
  assert.match(part, /lift \d+ → micro primed – → instruments warm – → fill done –$/);
  const first = tl.stamps().engine; tl.stamp('engine'); assert.equal(tl.stamps().engine, first, 'only the first stamp counts');
});

test('the long-task counter names what ran: a background slice, a frame phase, or other; and says so where the browser has no observer', () => {
  lt.resetLongTasks();
  assert.equal(lt.startLongTasks(undefined), false);
  assert.equal(lt.longTaskDigest().measured, false);
  lt.resetLongTasks();
  let cb: ((l: { getEntries(): { startTime: number; duration: number }[] }) => void) | null = null;
  class FakePO { static supportedEntryTypes = ['longtask']; constructor(c: typeof cb) { cb = c; } observe() { /* */ } disconnect() { /* */ } }
  assert.equal(lt.startLongTasks(FakePO as never), true);
  cb!({ getEntries: () => [{ startTime: 1000, duration: 80 }] });
  assert.equal(lt.whatRan(1, 2, () => 'micro', () => null), 'slot:micro');
  assert.equal(lt.whatRan(1, 2, () => null, () => ({ phase: 'render' })), 'frame:render');
  assert.equal(lt.whatRan(1, 2, () => null, () => null), 'other');
  const d = lt.longTaskDigest(); assert.equal(d.total, 1); assert.equal(d.rows[0]!.ms, 80);
  lt.resetLongTasks();
});

const digest = () => ({ stamps: { engine: 480, lift: 2100 }, firstByte: 120, late: { total: 1, rows: [{ frame: 2, at: 5, ms: 41.3, view: 'lobule', names: ['MeshToonMaterial'], count: 1 }] }, longTasks: { measured: true, total: 1, rows: [{ at: 3000, ms: 80, what: 'slot:micro' }] }, slots: [{ tag: 'micro', slices: 9, steps: 30, totalMs: 880, worstStepMs: 750, done: true }], parallelCompile: false });

test('?perf Copy carries the timeline, the late programs, the long tasks and the slots', () => {
  const text = perfReport({ framesDrawn: 1, windowFrames: 1, p50: 1, p95: 1, max: 1, slow: [], awake: false, holds: [] }, { ua: 'ua', dpr: 2, size: '1x1', look: 'light', hash: 'h', boot: digest() });
  assert.match(text, /boot timeline \(ms since the page began\): first byte 120 → engine ready 480/);
  assert.match(text, /late programs .*: 1\n  frame \+2 after the lift · lobule · 1 new: MeshToonMaterial · the draw took 41\.3 ms/);
  assert.match(text, /long tasks \(over 50 ms\) after the lift: 1\n  80 ms at 3000 ms · during slot:micro/);
  assert.match(text, /slot:micro · 9 slices, 30 steps, 880\.0 ms in all, worst step 750\.0 ms/);
  assert.match(text, /NOT parallel on this device/);
  assert.match(bootLines({ ...digest(), longTasks: { measured: false, total: 0, rows: [] } }).join('\n'), /not measured \(this browser has no long-task observer\)/);
});

test('the audit report lists the same lines under LATE WORK, next to the LAGS', () => {
  const part = { size: { id: 'iphone', w: 390, h: 844, dpr: 3 }, ms: 1, depth: 'quick' as const, stopped: false, rows: [], console: [], notes: [], boot: digest() };
  const text = renderText({ build: 'b', device: 'd', at: 'now', depth: 'quick', framed: true, parts: [part], failed: [] });
  const lags = text.indexOf('LAGS'), late2 = text.indexOf('LATE WORK iphone');
  assert.ok(late2 > lags, 'after the LAGS list');
  assert.match(text, /LATE WORK iphone[\s\S]*late programs[\s\S]*MeshToonMaterial/);
});

test('the wiring: the lift stamps and arms the watch, Stage checks every drawn frame, the worker answers the fill', () => {
  const ready = readFileSync('src/boot/ready.ts', 'utf8'), stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(ready, /stamp\('lift'\); armLateWatch\(\); startLongTasks\(\)/);
  assert.match(stage, /lateProgramCheck\(gl\.info\.programs, cel\.view,/);
  assert.match(readFileSync('scripts/pwa.mjs', 'utf8'), /postMessage\('filled'\)/);
  assert.match(readFileSync('src/pwa/register.ts', 'utf8'), /stamp\('fill'\)/);
});
