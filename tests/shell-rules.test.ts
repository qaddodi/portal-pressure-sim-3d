// The shell's pure rules against the 2D app's: the generated words are current, the search ranks as the palette does, deep links read as main.js reads them, the view pills
// follow view-tap.js, Settings lists every 2D row once, and the commands the empty field offers all have work behind them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { render } from '../scripts/gen-ui-strings.mjs';
import { UI } from '../src/ui/strings.generated.ts';
import { search, command, EMPTY_QUOTA } from '../src/ui/search/match.ts';
import { isWiredCommand } from '../src/ui/search/wired.ts';
import { parseDeepLink, queryFromId } from '../src/ui/shell/deep-link.ts';
import { tapView, pillHidden, toggleKey, zoomInDisabled } from '../src/ui/shell/views.ts';
import { SECTIONS } from '../src/ui/settings/rows.ts';
import { freeRoom, usesBottomBar, footHeight } from '../src/ui/shell/room.ts';
import { fmtClock } from '../src/ui/shell/transport.ts';
import { resetUrl } from '../src/ui/shell/reset.ts';
import { feedbackHref } from '../src/ui/shell/feedback.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

test('strings.generated.ts is what the inventory generates (run npm run gen:strings after npm run sync:inventory)', () => {
  const inv = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8'));
  assert.equal(readFileSync(join(root, 'src/ui/strings.generated.ts'), 'utf8'), render(inv));
});

test('search: an empty field offers a few of each thing, in the placeholder\'s order; a number is the argument', () => {
  const cmds = UI.search.commands.map((c) => command(c.group, c.title, () => undefined, { kw: c.kw, num: c.num, hint: c.hint }));
  const empty = search(cmds, '', UI.search.emptyOrder);
  for (const g of Object.keys(EMPTY_QUOTA)) assert.ok(empty.filter((h) => h.c.group === g).length <= EMPTY_QUOTA[g as keyof typeof EMPTY_QUOTA]);
  const order = empty.map((h) => UI.search.emptyOrder.indexOf(h.c.group));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const tips = search(cmds, 'tips 8', UI.search.emptyOrder);
  assert.equal(tips[0].c.title, 'TIPS');
  assert.equal(tips[0].num, 8);
  assert.equal(search(cmds, 'zzzzqq', UI.search.emptyOrder).length, 0);
});

test('search: the empty field leaves out commands with nothing behind them', () => {
  const cmds = [command('Treat', 'Alpha', () => undefined), { ...command('Treat', 'Beta', () => undefined), wired: false }];
  assert.deepEqual(search(cmds, '', ['Treat']).map((h) => h.c.title), ['Alpha']);
  assert.equal(search(cmds, 'beta', ['Treat']).length, 1, 'typing still finds it');
});

test('every App, Time and View command the palette lists is either wired or says so', () => {
  for (const c of UI.search.commands) if (['App', 'Time', 'View'].includes(c.group)) assert.equal(typeof isWiredCommand(c.group, c.title), 'boolean');
  assert.equal(isWiredCommand('View', 'Colored by velocity'), true);
  assert.equal(isWiredCommand('View', 'Lobule view'), false);
});

test('deep links: script wins over preset, which wins over home; slides count from 1', () => {
  assert.deepEqual(parseDeepLink('?script=hvpg&slide=3&preset=healthy'), { script: { id: 'hvpg', slide: 2 } });
  assert.deepEqual(parseDeepLink('?preset=healthy&home=present'), { preset: 'healthy' });
  assert.deepEqual(parseDeepLink('?home=present'), { home: 'present' });
  assert.deepEqual(parseDeepLink('?home=explore'), { home: 'patients' });
  assert.deepEqual(parseDeepLink('?script=x'), { script: { id: 'x', slide: 0 } });
  assert.deepEqual(parseDeepLink(''), {});
  assert.equal(queryFromId('cirr-decomp'), 'cirr');
});

test('view pills: a second tap refits; Sinusoid shows only in the lobule; A turns anatomy and circuit', () => {
  assert.deepEqual(tapView('anatomic', 'anatomic'), { type: 'refit' });
  assert.deepEqual(tapView('circuit', 'anatomic'), { type: 'go', view: 'circuit', from: 'anatomic' });
  assert.equal(pillHidden('sinusoid', 'anatomic'), true);
  assert.equal(pillHidden('sinusoid', 'lobule'), false);
  assert.equal(pillHidden('sinusoid', 'sinusoid'), false);
  assert.equal(toggleKey('circuit'), 'anatomic');
  assert.equal(toggleKey('lobule'), null);
  assert.equal(zoomInDisabled('sinusoid'), true);
});

test('Settings: every 2D row once, in its sheet order, and none that the 2D sheet does not have', () => {
  const labels = SECTIONS.flatMap((s) => s.rows.map((r) => `${r.row.section ?? 'Top'}/${r.row.label}`));
  assert.equal(new Set(labels).size, labels.length);
  const inv = UI.settings.filter((r) => r.kind !== 'title').map((r) => `${r.section ?? 'Top'}/${r.label}`);
  for (const l of inv) assert.ok(labels.includes(l), `the sheet lacks ${l}`);
  assert.ok(labels.indexOf('Appearance/Light') < labels.indexOf('Display/Blur effect'));
  assert.ok(labels.indexOf('Model/Advanced physiology') < labels.indexOf('Diagnostics/Show frame rate'));
  assert.equal(labels.at(-1), 'Top/Reset everything…');
});

test('the figure\'s room: a laptop keeps the top bar and the play bar; a phone keeps its bottom bar too', () => {
  const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const lap = freeRoom(vp, 'desktop');
  assert.ok(lap.y >= 52 && lap.y + lap.h <= 800 - 52);
  const phone = freeRoom({ w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, 'phone-portrait');
  assert.ok(phone.h < lap.h);
  assert.equal(usesBottomBar('tablet-portrait'), true);
  assert.equal(usesBottomBar('desktop'), false);
  assert.ok(footHeight('phone-portrait') > footHeight('desktop'));
});

test('the clock reads as the 2D timeline\'s: m:ss, then h:mm:ss, then the day alone', () => {
  assert.equal(fmtClock(14, 0), '0:14');
  assert.equal(fmtClock(3725, 0), '1:02:05');
  assert.equal(fmtClock(8, 142), 'Day 142');
});

test('Reset everything reloads to the healthy patient and keeps no talk or cache-busting', () => {
  assert.equal(resetUrl('https://x.test/app/?script=hvpg&slide=3&r=99#a'), 'https://x.test/app/?preset=healthy');
});

test('Send feedback is a draft in the viewer\'s own mail app with what a report needs', () => {
  const h = feedbackHref('a@b.test', { build: 'PREVIEW · abc12345', device: 'UA', screen: '390 × 844 at 3×', view: 'https://x.test/?preset=healthy' });
  assert.ok(h.startsWith('mailto:a@b.test?subject=Portal%20Pressure%20Simulator%20feedback&body='));
  const body = decodeURIComponent(h.split('body=')[1]);
  for (const k of ['Build: PREVIEW · abc12345', 'Device: UA', 'Screen: 390 × 844 at 3×', 'View: https://x.test/?preset=healthy']) assert.ok(body.includes(k));
});
