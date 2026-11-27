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

test('float mode: the right column holds any two side by side when they fit, the oldest goes first; the chart fills it alone; the left column is never put away', () => {
  const fit = () => true, tight = () => false;
  assert.deepEqual(putsAway('treat', ['tests'], 'float', fit), [], 'Treat beside Tests');
  assert.deepEqual(putsAway('tests', ['treat'], 'float', fit), [], 'Tests beside Treat');
  assert.deepEqual(putsAway('history', ['treat'], 'float', fit), [], 'History beside Treat (the owner\'s Mac report: History put Treat away)');
  assert.deepEqual(putsAway('treat', ['history'], 'float', fit), []);
  assert.deepEqual(putsAway('history', ['treat', 'tests'], 'float', fit), ['treat'], 'a third puts away the one opened longest ago');
  assert.deepEqual(putsAway('history', ['tests', 'treat'], 'float', fit), ['tests'], 'whichever that is, Tests too');
  assert.deepEqual(putsAway('treat', ['history', 'tests', 'action'], 'float', fit), ['history'], 'the action card is not in the column');
  assert.deepEqual(putsAway('history', ['treat'], 'float', tight), ['treat'], 'two that do not fit: the newest replaces the other');
  assert.deepEqual(putsAway('timeline', ['why', 'tests'], 'float', fit), ['why', 'tests'], 'the full-width chart fills the column alone');
  assert.deepEqual(putsAway('why', ['timeline'], 'float', fit), ['timeline'], 'and goes for any right-hand panel');
  assert.deepEqual(putsAway('action', ['treat', 'tests', 'history'], 'float', fit), [], 'the action card is the left column: it puts none away');
  for (const p of ['tests', 'treat', 'history', 'compare', 'why', 'timeline'] as const) assert.ok(!putsAway(p, ['action'], 'float', fit).includes('action'), `${p} leaves the action card`);
});

test('the order is kept by the wire: what came up joins at the end, a panel opened again keeps its place, what closed leaves; Esc closes the newest first', () => {
  const wire = readFileSync('src/ui/surface/wire.ts', 'utf8');
  assert.match(wire, /order = \[\.\.\.order\.filter\(\(q\) => !away\.includes\(q\)\), p\]/);
  assert.match(wire, /if \(!open\.has\(p\) \|\| order\.includes\(p\)\) continue;/, 'a panel already in the order keeps its place');
  assert.match(wire, /putsAway\(p, order, surfaceModeNow\(\), fitsNow\(order\.includes\('action'\)\)\)/, 'the fit is the screen\'s (panel-place.ts fitsTogether)');
  assert.match(readFileSync('src/ui/keys/useKeys.ts', 'utf8'), /\.\.\.escPanels\(sh\.sheet\)/);
});

test('the slot rules live in the table, not in hand-written subscriptions; menus no longer put Treat away', () => {
  const boot = readFileSync('src/ui/action/boot.ts', 'utf8');
  assert.match(boot, /startSlots\(\)/);
  assert.doesNotMatch(boot, /CARD_SHEETS/);
  assert.doesNotMatch(boot, /usesBottomBar\(useUi\.getState\(\)\.device\) && useTreat/);
});
