// The audit of the sinusoid against 2D (sinusoid-model.js, sinusoid-view.js draw): the states that reach the shader and the ones 2D reads a little differently than first copied.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { sinusoidTargets, type LobuleModel } from '../src/scene/lobule/model.ts';

const base = { sigma: 0.15, fibSin: 0, lymph: 0.8, lymph0: 0.8, lyProt: 0.88, act: 0, congU: 0, flow: 1, zone: { sin: 1 }, rev: { sin: false } } as unknown as LobuleModel;
const uni = (v: SinusoidView, n: string) => (v.tissue.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms[n]!.value;

test('a hepatic lymph of exactly 0 stays 0 (2D: m.lymph ?? 0.6, not ||): the filtered fluid in Disse stops, it does not read as healthy', () => {
  assert.equal(sinusoidTargets({ ...base, lymph: 0 }).filt, 0);
  assert.equal(sinusoidTargets({ ...base, lymph: 0.8 }).filt, 1);
  assert.equal(sinusoidTargets({ ...base, lymph: 1.6 }).filt, 2);
  assert.equal(sinusoidTargets({ ...base, lymph: 100 }).filt, 6, 'at most six times the healthy');
});

test('reversed flow reaches the shader (the streaks and the albumin run the other way) and the lumen\'s speed is clamped as 2D clamps it', () => {
  assert.equal(sinusoidTargets({ ...base, rev: { sin: true } } as LobuleModel).v, -1);
  assert.equal(sinusoidTargets({ ...base, flow: 0 }).v, 0.08);
  assert.equal(sinusoidTargets({ ...base, flow: 99 }).v, 3);
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets({ ...sinusoidTargets(base), v: -1 }); v.update(0);
  assert.equal(uni(v, 'uDir'), -1);
  v.snapTargets(sinusoidTargets(base)); v.update(16);
  assert.equal(uni(v, 'uDir'), 1);
});

test('the opening state is whole: end arrows full, no wash, the tissue opaque to every edge once landed', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(sinusoidTargets(base)); v.update(0);
  const rev = uni(v, 'uRev') as { x: number }; assert.equal(rev.x, 1);
  assert.equal(uni(v, 'uAll'), 1); assert.equal(uni(v, 'uFocus'), 1);
  assert.equal((uni(v, 'uWedge') as { x: number }).x, 0);
  assert.equal((uni(v, 'uEndA') as { x: number; y: number }).x, 1);
});
