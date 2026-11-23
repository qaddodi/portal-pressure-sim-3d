// Owner, 23 Nov (iPhone): tapping Settings again did not close its menu. Root cause: the sheet's scrim (z 60) lies over the dock (z 30), so the press on the Settings tab lands on the scrim and closes the sheet
// on pointerdown; the tab's own click then finds the scrim gone and toggles the sheet back open. The same holds for the patient menu's scrim and Search's backdrop. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useShell } from '../src/ui/shell/store.ts';

const s = () => useShell.getState();
test('a tap that closes a sheet from its scrim does not reopen it with the opener\'s click', () => {
  s().close();
  s().toggle('settings'); assert.equal(s().sheet, 'settings');
  s().closeByPress(); assert.equal(s().sheet, null);          // pointerdown on the scrim, over the tab
  s().toggle('settings'); assert.equal(s().sheet, null);      // the tab's click, same gesture
  s().toggle('settings'); assert.equal(s().sheet, 'settings'); // a tap of its own opens it again
  s().toggle('settings'); assert.equal(s().sheet, null);      // and an opener press with no scrim over it closes it
});
test('the tail of a closing tap never blocks another sheet', () => {
  s().close(); s().toggle('settings'); s().closeByPress();
  s().toggle('layers'); assert.equal(s().sheet, 'layers');
  s().close();
});
test('every scrim and backdrop that can lie over an opener closes by press', () => {
  for (const f of ['src/ui/shell/Menu.tsx', 'src/ui/menu/UMenu.tsx']) assert.match(readFileSync(f, 'utf8'), /um-scrim[^\n]*onPointerDown=\{\(\) => useShell\.getState\(\)\.closeByPress\(\)\}/, f);
  assert.match(readFileSync('src/ui/search/SearchSheet.tsx', 'utf8'), /pal-back[^\n]*closeByPress\(\)/);
});
