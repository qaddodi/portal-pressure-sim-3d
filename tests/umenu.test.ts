import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fold, filterRows, emptyNote, stepRow, wordsOf, GROUP_WHERE } from '../src/ui/menu/umenu-logic.ts';

const src = (p: string) => readFileSync(p, 'utf8');

test('fold and the search match as the 2D menu does', () => {
  assert.equal(fold('Pre-hepatic'), 'prehepatic');
  assert.equal(fold('Cirrhosis — Décompensated'), 'cirrhosisdecompensated');
  const rows = [{ k: 'a', find: fold('Healthy Normal'), more: fold('Normal adult at rest') }, { k: 'b', find: fold('Cirrhosis'), more: fold('Scarred liver, healthy spleen') }];
  assert.deepEqual([...filterRows(rows, 'cirr')].map((r) => r.k), ['b']);
  assert.deepEqual([...filterRows(rows, '')].map((r) => r.k), ['a', 'b']);
  assert.deepEqual([...filterRows(rows, 'pre hep')].map((r) => r.k), [], 'no row says it');
  // names first: "healthy" is in a's name, so b (whose summary says healthy) is not pulled in
  assert.deepEqual([...filterRows(rows, 'healthy')].map((r) => r.k), ['a']);
  // only when no name matches does the search reach into the summaries
  assert.deepEqual([...filterRows(rows, 'spleen')].map((r) => r.k), ['b']);
  assert.deepEqual(wordsOf('  A  b '), ['a', 'b']);
});

test('the "nothing here" note counts the other tab, as 2D words it', () => {
  assert.deepEqual(emptyNote('present', 0, 2, 'x'), { show: true, text: 'No presentation matches.', other: '2 patients match ›' });
  assert.equal(emptyNote('patients', 0, 1, 'x').other, '1 presentation matches ›');
  assert.equal(emptyNote('present', 0, 1, 'x').other, '1 patient matches ›');
  assert.equal(emptyNote('present', 3, 1, 'x').show, false);
  assert.equal(emptyNote('present', 0, 0, '').show, false, 'an empty field never says nothing matches');
});

test('arrow keys step over the visible rows, and Up from the first goes to the search field', () => {
  assert.equal(stepRow(0, -1, 5), -1);
  assert.equal(stepRow(0, 1, 5), 1);
  assert.equal(stepRow(4, 1, 5), 4);
  assert.equal(stepRow(2, -1, 5), 1);
});

test('every patient group has its words', () => {
  for (const g of ['Yours', 'Normal', 'Pre-hepatic', 'Presinusoidal', 'Sinusoidal', 'Postsinusoidal', 'Post-hepatic', 'Cardiac']) assert.ok(GROUP_WHERE[g], g);
});

test('the main menu is on 2D\'s .umenu markup and the old sh-* menu is gone', () => {
  const menu = src('src/ui/menu/UMenu.tsx');
  const css = ['app-07-floating', 'app-02-controls', 'app-03-layouts'].map((f) => src(`src/ui/styles/${f}.css`)).join('\n');
  for (const c of ['umenu', 'um-grab', 'um-top', 'um-search', 'um-q', 'um-x', 'um-tabs', 'um-tab', 'um-cols', 'um-col', 'um-g', 'um-gl', 'um-row', 'um-t', 'um-m', 'um-info', 'um-inline', 'um-foot', 'um-esc', 'um-empty', 'um-link', 'um-pv', 'um-scrim']) {
    assert.ok(menu.includes(c) || c === 'um-scrim' && menu.includes('um-scrim'), `${c} in the menu markup`);
    assert.ok(new RegExp(`\\.${c}\\b`).test(css), `.${c} is in 2D's stylesheet`);
  }
  for (const old of ['sh-row', 'sh-tabs', 'sh-lrow', 'sh-pv', 'sh-title', 'Frame']) assert.ok(!menu.includes(old), `${old} (the old menu's markup) is gone`);
  assert.ok(/usePresence/.test(menu) && /inert=\{!open\}/.test(menu), 'the menu leaves by .out and takes no tap while it goes');
  assert.ok(/Sheets/.test(src('src/ui/shell/Sheets.tsx')) && src('src/ui/shell/Sheets.tsx').includes('<UMenu />'));
});

test('History and Help are pages pushed inside Settings, on 2D\'s .menu-page markup', () => {
  const pop = src('src/ui/shell/Menu.tsx'), settings = src('src/ui/settings/SettingsSheet.tsx');
  const css = src('src/ui/styles/app-02-controls.css');
  for (const c of ['menu-root', 'menu-page', 'menu-back', 'pushed']) { assert.ok(pop.includes(c), `${c} in the menu markup`); assert.ok(new RegExp(`\\.${c}\\b`).test(css), `.${c} is in 2D's stylesheet`); }
  assert.ok(/push\('history'\)/.test(settings) && /push\('help'\)/.test(settings), 'the History and Help rows push a page');
  assert.ok(!/runFeature\('history'/.test(settings) && !/sheet: 'help'/.test(settings), 'neither closes Settings to open its own sheet');
  assert.ok(/inert=\{pushed\}/.test(pop) && /inert=\{!pushed\}/.test(pop), 'the rows under a page take no touch, and a page that has gone takes none');
});
