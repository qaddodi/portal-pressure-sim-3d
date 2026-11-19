import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(p, 'utf8');
const css2d = Object.fromEntries(['app-02-controls', 'app-03-layouts', 'app-07-floating'].map((f) => [f, src(`src/ui/css2d/${f}.css`)]));
const all2d = Object.values(css2d).join('\n');

test('Settings, Help and Search are on the 2D app\'s own markup, which its stylesheet styles', () => {
  const settings = src('src/ui/settings/SettingsSheet.tsx'), menu = src('src/ui/shell/Menu.tsx'), search = src('src/ui/search/SearchSheet.tsx'), help = src('src/ui/shell/HelpSheets.tsx');
  for (const c of ['menu-group', 'menu-title', 'menu-item', 'lens lens-opt', 'mt-sw', 'look-grid', 'look-tile', 'look-chip', 'look-half', 'look-card', 'fig-mp', 'ts-reset']) assert.ok((settings + menu).includes(c), `${c} in the Settings markup`);
  for (const c of ['menu-group', 'menu-title', 'menu-item', 'lens-opt', 'mt-sw', 'look-grid', 'look-tile', 'ts-reset', 'fig-mp']) assert.ok(new RegExp(`\\.${c.split(' ')[0]}\\b`).test(all2d), `.${c} is in 2D's stylesheet`);
  for (const c of ['pal-back', 'pal-top', 'pal-input', 'pal-list', 'pal-item', 'pal-g', 'pal-t', 'pal-h', 'pal-foot', 'pal-empty']) { assert.ok(search.includes(c), `${c} in the palette markup`); assert.ok(new RegExp(`\\.${c}\\b`).test(all2d), `.${c} is in 2D's stylesheet`); }
  assert.ok(help.includes('menu-credit') && help.includes('MenuPop'), 'Help is a 2D menu with the author\'s credit');
  assert.ok(menu.includes('className={`menu ${cls}') && menu.includes('as-sheet') && menu.includes('sheet-head') && menu.includes('um-scrim'));
  for (const old of ['sh-row', 'sh-find', 'sh-hit-row', 'sh-list', 'sh-fig']) assert.ok(!(settings + search + help).includes(old), `${old} (a 3D-only class) is gone from the Settings, Search and Help markup`);
});
test('the menu is in the page only while it is open, and always leaves by .leaving, never by popping out', () => {
  const menu = src('src/ui/shell/Menu.tsx');
  assert.ok(/usePresence/.test(menu) && /leaving/.test(menu));
  assert.ok(/inert=\{!open\}/.test(menu), 'a menu leaving takes no tap and no focus');
});
