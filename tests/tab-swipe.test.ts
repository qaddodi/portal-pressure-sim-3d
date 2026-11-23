import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbourTab } from '../src/ui/shell/tab-swipe.ts';
import { swipeOn } from '../src/ui/tests/dock/swipe.ts';

test('a swipe goes to the next tab on the left, the one before on the right, and stops at the ends', () => {
  const ids = ['drugs', 'fluids', 'procs'] as const;
  assert.equal(neighbourTab(ids, 'drugs', 1), 'fluids');
  assert.equal(neighbourTab(ids, 'fluids', 1), 'procs');
  assert.equal(neighbourTab(ids, 'fluids', -1), 'drugs');
  assert.equal(neighbourTab(ids, 'drugs', -1), null);
  assert.equal(neighbourTab(ids, 'procs', 1), null);
  assert.equal(neighbourTab(ids, 'fluids', 0), null);
});

test('the Tests card swipes on any touch screen with one instrument up, not only a phone sheet', () => {
  assert.equal(swipeOn({ open: true, focus: false, second: null }), true);
  assert.equal(swipeOn({ open: false, focus: false, second: null }), false);
  assert.equal(swipeOn({ open: true, focus: true, second: null }), false);
  assert.equal(swipeOn({ open: true, focus: false, second: 'doppler' }), false);
});
