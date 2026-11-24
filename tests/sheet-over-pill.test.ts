// Eyes, 20 Nov (phone): the Layers sheet had the view pill drawn over its Labels row. Root cause: 2D takes the pill away while a sheet is up with `.menu-sheet-open` on .app (its lifted rule, app-10-thumb-dock.css),
// and the 3D shell's sheets are not 2D's `.sheet-layer > .menu`, so nothing set it. Shell now marks .app for every phone sheet that rises over the dock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHEETS_OVER_PILL } from '../src/ui/shell/sheets-over-pill.ts';

test('every sheet that rises over the dock puts the view pill away; the popovers do not', () => {
  for (const k of ['menu', 'settings', 'search', 'help', 'history', 'compare', 'why', 'guide', 'layers', 'timeline']) assert.ok(SHEETS_OVER_PILL.has(k), k);
  // the popovers that open BELOW a top-bar button never reach the pill; the ones that open ABOVE the timeline bar stand under the dock, where the pill hangs (24 Nov: the fast-forward menu's foot was covered)
  for (const k of ['lens', 'blood', 'readings']) assert.ok(!SHEETS_OVER_PILL.has(k), `${k} opens under the top bar`);
  const above = [...readFileSync('src/ui/shell/PlayBar.tsx', 'utf8').matchAll(/<Anchored sheet="(\w+)" place="above"/g)].map((m) => m[1]);
  assert.deepEqual(above.sort(), ['jump', 'speed']);
  for (const k of above) assert.ok(SHEETS_OVER_PILL.has(k), `${k} rises from the timeline bar over the pill`);
  for (const f of ['src/ui/shell/TopBar.tsx', 'src/ui/shell/FigureMenu.tsx']) assert.ok(!/place="above"/.test(readFileSync(f, 'utf8')), `${f}: a popover above its button must be in SHEETS_OVER_PILL`);
  const src = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.match(src, /sheetUp \? ' menu-sheet-open' : ''/);
  assert.match(readFileSync('src/ui/css2d/app-10-thumb-dock.css', 'utf8'), /\.menu-sheet-open\) \.vdock:not\(\.mini\) > \.nb-views,/);
});
