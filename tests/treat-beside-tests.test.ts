// F13 of the independent review: on a wide screen the Tests card (right-hand column, 500 to 600 px) opened over the Treat card, which stands at the same right edge, and covered its controls.
// Treat now steps left by the Tests card's width (2D's `--instr-occ`, which its stylesheet already glides), so neither card covers the other's controls at any width (treat/beside.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deviceClass, type Viewport } from '../src/ui/layout/device.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { treatStepLeft } from '../src/ui/treat/beside.ts';

const TREAT_W = 400, GAP = 12;   // (app-07-floating.css .treat-card: width min(400px, 100vw - 2 gap), right: safe-right + --gap)
const vpOf = (w: number, h: number): Viewport => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });

for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]] as const) {
  test(`${w} x ${h}: Treat stands beside the Tests card, not under it, and stays on the screen`, () => {
    const vp = vpOf(w, h), device = deviceClass(w, h);
    assert.equal(device, 'desktop');
    const tests = testsPlace(vp, device);
    assert.equal(tests.kind, 'side');
    const step = treatStepLeft(vp, tests);
    const right = w - GAP - step, left = right - TREAT_W;
    assert.ok(right + GAP <= tests.rect.x, `Treat ends at ${right}, the Tests card starts at ${tests.rect.x}: they are ${tests.rect.x - right} px apart`);
    assert.equal(tests.rect.x - right, GAP, 'one gap between them, the gap Treat keeps from the screen edge');
    assert.ok(left >= GAP, `Treat starts at ${left}: it is not pushed off the left edge`);
  });
}

test('no step when no Tests card stands in the column: closed, a sheet over the dock, an instrument in focus', () => {
  const vp = vpOf(1440, 900);
  assert.equal(treatStepLeft(vp, null), 0);
  assert.equal(treatStepLeft(vp, testsPlace(vpOf(390, 844), deviceClass(390, 844))), 0, 'a phone\'s sheet is over the dock, Treat gives way to it instead');
  assert.equal(treatStepLeft(vp, testsPlace(vp, 'desktop', { focus: true })), 0, 'focus fills the screen: Treat gives way (action/boot.ts)');
});

test('the step respects the right safe area (an iPad with an inset)', () => {
  const vp: Viewport = { w: 1366, h: 1024, safe: { top: 0, right: 20, bottom: 0, left: 0 } };
  const tests = testsPlace(vp, deviceClass(1366, 1024));
  const step = treatStepLeft(vp, tests), right = vp.w - vp.safe.right - GAP - step;
  assert.equal(tests.rect.x - right, GAP);
});

test('the Tests card closing and opening move Treat by the 2D translate that already glides, never a jump', () => {
  const css = readFileSync('src/ui/styles/app-07-floating.css', 'utf8').split('\n').find((l) => l.startsWith('.treat-card { right:')) ?? '';
  assert.ok(css.includes('var(--instr-occ, 0px)') && css.includes('translate var(--d-small)'), 'the lifted rule reads --instr-occ and transitions translate');
  assert.ok(readFileSync('src/ui/treat/TreatCard.tsx', 'utf8').includes("'--instr-occ'"), 'TreatCard publishes it');
});
