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
  // every menu is the one shell (surface/Menu.tsx): its sheet's scrim closes by press, and a shell menu's press-close is closeByPress (a slide list's is its own close)
  const shell = readFileSync('src/ui/surface/Menu.tsx', 'utf8');
  assert.match(shell, /um-scrim[^\n]*onPointerDown=\{pressClose\}/);
  assert.match(shell, /const pressClose = state \? state\.close : \(\) => useShell\.getState\(\)\.closeByPress\(\);/);
  assert.match(readFileSync('src/ui/menu/UMenu.tsx', 'utf8'), /<Menu id="menu" ctl=\{ctl\}/, 'the main menu is drawn by the shell, scrim and all');
  // (a dialog's scrim is the dialog shell's: a press outside the top dialog cancels it from a capture listener, dialog-stack.ts dialogPress; Search and the Guide, which open from
  // a tab or a button like the sheets, cancel a press by closeByPress)
  assert.match(readFileSync('src/ui/surface/dialog-stack.ts', 'utf8'), /top\.cancel\('press'\)/);
  for (const f of ['src/ui/search/SearchSheet.tsx', 'src/ui/shell/HelpSheets.tsx']) {
    assert.match(readFileSync(f, 'utf8'), /const cancel = \(by: CancelBy\) => \{ if \(by === 'press'\) useShell\.getState\(\)\.closeByPress\(\);/, f);
  }
});

// 23 Nov, iPad upright: the first fix did not hold because the outside-press listener (window, capture) runs BEFORE the scrim's own handler and closed the sheet with a plain close(), so nothing was recorded.
test('the outside-press listener and the scrim both close by press, in either order', () => {
  s().close(); s().toggle('settings');
  s().closeByPress();   // useOutside's capture listener (first)
  s().closeByPress();   // the scrim's handler (second): a no-op that must not forget the first
  s().toggle('settings'); assert.equal(s().sheet, null);
  // the one outside-press rule listens on the window in the capture phase, and both the shell sheets' hook and the menu shell close through closeByPress with it
  assert.match(readFileSync('src/ui/surface/outside.ts', 'utf8'), /l\.onPress\(\);\n\s*\};\n\s*window\.addEventListener\('pointerdown', away, true\)/);
  assert.match(readFileSync('src/ui/shell/Pop.tsx', 'utf8'), /useOutsidePress\(open, \[ref\], \(\) => useShell\.getState\(\)\.closeByPress\(\), `\[data-opens="\$\{sheet\}"\]`\)/);
  assert.match(readFileSync('src/ui/surface/Menu.tsx', 'utf8'), /useOutsidePress\(open, \[ref\], pressClose, `\[data-opens="\$\{id\}"\]`\)/);
});

// 23 Nov, iPad upright: swiping the patient menu down did not close it. Root cause: UMenu is in the page only while shown, so its element did not exist when useSheetSwipe ran once at mount, and the swipe was never wired.
test('useSheetSwipe wires the element it finds after every render, not once at mount', () => {
  const hook = readFileSync('src/ui/shell/use-sheet-swipe.ts', 'utf8');
  assert.doesNotMatch(hook, /\}, \[ref, on, prop\]\);/);
  assert.match(hook, /w\.el === el/);
  assert.match(hook, /attachSheetSwipe\(el,/);
});
