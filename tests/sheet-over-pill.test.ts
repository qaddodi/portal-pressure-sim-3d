// Eyes, 20 Nov (phone): the Layers sheet had the view pill drawn over its Labels row. Root cause: 2D takes the pill away while a sheet is up with `.menu-sheet-open` on .app (its lifted rule, app-10-thumb-dock.css),
// and the 3D shell's sheets are not 2D's `.sheet-layer > .menu`, so nothing set it. Shell now marks .app for every phone sheet that rises over the dock. Since the one menu shell (stage 4 of the menu
// unification), every menu is a sheet on the dock where surfaces are sheets (the lens, Blood and From readings menus too, which floated under the top bar before), so every menu is in the set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHEETS_OVER_PILL } from '../src/ui/shell/sheets-over-pill.ts';
import { MENU_IDS } from '../src/ui/surface/menu-head.ts';

test('every sheet that rises over the dock puts the view pill away: every menu of the shell, and the shell\'s own sheets', () => {
  for (const k of ['search', 'history', 'compare', 'why', 'guide', 'timeline']) assert.ok(SHEETS_OVER_PILL.has(k), k);
  for (const k of MENU_IDS) assert.ok(SHEETS_OVER_PILL.has(k), `${k} is a sheet on the dock`);
  for (const k of ['menu', 'settings', 'help', 'readings', 'blood', 'layers', 'lens', 'speed', 'jump']) assert.ok(SHEETS_OVER_PILL.has(k), k);
  // the menus that rise from the timeline bar float above it on a wide screen, and are sheets on the dock on a phone: both stand where the pill hangs (24 Nov: the fast-forward menu's foot was covered)
  const above = [...readFileSync('src/ui/shell/PlayBar.tsx', 'utf8').matchAll(/<Menu id="(\w+)" side="above"/g)].map((m) => m[1]);
  assert.deepEqual(above.sort(), ['jump', 'speed']);
  const src = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.match(src, /sheetUp \? ' menu-sheet-open' : ''/);
  assert.match(readFileSync('src/ui/styles/app-10-thumb-dock.css', 'utf8'), /\.menu-sheet-open\) \.vdock:not\(\.mini\) > \.nb-views,/);
});
