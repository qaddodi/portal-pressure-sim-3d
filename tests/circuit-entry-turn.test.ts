// The Circuit opens upright on a phone (held either way) and wide everywhere else, by every way in (user, 21 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function screen(w: number, h: number) { (globalThis as any).window = { innerWidth: w, innerHeight: h }; }

test('a phone always enters upright, even after a wide turn; a Mac opens wide', async () => {
  screen(390, 844);
  const { useCircuitTurn, entryUpright, phoneScreen } = await import('../src/scene/circuit/pref.ts');
  assert.equal(phoneScreen(), true);
  useCircuitTurn.getState().set(false);
  assert.equal(entryUpright(), true);
  screen(844, 390);
  useCircuitTurn.getState().set(false);
  assert.equal(entryUpright(), true, 'sideways phone');
  screen(1440, 900);
  assert.equal(phoneScreen(), false);
  useCircuitTurn.getState().set(false);
  assert.equal(entryUpright(), false);
  useCircuitTurn.getState().set(true);
  assert.equal(entryUpright(), true, 'a manual turn still holds off the phone');
});

test('every way into the Circuit asks entryUpright, and nothing is stored', () => {
  const api = readFileSync(new URL('../src/scene/api.ts', import.meta.url), 'utf8');
  assert.equal((api.match(/entryUpright\(\)/g) ?? []).length, 3, 'showView, showCircuit, showShot');
  assert.ok(!/localStorage/.test(readFileSync(new URL('../src/scene/circuit/pref.ts', import.meta.url), 'utf8')));
});
