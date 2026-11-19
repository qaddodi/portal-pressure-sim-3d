import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figureRowsOwner, usesBottomBar } from '../src/ui/shell/room.ts';
import type { DeviceClass } from '../src/ui/layout/device.ts';

// iPhone, 19 Nov 2026 (bf442b6): in the Lobule the Layers sheet drew twice, two panels over each other. The top bar's Layers popover and the foot's Layers sheet both open on
// `sheet === 'layers'`; the top bar's button is hidden on a phone but its popover was still mounted. One owner per layout.
const DEVICES: DeviceClass[] = ['phone-portrait', 'phone-landscape', 'tablet-portrait', 'desktop'];

test('the Blood and Layers rows have one owner per layout: the foot sheet with the bottom bar, the top bar\'s popover without it', () => {
  for (const d of DEVICES) assert.equal(figureRowsOwner(d), usesBottomBar(d) ? 'sheet' : 'topbar', d);
  assert.equal(figureRowsOwner('phone-portrait'), 'sheet');
  assert.equal(figureRowsOwner('desktop'), 'topbar');
});

test('the top bar\'s popover is not mounted when the sheet owns the rows, and the sheet is mounted only then', () => {
  const menu = readFileSync('src/ui/shell/FigureMenu.tsx', 'utf8'), sheets = readFileSync('src/ui/shell/Sheets.tsx', 'utf8');
  assert.ok(menu.includes("figureRowsOwner(useUi((s) => s.device)) === 'sheet'") && menu.includes('if (bottom) return <button'), 'FigureMenu returns its (hidden) button alone before it reaches <Anchored>');
  assert.ok(menu.indexOf("if (bottom) return") < menu.indexOf('<Anchored'));
  assert.ok(/figureRowsOwner\(device\) === 'sheet' && !talk && <LayersSheet \/>/.test(sheets));
});

test('no sheet kind is shown by two components at once (one Anchored or Frame or MenuPop per kind)', () => {
  const files = ['src/ui/shell/FigureMenu.tsx', 'src/ui/shell/Sheets.tsx', 'src/ui/shell/TopBar.tsx', 'src/ui/shell/PlayBar.tsx', 'src/ui/shell/HelpSheets.tsx', 'src/ui/settings/SettingsSheet.tsx', 'src/ui/history/HistorySheet.tsx', 'src/ui/compare/CompareUi.tsx', 'src/ui/why/WhySheet.tsx'];
  const seen = new Map<string, number>();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/<(?:Frame|MenuPop) kind="(\w+)"|<Anchored sheet="(\w+)"/g)) { const k = (m[1] ?? m[2])!; seen.set(k, (seen.get(k) ?? 0) + 1); }
  // the top bar's Blood / Layers popover is `<Anchored sheet={kind}>` (one component, two kinds), the foot's is `<Frame kind="layers">`: the owner rule above keeps one of them out
  for (const [k, n] of seen) assert.equal(n, 1, `${k} is mounted once`);
});
