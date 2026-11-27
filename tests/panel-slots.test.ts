// Menu unification, stage 0 (reports/menu-unification.md): one sheet-or-float answer for every surface, one table of what a panel coming up puts away.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { surfaceModeOf } from '../src/ui/surface/mode.ts';
import { putsAway, SLOT_PANELS } from '../src/ui/surface/slots.ts';
import { SURFACES, kindOf, closesOnOutsidePress, takesRoom, type SurfaceId } from '../src/ui/surface/kinds.ts';

test('one mode for a table of screens: a sheet exactly when the thumb dock is up (up to 1100 px wide, held upright)', () => {
  const cases: [number, number, 'sheet' | 'float'][] = [
    [390, 844, 'sheet'], [375, 667, 'sheet'], [820, 1180, 'sheet'], [1024, 1366, 'sheet'],
    [844, 390, 'float'], [667, 375, 'float'], [1180, 820, 'float'], [1366, 1024, 'float'], [1440, 900, 'float'], [1920, 1080, 'float'],
  ];
  for (const [w, h, want] of cases) assert.equal(surfaceModeOf(w, h), want, `${w} x ${h}`);
});

test('every Sheet id of the shell has a kind', () => {
  const store = readFileSync('src/ui/shell/store.ts', 'utf8');
  const ids = /export type Sheet = ([^;]+);/.exec(store)![1].match(/'([a-z-]+)'/g)!.map((s) => s.slice(1, -1));
  for (const id of ids) assert.ok(id in SURFACES, `${id} has no entry in surface/kinds.ts`);
});

test('the kind decides the rules: panels never close on a press outside and take the figure\'s room; menus and dialogs close on one and take none', () => {
  for (const id of Object.keys(SURFACES) as SurfaceId[]) {
    const panel = kindOf(id) === 'panel';
    assert.equal(closesOnOutsidePress(id), !panel, id);
    assert.equal(takesRoom(id), panel, id);
  }
});

test('sheet mode: one panel at a time, but the action card and Tests share the foot', () => {
  for (const p of SLOT_PANELS) {
    const others = SLOT_PANELS.filter((q) => q !== p);
    const away = putsAway(p, SLOT_PANELS, 'sheet');
    const keep = p === 'tests' ? ['action'] : p === 'action' ? ['tests'] : [];
    assert.deepEqual(away.sort(), others.filter((q) => !keep.includes(q)).sort(), p);
  }
  // the cases action/boot.ts held by hand before 27 Nov
  assert.deepEqual(putsAway('tests', ['treat'], 'sheet'), ['treat'], 'Tests coming up puts Treat away (Treat\'s Paracentesis opens Ascites)');
  assert.deepEqual(putsAway('treat', ['tests'], 'sheet'), ['tests'], 'Treat coming up puts Tests away');
  assert.deepEqual(putsAway('action', ['treat'], 'sheet'), ['treat'], 'a structure selected puts Treat away');
  assert.deepEqual(putsAway('treat', ['action'], 'sheet'), ['action'], 'Treat coming up puts the structure\'s card away');
  assert.deepEqual(putsAway('action', ['tests'], 'sheet'), [], 'a tap on a structure with Tests up chooses what Tests reads');
});

test('float mode: Tests stands beside one other right-hand panel; the left column is never put away by the right', () => {
  assert.deepEqual(putsAway('treat', ['tests'], 'float'), [], 'Treat steps beside Tests (treat/beside.ts)');
  assert.deepEqual(putsAway('tests', ['treat'], 'float'), []);
  assert.deepEqual(putsAway('history', ['treat', 'tests'], 'float'), ['treat'], 'History takes the place beside Tests');
  assert.deepEqual(putsAway('treat', ['history', 'tests', 'action'], 'float'), ['history']);
  assert.deepEqual(putsAway('timeline', ['why', 'tests'], 'float'), ['why'], 'the full-width chart counts as the other panel');
  assert.deepEqual(putsAway('action', ['treat', 'tests', 'history'], 'float'), [], 'the action card is the left column');
});

test('the slot rules live in the table, not in hand-written subscriptions; menus no longer put Treat away', () => {
  const boot = readFileSync('src/ui/action/boot.ts', 'utf8');
  assert.match(boot, /startSlots\(\)/);
  assert.doesNotMatch(boot, /CARD_SHEETS/);
  assert.doesNotMatch(boot, /usesBottomBar\(useUi\.getState\(\)\.device\) && useTreat/);
});
