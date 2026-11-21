// The timeline's rules, as the 2D app's createTimeline has them (src/ui/timeline.js): a change is debounced into one entry, an action or a jump is its own, an event is an
// entry, going back keeps later entries ahead until something new happens, Undo and Redo walk the restorable ones, a reset drops every timer of the history before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, DEBOUNCE_MS, fmtClock, captureFrame, type Snap, type TimelineHost } from '../src/ui/timeline/model.ts';
import { removedLabel } from '../src/ui/timeline/removed-label.ts';
import type { EngineFrame } from '../src/engine/hales/host/protocol.d.ts';

function rig() {
  let now = 0, id = 0;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  const said: string[] = [], heard: string[] = [], restored: Snap[] = [], advanced: (number | 'event')[] = [];
  let params: Record<string, number> = { a: 0 };
  let frame = { t: 5, day: 0, P: new Float32Array(2), Pf: new Float32Array(2), Q: new Float32Array(1), Qf: new Float32Array(1), D: new Float32Array(1), ext: new Float32Array(1), metrics: { hvpg: 1 }, events: [] } as unknown as EngineFrame;
  const labelsByA = new Map<number, Map<string, string>>();
  let snapFails = false;
  const host: TimelineHost = {
    snapshot: async () => (snapFails ? null : { t: frame.t, day: frame.day, params: structuredClone(params) }),
    restore: (s) => { restored.push(s); params = structuredClone(s.params as Record<string, number>); },
    frame: () => frame, params: () => params,
    advance: (d) => { advanced.push(d); },
    scenarioLabel: () => 'Healthy',
    labelsOf: (p) => labelsByA.get((p as { a: number }).a) ?? new Map(),
    say: (t) => said.push(t), announce: (t) => heard.push(t),
    now: () => now,
    later: (fn, ms) => { const t = { id: ++id, at: now + ms, fn }; timers.push(t); return t.id; },
    cancel: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  };
  const tl = new Timeline(host);
  const tick = async (ms: number) => { now += ms; for (const t of timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)) { timers.splice(timers.indexOf(t), 1); t.fn(); } await new Promise((r) => setTimeout(r, 0)); };
  return { tl, tick, said, heard, restored, advanced, timers, set: (p: Record<string, number>, f?: Partial<{ t: number; day: number }>, l?: Map<string, string>) => { params = p; if (f) frame = { ...frame, ...f } as EngineFrame; if (l) labelsByA.set(p.a!, l); }, failSnap: (v: boolean) => { snapFails = v; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('reset starts the history with the patient and a snapshot of it', async () => {
  const r = rig();
  r.tl.reset();
  await settle();
  const [e] = r.tl.entries();
  assert.equal(e!.kind, 'start'); assert.equal(e!.label, 'Healthy'); assert.ok(e!.snap); assert.equal(r.tl.count(), 0);
});

test('a slider drag is one entry named for what changed, and it snapshots', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.set({ a: 1 }, undefined, new Map([['tips', 'TIPS 8 mm']]));
  for (let i = 0; i < 5; i++) { r.tl.noteChange('x'); await r.tick(100); }
  assert.equal(r.tl.count(), 0, 'still being typed in');
  await r.tick(DEBOUNCE_MS);
  assert.equal(r.tl.count(), 1);
  assert.equal(r.tl.entries()[1]!.label, 'TIPS 8 mm');
  assert.ok(r.tl.entries()[1]!.snap);
});

test('a change that put something away is said as what is off', async () => {
  const r = rig();
  r.set({ a: 1 }, undefined, new Map([['tips', 'TIPS 8 mm']]));
  r.tl.reset(); await settle();
  r.set({ a: 2 }, undefined, new Map());
  r.tl.noteChange('Change'); await r.tick(DEBOUNCE_MS + 1);
  assert.equal(r.tl.entries()[1]!.label, 'No TIPS');
});

test('Undo flushes a change being typed in, goes back one entry; Redo goes forward; a new change cuts the future', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.set({ a: 1 }, { t: 6 }); r.tl.recordAction('Band (EVL) placed: 1 of 4.'); await r.tick(100);
  r.set({ a: 2 }, { t: 7 }); r.tl.recordAction('1 L crystalloid'); await r.tick(100);
  assert.equal(r.tl.count(), 2); assert.equal(r.tl.canUndo(), true); assert.equal(r.tl.canRedo(), false);
  assert.equal(r.tl.undo(), 'Band (EVL) placed: 1 of 4.');
  assert.deepEqual((r.restored.at(-1)!.params as { a: number }).a, 1);
  assert.equal(r.tl.canRedo(), true);
  assert.equal(r.tl.isFuture(2), true);
  assert.equal(r.tl.redo(), '1 L crystalloid');
  assert.equal(r.tl.cursor(), -1, 'back at the live end');
  r.tl.undo(); r.tl.undo();
  assert.equal(r.tl.undo(), false);
  assert.equal(r.said.at(-1), 'Nothing to undo.');
  r.set({ a: 9 }, { t: 8 }); r.tl.recordAction('Valsalva'); await r.tick(100);
  assert.equal(r.tl.entries().length, 2, 'the entries ahead are gone: start and the new one');
});

