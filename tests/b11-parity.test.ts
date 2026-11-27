import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILT_PANES, PANES, TABS, tabOf, PANE_ORDER, shortName, tinyName } from '../src/ui/tests/panes.ts';
import { claims } from '../src/parity/b11.ts';
import { testsPlace, sideWidth, roomWith } from '../src/ui/tests/place.ts';
import { freeRoom } from '../src/ui/shell/room.ts';
import { deviceClass } from '../src/ui/layout/device.ts';

const layer = readFileSync(new URL('../src/ui/tests/TestsLayer.tsx', import.meta.url), 'utf8');
const panesDir = readFileSync(new URL('../src/ui/tests/panes.ts', import.meta.url), 'utf8');

test('the tabs are the 2D dock\'s: nine instruments, Over time under Pressure, the 2D short names', () => {
  assert.deepEqual(PANE_ORDER, ['profile', 'scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts', 'trials']);
  assert.deepEqual(TABS, PANE_ORDER.filter((id) => id !== 'scope'));
  assert.equal(tabOf('scope'), 'profile');
  assert.equal(PANES.scope.name, 'Pressure over time');
  assert.equal(PANES.hvpg.name, 'IR (HVPG)');
  assert.equal(shortName('hvpg'), 'IR');
  assert.equal(tinyName('endoscopy'), 'Scope');
  assert.equal(tinyName('fibroscan'), 'Fibro');
});

test('every instrument claimed as wired is one TestsLayer renders; the claims name only inventory rows (parity-score checks that)', () => {
  for (const id of BUILT_PANES) assert.ok(new RegExp(`\\b${id}:\\s*\\(`).test(layer) || layer.includes(`registerPane('${id}'`), `TestsLayer renders no pane for ${id}`);
  assert.ok(panesDir.includes('BUILT_PANES'));
  const wired = new Set(claims.filter((c) => c.wired).map((c) => c.id));
  for (const id of BUILT_PANES) assert.ok(wired.has(`tests:${id}`), `tests:${id} is built but not claimed wired`);
  assert.equal(claims.filter((c) => c.id.startsWith('tests:')).length, PANE_ORDER.length);
});

test('placement: a wide screen docks the card on the right at the 2D width; a phone takes a sheet over the foot; the figure keeps the rest', () => {
  assert.equal(sideWidth(1000), 500); assert.equal(sideWidth(1440), 500); assert.equal(sideWidth(2400), 600);
  const safe = { top: 0, right: 0, bottom: 0, left: 0 };
  const mac = { w: 1440, h: 900, safe }, d = deviceClass(mac.w, mac.h);
  const p = testsPlace(mac, d);
  assert.equal(p.kind, 'side');
  assert.equal(p.rect.x + p.rect.w + 12, mac.w);
  const room = freeRoom(mac, d), left = roomWith(room, p);
  assert.ok(left.w > 0 && left.x + left.w <= p.rect.x, 'the figure\'s room ends before the card');
  const phone = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, dp = deviceClass(phone.w, phone.h);
  const s = testsPlace(phone, dp);
  assert.equal(s.kind, 'sheet');
  assert.ok(s.rect.y + s.rect.h <= phone.h && s.rect.x >= 0 && s.rect.x + s.rect.w <= phone.w);
  const rest = roomWith(freeRoom(phone, dp), s);
  assert.ok(rest.h >= 0 && rest.y + rest.h <= s.rect.y, 'the figure keeps what the sheet leaves above it (2D Half is one fixed 520 px, capped by the room: dock-sheet.js stops)');
});

// ── the card is the 2D dock's markup (dock.js: head row with the tabs and the close, .instr-tabs.ws-tabs, .it-full / .it-short, roving tabindex, arrow keys) ──
import { fitTabs } from '../src/ui/surface/tab-fit.ts';
import { TAB_ICONS } from '../src/ui/tests/copied/dock-words.copied.js';

test('the Tests card wears the 2D dock\'s classes, so the lifted sheets style it (no copy of them)', () => {
  // (the head and the tab strip are the one panel head's, surface/PanelHead.tsx and Tabs.tsx, which emit the 2D dock's classes: .card-head, .tabbed, .instr-tabs, .card-close)
  const head = readFileSync(new URL('../src/ui/surface/PanelHead.tsx', import.meta.url), 'utf8'), tabs = readFileSync(new URL('../src/ui/surface/Tabs.tsx', import.meta.url), 'utf8');
  const all = [layer, head, tabs, readFileSync(new URL('../src/ui/tests/CompareLine.tsx', import.meta.url), 'utf8')].join('\n');
  assert.match(layer, /<PanelHead className="dock-head"[^>]*yieldTitle/, 'the head is the one panel head; its title steps aside for the tabs');
  assert.match(layer, /variant: 'icon', className: 'ws-tabs'/, 'the tabs are the one strip, icon variant');
  for (const c of ['instrument-workspace', 'float-ui', 'card-head', "' tabbed'", 'instr-tabs', 'instr-tab', 'it-t', 'it-full', 'it-short', 'card-close', 'dock-body', 'dock-pane', 'workspace-comparison']) assert.ok(all.includes(c), `the card has .${c}`);
  assert.ok(tabs.includes('tabIndex={t.id === value ? 0 : -1}'), 'roving tabindex: only the open tab is in the tab order');
  assert.ok(/'ArrowLeft', 'ArrowRight', 'Home', 'End'/.test(tabs), 'arrow keys, Home and End move between the tabs');
  assert.ok(layer.includes("document.getElementById('tabInstruments')?.focus()"), 'closing returns focus to the Tests button');
  assert.deepEqual(Object.keys(TAB_ICONS as Record<string, string>), PANE_ORDER, 'every tab has its 2D icon');
});

test('the tab row fits its width as dock.js fitTabs does: compact under 780, narrow under 520, tight under 420, and a bare open tab where its name would be cut', () => {
  assert.deepEqual(fitTabs(800, 8, 'Pressure'), { compact: false, narrow: false, tight: false, bare: false });
  assert.deepEqual(fitTabs(700, 8, 'Pressure'), { compact: true, narrow: false, tight: false, bare: false });
  assert.deepEqual(fitTabs(480, 8, 'Pressure'), { compact: true, narrow: true, tight: false, bare: false });
  assert.deepEqual(fitTabs(398, 8, 'IR'), { compact: true, narrow: true, tight: true, bare: false });
  assert.equal(fitTabs(300, 8, 'Endoscopy').bare, true, 'the open tab is an icon too when its whole name will not fit');
});
