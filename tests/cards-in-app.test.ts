// The 2D cards live inside `.app` and the lifted 2D stylesheets reach them through it (`.app.dock-open .instrument-workspace { display: flex }` is the only rule that shows the Tests dock, found by the
// 19 Nov play-test: the card was in the shell root, outside .app, computed display: none, and showed blank). Every card that wears those sheets is mounted inside #app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the Tests dock is a child of .app (Shell.tsx), the Treat card and the action card go in through InApp', () => {
  const shell = read('src/ui/shell/Shell.tsx'), sheets = read('src/ui/shell/Sheets.tsx');
  const appOpen = shell.indexOf('id="app"'), appClose = shell.indexOf('</div>', shell.indexOf('<Dock '));
  const at = shell.indexOf('<TestsLayer />');
  assert.ok(appOpen > 0 && at > appOpen && at < appClose, 'TestsLayer sits inside the .app element');
  assert.match(sheets, /<InApp><TreatCard \/><\/InApp>/);
  assert.match(sheets, /<InApp><ActionCard \/><\/InApp>/);
  const inApp = read('src/ui/shell/InApp.tsx');
  assert.ok(inApp.includes("getElementById('app')") && inApp.includes('createPortal'));
});

test('the sheet that shows the dock is written with .app as its ancestor, which is why the dock must be in it', () => {
  const css = readdirSync(new URL('../src/ui/css2d', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => read(`src/ui/css2d/${f}`)).join('\n');
  assert.match(css, /\.app\.dock-open \.instrument-workspace \{ display: flex; \}/);
});

test('the Tests layer\'s own overrides name #app, so they reach the card only inside it', () => {
  const css = read('src/ui/tests/tests.css');
  assert.ok(css.includes('#app .t-pos > .t-card.instrument-workspace.float-ui'));
});
