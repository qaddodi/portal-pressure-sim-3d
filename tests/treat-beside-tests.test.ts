// F13 of the independent review: on a wide screen the Tests card (right-hand column, 500 to 600 px) opened over the Treat card, which stands at the same right edge, and covered its controls.
// Since stage 2 of the menu unification the column's one rule places them (surface/panel-place.ts columnSteps, which folded treat/beside.ts in): the panel opened first keeps the right
// edge and the next steps left of it by its width and one gap, so neither covers the other's controls at any width, in either order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deviceClass, type Viewport } from '../src/ui/layout/device.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { columnSteps, columnWidth, panelBand, steppedPlace, PANEL_STD } from '../src/ui/surface/panel-place.ts';

const TREAT_W = PANEL_STD, GAP = 12;   // (the right column's standard width, --panel-std; right: safe-right + --gap)
const vpOf = (w: number, h: number): Viewport => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
const stepsOf = (vp: Viewport, order: ('tests' | 'treat')[]) => {
  const d = deviceClass(vp.w, vp.h), tw = testsPlace(vp, d).rect.w;
  return columnSteps(order, (p) => columnWidth(p, vp, d, tw), panelBand(vp, d).gap);
};

for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]] as const) {   // (where the two fit: an iPad on its side or a 1280 px window holds one, panel-column.test.ts)
  test(`${w} x ${h}: Treat opened beside the Tests card stands left of it, not under it, and stays on the screen`, () => {
    const vp = vpOf(w, h), device = deviceClass(w, h);
    assert.equal(device, 'desktop');
    const tests = testsPlace(vp, device);
    assert.equal(tests.kind, 'side');
    const step = stepsOf(vp, ['tests', 'treat']).treat!;
    const right = w - GAP - step, left = right - TREAT_W;
    assert.ok(right + GAP <= tests.rect.x, `Treat ends at ${right}, the Tests card starts at ${tests.rect.x}: they are ${tests.rect.x - right} px apart`);
    assert.equal(tests.rect.x - right, GAP, 'one gap between them, the gap Treat keeps from the screen edge');
    assert.ok(left >= GAP, `Treat starts at ${left}: it is not pushed off the left edge`);
  });
  test(`${w} x ${h}: the Tests card opened beside Treat stands left of it`, () => {
    const vp = vpOf(w, h), device = deviceClass(w, h);
    const s = stepsOf(vp, ['treat', 'tests']);
    assert.equal(s.treat, 0, 'Treat, opened first, keeps the edge');
    const t = steppedPlace(testsPlace(vp, device), s.tests!).rect;
    assert.equal(w - GAP - TREAT_W - (t.x + t.w), GAP);
    assert.ok(t.x >= 0);
  });
}

test('no step for the oldest, and none for a sheet or an instrument in focus', () => {
  const vp = vpOf(1440, 900);
  assert.equal(stepsOf(vp, ['treat']).treat, 0);
  assert.deepEqual(steppedPlace(testsPlace(vpOf(390, 844), deviceClass(390, 844)), 300).rect, testsPlace(vpOf(390, 844), deviceClass(390, 844)).rect, 'a phone\'s sheet stands where it is');
  assert.deepEqual(steppedPlace(testsPlace(vp, 'desktop', { focus: true }), 300).rect, testsPlace(vp, 'desktop', { focus: true }).rect, 'focus fills the screen');
});

test('the step respects the right safe area (an iPad with an inset)', () => {
  const vp: Viewport = { w: 1366, h: 1024, safe: { top: 0, right: 20, bottom: 0, left: 0 } };
  const tests = testsPlace(vp, deviceClass(1366, 1024));
  const step = stepsOf(vp, ['tests', 'treat']).treat!, right = vp.w - vp.safe.right - GAP - step;
  assert.equal(tests.rect.x - right, GAP);
});

test('the step moves Treat by the panel shell\'s translate, which glides, never a jump; Tests glides by its own transform', () => {
  const card = readFileSync('src/ui/treat/TreatCard.tsx', 'utf8'), pcss = readFileSync('src/ui/surface/panel.css', 'utf8');
  assert.match(card, /const shell = usePanelShell\('treat', open, ref, true\);/, 'Treat is a panel of the shell');
  assert.match(card, /'--instr-occ': '0px', \.\.\.\(thumb \? stopVars\(stops\) : shell\.vars\)/, 'the shell\'s place and step, and 2D\'s own step at 0');
  assert.match(pcss, /translate: calc\(-1 \* var\(--pl-step, 0px\)\) 0 !important;/);
  assert.match(pcss, /transition: transform var\(--pl-leave\) var\(--ease-arrive\), translate var\(--pl-leave\)/, 'the step glides');
  assert.match(readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8'), /steppedPlace\(fitted\.place, step\)/);
  assert.match(readFileSync('src/ui/tests/tests.css', 'utf8'), /\.t-pos\[data-live="true"\]:not\(\[data-kind="sheet"\]\) \{ transition: transform/);
});
