import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escStep, type EscState } from '../src/ui/keys/escape.ts';

const none: EscState = { dialog: false, sheet: false, testsOpen: false, testsFocus: false, treatOpen: false, sinusoid: false, selection: false, talk: false };
const at = (o: Partial<EscState>) => escStep({ ...none, ...o });

test('one Esc closes one thing, in 2D\'s order (keyboard.js)', () => {
  assert.equal(at({}), null);
  assert.equal(at({ dialog: true, sheet: true, treatOpen: true }), 'dialog');
  assert.equal(at({ sheet: true, treatOpen: true, testsOpen: true }), 'sheet');
  assert.equal(at({ testsOpen: true, testsFocus: true, treatOpen: true }), 'tests-focus', 'a focused instrument goes back to the card first (2D: instrument-focus)');
  assert.equal(at({ testsOpen: true, treatOpen: true }), 'treat', 'Treat before the Tests card (the Mac play-test: Esc did not close Treat with Tests up)');
  assert.equal(at({ treatOpen: true, selection: true }), 'treat');
  assert.equal(at({ testsOpen: true, selection: true }), 'tests');
  assert.equal(at({ selection: true, sinusoid: true }), 'selection');
  assert.equal(at({ sinusoid: true, talk: true }), 'sinusoid');
  assert.equal(at({ talk: true }), 'talk');
});
