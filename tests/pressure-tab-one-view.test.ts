// Pressure card: one view at a time on every card size, never the profile and the trace stacked (their readouts collided, 21 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Pressure tab always shows its switch and one view', () => {
  const tab = readFileSync('src/ui/tests/trace/PressureTab.tsx', 'utf8');
  const layer = readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8');
  assert.ok(tab.includes('pressure-switch'), 'the switch is drawn');
  assert.ok(!/roomy/.test(tab) && !/roomy/.test(layer), 'no stacked "roomy" mode');
  assert.ok(!/<View id="profile"[^>]*\/><View id="scope"/.test(tab), 'the two views are never rendered together');
});
