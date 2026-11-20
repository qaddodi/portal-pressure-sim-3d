// A card belongs to the view that can show what it is about: a vessel card does not stay open over the lobule, nor a lobule part's over the body (found in the Mac play-test, 20 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionFitsView } from '../src/ui/action/selection.ts';

test('vessels, organs and stations fit the body and the circuit only', () => {
  for (const sel of [{ type: 'edge', id: 'TIPS' }, { type: 'organ', id: 'liver' }, { type: 'node', id: 'EPI' }] as const) {
    assert.ok(selectionFitsView(sel, 'anatomic') && selectionFitsView(sel, 'circuit'));
    assert.ok(!selectionFitsView(sel, 'lobule') && !selectionFitsView(sel, 'sinusoid'));
  }
});
test('lobule parts fit the lobule and the sinusoid only; nothing selected fits everywhere', () => {
  const sel = { type: 'lobule', part: 'sin' } as const;
  assert.ok(selectionFitsView(sel, 'lobule') && selectionFitsView(sel, 'sinusoid'));
  assert.ok(!selectionFitsView(sel, 'anatomic') && !selectionFitsView(sel, 'circuit'));
  for (const v of ['anatomic', 'circuit', 'lobule', 'sinusoid']) assert.ok(selectionFitsView(null, v));
});
