import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFor } from './b3-frames.ts';
import { LensField } from '../src/scene/lenses/field.ts';
import { lensColourAt, computeLens, LENS_IDS, SINCE_BASELINE_FED } from '../src/scene/lenses/model.ts';
import { claims } from '../src/parity/b3.ts';

const h = await frameFor('healthy');
const c = await frameFor('cirr-decomp');
const pf = (f: unknown) => { const x = f as { P: ArrayLike<number>; Pf?: ArrayLike<number> }; return Float32Array.from(x.Pf ?? x.P); };
const ctx = { healthy: h.healthy, ref: Float32Array.from(h.healthy.P) };

test('Since counts its change from the state the figure showed as the lens came in, not from the healthy patient', () => {
  const f = new LensField();
  f.setContext(ctx as never); f.onFrame(c.frame as never); f.setLens('since', 0, true);
  // the lens came in on the cirrhotic state: nothing has changed since, so a vessel wears the mid (grey) colour of the Change ramp
  const same = lensColourAt(f.data, 'PV_TRUNK', 0)!;
  const delta = lensColourAt(computeLens('delta', c.frame as never, 'light', ctx as never), 'PV_TRUNK', 0)!;
  assert.notDeepEqual(same, delta, 'Change counts from healthy; Since from the arrival state');
  assert.deepEqual(same, lensColourAt(computeLens('delta', c.frame as never, 'light', { ...ctx, ref: pf(c.frame) } as never), 'PV_TRUNK', 0));
  // the state then moves: the lens still counts from where it came in
  f.onFrame(h.frame as never); f.step(500);
  assert.notDeepEqual(lensColourAt(f.data, 'PV_TRUNK', 0), same, 'a new state is a change since');
  f.dispose();
});

test('a slide\'s baseline replaces the arrival state, and null takes the arrival state again', () => {
  const f = new LensField();
  f.setContext(ctx as never); f.onFrame(c.frame as never); f.setLens('since', 0, true);
  f.setSinceRef(Float32Array.from(h.healthy.P)); f.step(500);
  assert.deepEqual(lensColourAt(f.data, 'PV_TRUNK', 0), lensColourAt(computeLens('delta', c.frame as never, 'light', ctx as never), 'PV_TRUNK', 0), 'counting from healthy = the Change lens');
  f.setSinceRef(null); f.step(900);
  assert.notDeepEqual(lensColourAt(f.data, 'PV_TRUNK', 0), lensColourAt(computeLens('delta', c.frame as never, 'light', ctx as never), 'PV_TRUNK', 0));
  f.dispose();
});

test('Compare\'s pinned moment outranks the Since baseline, as in 2D REF()', () => {
  const f = new LensField();
  f.setContext(ctx as never); f.onFrame(c.frame as never); f.setLens('since', 0, true);
  f.setRef(Float32Array.from(h.healthy.P)); f.step(500);
  assert.deepEqual(lensColourAt(f.data, 'PV_TRUNK', 0), lensColourAt(computeLens('delta', c.frame as never, 'light', ctx as never), 'PV_TRUNK', 0));
  f.dispose();
});

test('the arrival state belongs to the Since lens only: leaving it forgets it', () => {
  const f = new LensField();
  f.setContext(ctx as never); f.onFrame(c.frame as never); f.setLens('since', 0, true);
  f.setLens('pressure', 10, true);
  assert.deepEqual(Array.from(f.sinceReference!), Array.from(ctx.ref), 'back to the healthy reference');
  f.onFrame(h.frame as never); f.setLens('since', 20, true);
  assert.deepEqual(lensColourAt(f.data, 'PV_TRUNK', 0), lensColourAt(computeLens('delta', h.frame as never, 'light', { ...ctx, ref: Float32Array.from((h.frame as never as { P: ArrayLike<number>; Pf?: ArrayLike<number> }).Pf ?? (c.frame as never as { P: ArrayLike<number> }).P) } as never), 'PV_TRUNK', 0), 'taken again from the state it came in on');
  f.dispose();
});

test('the parity claims: all twelve lens rows are claimed from the table; Since is wired once a slide feeds its baseline (the deck's figure link)', () => {
  assert.equal(claims.length, LENS_IDS.length);
  const by = new Map(claims.map((x) => [x.id, x.wired]));
  for (const id of LENS_IDS) assert.ok(by.has(`lens:${id}`), id);
  assert.equal(by.get('lens:since'), SINCE_BASELINE_FED);
  assert.equal(claims.filter((x) => x.wired).length, SINCE_BASELINE_FED ? 12 : 11);
});
