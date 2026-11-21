// The first-run hint (2D main.js showFirstHint): once per device, sticky, closed by the first pick (counted read) or by a talk or a phone sheet (not counted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintText, startFirstHint } from '../src/ui/shell/first-hint.ts';
import { useShell } from '../src/ui/shell/store.ts';
import { useTreat } from '../src/ui/treat/store.ts';
import { useSelection } from '../src/ui/action/selection.ts';

const env = (o: { seen?: boolean; fine?: boolean; webdriver?: boolean; phone?: boolean } = {}) => {
  const marks: string[] = [];
  return { marks, e: { seen: () => !!o.seen, mark: () => { marks.push('1'); }, fine: () => !!o.fine, webdriver: () => !!o.webdriver, phone: () => !!o.phone } };
};
const reset = () => { useShell.setState({ toast: null, mode: 'free', sheet: null }); useSelection.setState({ sel: null }); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the words are 2D\'s: Click for a mouse, Tap for a finger', () => {
  assert.equal(hintText(true), 'Click a vessel or the liver to change it.');
  assert.equal(hintText(false), 'Tap a vessel or the liver to change it.');
});

test('it shows once, stays (sticky), and a first pick closes it and counts it read', async () => {
  reset();
  const { e, marks } = env({ fine: true });
  const stop = startFirstHint(e, 1);
  await wait(15);
  assert.equal(useShell.getState().toast?.text, hintText(true));
  await wait(3500);   // (past the ordinary toast's 3.2 s: sticky)
  assert.equal(useShell.getState().toast?.text, hintText(true), 'still there');
  useSelection.setState({ sel: { type: 'edge', id: 'PV' } });
  assert.equal(useShell.getState().toast, null);
  assert.deepEqual(marks, ['1']);
  stop(); reset();
});

test('a talk takes it away without counting it read; a device that has seen it, or automation, shows none', async () => {
  reset();
  const a = env();
  const stop = startFirstHint(a.e, 1);
  await wait(15);
  assert.ok(useShell.getState().toast);
  useShell.setState({ mode: 'deck' });
  assert.equal(useShell.getState().toast, null);
  assert.deepEqual(a.marks, [], 'not counted as read');
  stop(); reset();
  for (const o of [{ seen: true }, { webdriver: true }]) {
    const x = env(o), st = startFirstHint(x.e, 1);
    await wait(15);
    assert.equal(useShell.getState().toast, null);
    st();
  }
  reset();
});

test('any open sheet (laptop or phone) closes it unread', async () => {
  reset();
  const a = env({ phone: false });
  const stop = startFirstHint(a.e, 1);
  await wait(15);
  assert.ok(useShell.getState().toast);
  useShell.setState({ sheet: 'history' as never });
  assert.equal(useShell.getState().toast, null);
  assert.deepEqual(a.marks, []);
  stop(); reset();
});

test('opening the Treat card closes it unread', async () => {
  reset();
  const a = env({});
  const stop = startFirstHint(a.e, 1);
  await wait(15);
  assert.ok(useShell.getState().toast);
  useTreat.setState({ open: true });
  assert.equal(useShell.getState().toast, null);
  assert.deepEqual(a.marks, []);
  useTreat.setState({ open: false });
  stop(); reset();
});
