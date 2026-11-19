import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLOW_MODE, QUIET_AMOUNT, markSpeed, targetAmount } from '../src/scene/flow.ts';
import { TOON_FS } from '../src/scene/materials/shaders.ts';
import { CelScene } from '../src/scene/scene.ts';

/** Runs the scene's frames from `from` to `to` ms at 16 ms, as the clock would. */
const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };

test('option A is the default (owner, 19 Nov), and the settings switch holds the others', () => assert.equal(DEFAULT_FLOW_MODE, 'A'));

test('A: marks only on named vessels; B: all, fainter off topic; C: all; D: only while the pulse runs', () => {
  assert.equal(targetAmount('A', true, 0), 1);
  assert.equal(targetAmount('A', false, 0), 0);
  assert.equal(targetAmount('B', false, 0), QUIET_AMOUNT);
  assert.equal(targetAmount('B', true, 0), 1);
  assert.equal(targetAmount('C', false, 0), 1);
  assert.equal(targetAmount('D', true, 0), 0);
  assert.equal(targetAmount('D', false, 1), 1);
});

test('reversed flow scrolls the other way, and nothing moves when nothing flows', () => {
  assert.ok(markSpeed(5) > 0);
  assert.ok(markSpeed(-5) < 0);
  assert.equal(markSpeed(-5), -markSpeed(5));
  assert.equal(markSpeed(0), 0);
  assert.equal(markSpeed(0.04), 0);
});

test('faster flow runs faster, but the cava does not race', () => {
  assert.ok(markSpeed(18) > markSpeed(2));
  assert.ok(markSpeed(500) === markSpeed(60));
  assert.ok(markSpeed(60) < 1.3);
});

test('the shader uses the same speed curve as the CPU', () => {
  assert.match(TOON_FS, /a < 0\.05/);
  assert.match(TOON_FS, /0\.3 \+ 0\.55 \* sqrt\(min\(a, 60\.0\) \/ 20\.0\)/);
});

test('A in the scene: still vessels show no marks; the picked one and the named ones do, with a fade', () => {
  const s = new CelScene();
  const amt = (id: string) => s.vessels.find((o) => o.edge!.id === id)!.toon.uniforms.flowAmount.value as number;
  run(s, 0, 32);
  assert.equal(amt('PV_TRUNK'), 0);
  s.setNamedVessels(['RHV_IVC']);
  run(s, 48, 400);
  assert.equal(amt('RHV_IVC'), 1);
  assert.equal(amt('PV_TRUNK'), 0);
  s.pick('PV_TRUNK');
  run(s, 416, 800);
  assert.equal(amt('PV_TRUNK'), 1, 'the picked vessel carries marks');
  s.pick(null);
  run(s, 816, 1200);
  assert.equal(amt('PV_TRUNK'), 0);
  s.dispose();
});

test('switching to C paints soft bands on every vessel', () => {
  const s = new CelScene();
  s.setFlowMode('C');
  run(s, 0, 400);
  for (const o of s.vessels) { assert.equal(o.toon.uniforms.flowAmount.value, 1); assert.equal(o.toon.uniforms.flowBands.value, 1); }
  s.dispose();
});

test('option D: marks run after a change and are gone seconds later', () => {
  const s = new CelScene();
  s.setFlowMode('D');
  const o = s.vessels[0]!;
  run(s, 0, 96);
  assert.equal(o.toon.uniforms.flowAmount.value, 0);
  s.flow.trigger(100);
  run(s, 112, 500);
  assert.ok((o.toon.uniforms.flowAmount.value as number) > 0.9);
  run(s, 6000, 6400);
  assert.equal(o.toon.uniforms.flowAmount.value, 0);
  s.dispose();
});

test('a still scene asks for no frames: nothing named, nothing picked, camera landed', () => {
  const s = new CelScene();
  s.resize(800, 600);
  let t = 0;
  while (s.update(t)) { t += 16; if (t > 5000) assert.fail('never settled'); }
  assert.equal(s.update(t + 16), false);
  assert.equal(s.update(t + 32), false);
  s.dispose();
});
