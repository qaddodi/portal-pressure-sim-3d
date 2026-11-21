// The figure's graphics context lost after its first picture (P0-3): pause, note, rebuild, resume, in that order; a stuck restore offers Reload; ?gl has a Lose context button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORE_WAIT_MS, watchContext, type Timers } from '../src/scene/context-loss.ts';
import { loseContextFor, LOSE_MS } from '../src/debug/gl-lose.ts';
import { glLost, setGlLoss } from '../src/scene/gl-loss.ts';

/** A fake canvas and a fake clock for the timers. */
function rig(early = false) {
  const handlers = new Map<string, (e: { preventDefault(): void }) => void>();
  const el = { addEventListener: (t: string, f: never) => { handlers.set(t, f); }, removeEventListener: (t: string) => { handlers.delete(t); } };
  const calls: string[] = []; let prevented = 0; const pending: { at: number; fn: () => void; id: number }[] = []; let now = 0, ids = 0;
  const timers: Timers = { set: (fn, ms) => { const id = ++ids; pending.push({ at: now + ms, fn, id }); return id; }, clear: (id) => { const i = pending.findIndex((p) => p.id === id); if (i >= 0) pending.splice(i, 1); } };
  const stop = watchContext(el as never, {
    early: () => early, onEarly: () => calls.push('early'),
    lost: () => calls.push('lost'), stuck: () => calls.push('stuck'), rebuild: () => calls.push('rebuild'), restored: () => calls.push('restored'),
  }, timers);
  const fire = (t: string) => handlers.get(t)?.({ preventDefault: () => { prevented++; } });
  const advance = (ms: number) => { now += ms; for (const p of pending.filter((x) => x.at <= now)) { pending.splice(pending.indexOf(p), 1); p.fn(); } };
  return { calls, fire, advance, stop, prevented: () => prevented, handlers, pending };
}

test('lost then restored: pause and note first, then rebuild, then resume; the loss is prevented so the browser may restore', () => {
  const r = rig();
  r.fire('webglcontextlost');
  assert.deepEqual(r.calls, ['lost']); assert.equal(r.prevented(), 1);
  r.advance(1500);
  r.fire('webglcontextrestored');
  assert.deepEqual(r.calls, ['lost', 'rebuild', 'restored']);
  r.advance(RESTORE_WAIT_MS * 2);
  assert.ok(!r.calls.includes('stuck'), 'the wait was cancelled by the restore');
});
test('no restore within 5 s offers Reload; a restore after that still recovers', () => {
  const r = rig();
  r.fire('webglcontextlost');
  r.advance(RESTORE_WAIT_MS - 1); assert.deepEqual(r.calls, ['lost']);
  r.advance(1); assert.deepEqual(r.calls, ['lost', 'stuck']);
  r.fire('webglcontextrestored');
  assert.deepEqual(r.calls, ['lost', 'stuck', 'rebuild', 'restored']);
});
test('a second loss event while lost is one loss; a restore with no loss does nothing', () => {
  const r = rig();
  r.fire('webglcontextrestored'); assert.deepEqual(r.calls, []);
  r.fire('webglcontextlost'); r.fire('webglcontextlost');
  assert.deepEqual(r.calls, ['lost']);
});
test('before the first picture it is a boot failure (the splash says so), not a recovery', () => {
  const r = rig(true);
  r.fire('webglcontextlost');
  assert.deepEqual(r.calls, ['early']); assert.equal(r.pending.length, 0);
});
test('stopping the watch removes both listeners and the wait', () => {
  const r = rig();
  r.fire('webglcontextlost'); r.stop();
  assert.equal(r.handlers.size, 0); assert.equal(r.pending.length, 0);
});

test('the render phase is paused exactly while the context is not ok', () => {
  setGlLoss('ok'); assert.equal(glLost(), false);
  setGlLoss('lost'); assert.equal(glLost(), true);
  setGlLoss('stuck'); assert.equal(glLost(), true);
  setGlLoss('ok'); assert.equal(glLost(), false);
  const b = readFileSync('src/clock/r3f.tsx', 'utf8');
  assert.match(b, /if \(!glLost\(\)\) advance\(/);
});

test('?gl Lose context: loses now, restores after 2 s; no extension says so', () => {
  const log: string[] = []; let later: (() => void) | null = null; let wait = 0;
  const gl = { getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: () => log.push('lose'), restoreContext: () => log.push('restore') } : null) };
  assert.equal(loseContextFor(gl, LOSE_MS, (fn, ms) => { later = fn; wait = ms; }), true);
  assert.deepEqual(log, ['lose']); assert.equal(wait, 2000);
  later!(); assert.deepEqual(log, ['lose', 'restore']);
  assert.equal(loseContextFor({ getExtension: () => null }), false);
  assert.equal(loseContextFor(null), false);
  assert.match(readFileSync('src/debug/gl-check.tsx', 'utf8'), /Lose context/);
});

test('wiring: Stage watches the canvas, and a restore re-warms and re-uploads the vessel data; the note is mounted', () => {
  const s = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(s, /watchContext\(gl\.domElement/);
  assert.match(s, /rebuild: \(\) => \{ vesselData\.texture\.needsUpdate = true; rewarm\.current\(\); \}/);
  assert.match(s, /early: splashHeld/);
  assert.match(readFileSync('src/App.tsx', 'utf8'), /<ContextNote \/>/);
  const n = readFileSync('src/scene/ContextNote.tsx', 'utf8');
  assert.match(n, /Redrawing|GL_LOSS\.redrawing/); assert.match(n, /opacity: on \? 1 : 0/);
});
