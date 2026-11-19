// The search's Change and Treat orders: their clamps, labels and take-down gating, against the 2D palette.js (the numbers are the ones its commands use).
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { commandWork, commandOffered, isOrderCommand } from '../src/ui/treat/palette-orders.ts';
import { isWiredCommand } from '../src/ui/search/wired.ts';

const env = { say() {}, select() {}, action() {} };

test('every Change and Treat command the 2D palette lists is an order here', () => {
  const rows = UI.search.commands.filter((c) => c.group === 'Treat' || c.group === 'Change');
  assert.equal(rows.length, 39);
  const missing = rows.filter((c) => !isOrderCommand(c.group, c.title)).map((c) => `${c.group}/${c.title}`);
  assert.deepEqual(missing, []);
  for (const c of rows) { assert.ok(isWiredCommand(c.group, c.title)); assert.ok(commandWork(env, c.group, c.title)); }
});
test('a take-down is offered only for what is in place (nothing is in place before a patient is loaded)', () => {
  assert.equal(commandOffered('Treat', 'Remove TIPS'), false);
  assert.equal(commandOffered('Treat', 'TIPS'), true);
  assert.equal(commandOffered('Change', 'Cirrhosis'), true);
});
test('the groups other than Change and Treat are not orders', () => {
  assert.equal(commandWork(env, 'App', 'Home'), null);
  assert.equal(isOrderCommand('View', 'Anatomy view'), false);
});
