import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reservedDelta, signed } from '../src/scene/labels/readings.ts';
import { stationRuns, lineSize } from '../src/scene/labels/type.ts';

// Next bleed 9 on an iPhone (capture 2c00c0ce): "Varices 16.0 mmHg +8.3 mmHg vs healthy" stood in a box reserved for "+00.0", so its last words ran off the screen's edge although the solver kept the box inside.
const vp = { w: 440, h: 736 };
const measure = (t: string, size: number) => t.length * size * 0.56;   // (a stand-in: width grows with the characters)
const width = (delta: string) => lineSize(stationRuns('Varices', true, false, '00.0', { value: '00.0', unit: 'mmHg', delta }), vp, measure).w;

test('the reserved badge is at least as wide as any badge the label can show', () => {
  for (const [lens, actual] of [['pressure', signed(8.3, '8.3 mmHg vs healthy')], ['pressure', signed(-8.3, '8.3 mmHg vs before')], ['pressure', signed(8.3, '8.3')], ['flow', signed(12, '12% vs healthy')], ['flow', signed(120, '120%')]] as const) {
    const r = reservedDelta(lens, actual);
    assert.ok(width(r) >= width(actual), `${lens} "${actual}" reserved as "${r}"`);
  }
});
test('the reserved badge keeps the number at its widest and the words as they are', () => {
  assert.equal(reservedDelta('pressure', '+8.3 mmHg vs healthy'), '+00.0 mmHg vs healthy');
  assert.equal(reservedDelta('pressure', '−8.3'), '+00.0');
  assert.equal(reservedDelta('flow', '+12% vs healthy'), '+000% vs healthy');
  assert.equal(reservedDelta('velocity', '+5 cm/s'), '+5 cm/s');
});
