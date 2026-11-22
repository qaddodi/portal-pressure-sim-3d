// Integration review I1 (22 Nov): a hold that lasts as long as an instrument RUNS (a live Doppler, a running trace) asks for frames but is not motion, so it never parks the
// background slot (clock/idle.ts reads clock.moving). Before, any live instrument parked the micro views' build, the geometry upload and the liver shape for as long as it ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';

const fakeClock = () => {
  let t = 0;
  return createClock({ raf: () => 1, cancel: () => {}, now: () => t, timer: () => 0, untimer: () => {} });
};

test('a steady hold asks for frames but is not motion; the calm call follows motion holds only', () => {
  const c = fakeClock();
  let calm = 0;
  c.onCalm(() => { calm++; });
  const s = c.hold('doppler', { steady: true });
  assert.equal(c.held, 1); assert.equal(c.moving, 0);
  const m = c.hold('camera');
  assert.equal(c.moving, 1); assert.deepEqual(c.movingTags(), ['camera']);
  m.release();
  assert.equal(calm, 1, 'the last motion hold letting go is calm, even with a steady hold live');
  s.release();
  assert.equal(calm, 1, 'a steady hold letting go is not a calm event');
  assert.equal(c.held, 0); assert.equal(c.moving, 0);
});

test('the background slot waits on motion holds only', () => {
  const src = readFileSync(new URL('../src/clock/idle.ts', import.meta.url), 'utf8');
  assert.match(src, /held: \(\) => clock\.moving/);
});

// Every hold that lives for "while the model runs" is steady. A new one must choose: add it here (steady) or leave it out (motion).
const STEADY: Record<string, string> = {
  'src/ui/tests/doppler/DopplerPane.tsx': "clock.hold('doppler', { steady: true })",
  'src/ui/charts/vitals/VitalsCard.tsx': "clock.hold('vitals', { steady: true })",
  'src/ui/tests/trace/OverTimePane.tsx': "clock.hold('trace', { steady: true })",
  'src/ui/tests/slide/BeatCard.tsx': "clock.hold('beat-card', { steady: true })",
  'src/ui/tests/fibro/FibroPane.tsx': 'clock.hold(TAG, { steady: true })',
};
test('the instruments that run for minutes hold their frames as steady', () => {
  for (const [f, want] of Object.entries(STEADY)) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(src.includes(want), `${f} holds frames while the model runs: it must be steady`);
    assert.equal(src.split('clock.hold(').length, src.split('{ steady: true })').length, `${f}: every hold here is steady`);
  }
});
