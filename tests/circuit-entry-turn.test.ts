// The Circuit's turn follows the screen: upright when taller than wide, wide otherwise, by every way in and when the screen turns (user, 21 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function screen(w: number, h: number) { (globalThis as any).window = { innerWidth: w, innerHeight: h }; }

test('entry follows the screen, even over an earlier manual turn', async () => {
  screen(390, 844);
  const { useCircuitTurn, entryUpright, screenPortrait } = await import('../src/scene/circuit/pref.ts');
  assert.equal(screenPortrait(390, 844), true);
  useCircuitTurn.getState().set(false);
  assert.equal(entryUpright(), true);
  screen(844, 390);
  assert.equal(entryUpright(), false, 'a phone on its side is wide');
  screen(1440, 900);
  assert.equal(entryUpright(), false);
  screen(820, 1180);
  assert.equal(entryUpright(), true, 'an iPad upright');
});

test('every way in asks entryUpright, a turn of the screen is followed, nothing is stored', () => {
  const api = readFileSync(new URL('../src/scene/api.ts', import.meta.url), 'utf8');
  assert.equal((api.match(/entryUpright\(\)/g) ?? []).length, 3, 'showView, showCircuit, showShot');
  const va = readFileSync(new URL('../src/ui/shell/view-actions.ts', import.meta.url), 'utf8');
  assert.ok(/followScreen/.test(va) && /setCircuitUpright\(on/.test(va));
  assert.ok(!/localStorage/.test(readFileSync(new URL('../src/scene/circuit/pref.ts', import.meta.url), 'utf8')));
});
