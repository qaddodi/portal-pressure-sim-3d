// The waist's ends are tapered unless the card's Abrupt says otherwise (Mohammad, 26 Nov 2026). The default is one place, the engine's stent geometry (hales-engine stent-geom.js, TRANS_DEFAULT), and the card,
// the figure's waist bracket, the stent device and the IR pane all read a stent's ends through it: this pins that the vendored copy has it for every stent kind (TIPS, DIPS, a drawn shunt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geomDefault, geomFix, geomOf, withWaist, STENT_KINDS, TRANS_DEFAULT } from '../src/engine/hales/portal/stent-geom.js';

const ends = (g: unknown): number => (g as { trans: number }).trans;

test('every stent kind reads an unset waist as tapered, the card\'s first waist is tapered, and Abrupt stays abrupt', () => {
  assert.ok(STENT_KINDS.includes('tips') && STENT_KINDS.includes('dips') && STENT_KINDS.includes('custom'));
  assert.ok(TRANS_DEFAULT > 0);
  for (const kind of STENT_KINDS) {
    assert.equal(ends(geomDefault(kind)), TRANS_DEFAULT, `${kind}: default geometry`);
    assert.equal(ends(geomOf({}, 'X', kind)), TRANS_DEFAULT, `${kind}: nothing stored`);
    assert.equal(ends(geomFix({ red: 0.3 }, kind)), TRANS_DEFAULT, `${kind}: a waist with no ends set`);
    const first = withWaist({}, 'X', kind, 'red', 0.4);
    assert.equal(ends(geomOf(first, 'X', kind)), TRANS_DEFAULT, `${kind}: the card's first waist`);
    assert.equal(ends(geomOf(withWaist(first, 'X', kind, 'trans', 0), 'X', kind)), 0, `${kind}: Abrupt`);
  }
});

test('the card\'s Ends choice reads the stored ends through the one default: no local fallback to abrupt', () => {
  const controls = readFileSync(new URL('../src/ui/action/stent/stent-controls.copied.ts', import.meta.url), 'utf8');
  assert.match(controls, /geo\(currentParams\(\)\)\.trans > 0 \? 'tapered' : 'abrupt'/);
  const device = readFileSync(new URL('../src/scene/devices/stent/stent-build.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/charts/stent/model.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(device, /\.trans\s*(\?\?|\|\|)\s*0/, 'no reader falls back to abrupt when ends are unset');
});