test('Redo with nothing ahead says so', () => {
  const r = rig();
  assert.equal(r.tl.redo(), false);
  assert.equal(r.said.at(-1), 'Nothing to redo.');
});

test('an entry the model could not save says so and is skipped by Undo only visibly', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.failSnap(true);
  r.tl.recordAction('Valsalva'); await r.tick(100);
  const e = r.tl.entries()[1]!;
  assert.equal(e.snapFailed, true); assert.equal(e.snap, undefined);
});

test('a jump is its own entry, asks the engine to advance, and snapshots at the new day', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.set({ a: 0 }, { day: 7, t: 0 });
  r.tl.jump(7, '1 week'); await r.tick(200);
  assert.deepEqual(r.advanced, [7]);
  const j = r.tl.entries()[1]!;
  assert.equal(j.label, '+1 week'); assert.equal(j.day, 7);
  r.tl.jump('event', ''); assert.equal(r.tl.entries().at(-1)!.label, 'Ran until the next event');
});

test('events are entries in true time order; the same one again within 30 s is not, unless critical', async () => {
  const r = rig();
  r.set({ a: 0 }, { t: 0 });
  r.tl.reset(); await settle();
  r.tl.addEvents([{ id: 'E1', title: 'Variceal bleed', detail: 'HVPG over 12', severity: 'critical', t: 3, day: 0 }]);
  r.tl.addEvents([{ id: 'E2', title: 'Ascites', severity: 'caution', t: 1, day: 0 }]);
  r.tl.addEvents([{ id: 'E2', title: 'Ascites', severity: 'caution', t: 2, day: 0 }]);
  r.tl.addEvents([{ id: 'E1', title: 'Variceal bleed', severity: 'critical', t: 4, day: 0 }]);
  assert.deepEqual(r.tl.entries().map((e) => e.label), ['Healthy', 'Ascites', 'Variceal bleed', 'Variceal bleed']);
  assert.equal(r.heard[0], 'Variceal bleed. HVPG over 12');
  assert.equal(r.tl.entries().filter((e) => e.kind === 'event').every((e) => !e.snap), true);
});

test('a reset cancels the timers of the history before it', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.tl.noteChange('Old'); r.tl.recordAction('Old action');
  r.tl.reset(); await settle();
  await r.tick(2000);
  assert.deepEqual(r.tl.entries().map((e) => e.kind), ['start']);
});

test('going back to the newest entry is the live end, not a place in the past', async () => {
  const r = rig();
  r.tl.reset(); await settle();
  r.set({ a: 1 }, { t: 6 }); r.tl.recordAction('A'); await r.tick(100);
  r.tl.goTo(1);
  assert.equal(r.tl.cursor(), -1);
  assert.equal(r.said.at(-1), 'Back to: A');
});

test('fmtClock: minutes and seconds on the first day, the day count after', () => {
  assert.equal(fmtClock(14, 0), '0:14'); assert.equal(fmtClock(3725, 0), '1:02:05'); assert.equal(fmtClock(5, 142), 'Day 142');
});

test('captureFrame copies the arrays: the pinned moment stays what it was', () => {
  const f = { P: new Float32Array([1, 2]), Pf: new Float32Array([1, 2]), Q: new Float32Array([3]), Qf: new Float32Array([3]), D: new Float32Array([4]), ext: new Float32Array([0]), metrics: { hvpg: 10 }, events: [{}], params: { x: 1 } } as unknown as EngineFrame;
  const c = captureFrame(f, { x: 1 });
  f.P[0] = 99; f.metrics.hvpg = 1;
  assert.equal(c.P[0], 1); assert.equal(c.frame.P[0], 1); assert.equal(c.metrics.hvpg, 10); assert.deepEqual(c.frame.events, []);
});

test('removedLabel: what was on, said as what is off', () => {
  assert.equal(removedLabel('tips', 'TIPS 8 mm'), 'No TIPS');
  assert.equal(removedLabel('drug:carvedilol', 'Carvedilol'), 'No carvedilol');
  assert.equal(removedLabel('sten:PV', 'Portal vein narrowed 60%'), 'Portal vein no longer narrowed');
  assert.equal(removedLabel('meal', 'Meal'), 'Back to fasting');
  assert.equal(removedLabel('splTone', 'Splanchnic tone ×0.80'), 'Splanchnic tone back to normal');
});
