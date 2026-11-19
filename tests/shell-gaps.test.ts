// The shell gaps the audit found against the 2D app (docs/shell-gaps.md), one test each: the update offer is a toast with a Reload button, Shift C and ? in a talk do what 2D's keyboard.js does,
// the page has the 2D page's head and loading cover, the laser is in the talk, and the parity claims say what the code now does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { holdsAll, loadedAssets, offerReload, UPDATE_TOAST } from '../src/pwa/register.ts';
import { decideKey } from '../src/ui/keys/keymap.ts';
import { radius, HOLD_MS, VEIL } from '../src/ui/deck/laser.ts';
import { claims } from '../src/parity/b1.ts';
import { useShell } from '../src/ui/shell/store.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (f: string) => readFileSync(join(root, f), 'utf8');

test('an update is offered once, as a toast with a Reload button, and only to a page whose own files the new worker dropped', () => {
  assert.equal(holdsAll(['assets/a-1.js'], ['index.html', 'assets/a-1.js']), true, 'the new worker still holds this page\'s files: no news');
  assert.equal(holdsAll(['assets/a-1.js'], ['assets/a-2.js']), false);
  assert.equal(holdsAll([], ['assets/a-2.js']), false, 'a page that can name no file of its own is offered the reload');
  assert.equal(holdsAll(['assets/a-1.js'], null), false, 'a worker that does not answer: offer');
  const doc = { baseURI: 'https://x.test/portal-pressure-sim-3d/', querySelectorAll: () => [
    { getAttribute: (k: string) => (k === 'src' ? '/portal-pressure-sim-3d/assets/index-AB12.js' : null) },
    { getAttribute: (k: string) => (k === 'href' ? '/portal-pressure-sim-3d/assets/index-CD34.css' : null) },
    { getAttribute: (k: string) => (k === 'href' ? '/fonts/fonts.css' : null) },
  ] };
  assert.deepEqual(loadedAssets(doc as never), ['assets/index-AB12.js', 'assets/index-CD34.css']);
  useShell.setState({ mode: 'free' });
  const said: unknown[][] = [];
  offerReload((...a: unknown[]) => { said.push(a); }, () => { throw new Error('free play asks at once'); });
  assert.equal(said[0]![0], UPDATE_TOAST);
  assert.equal((said[0]![2] as { label: string }).label, 'Reload');
  // in a talk it waits and asks again once the talk is over
  useShell.setState({ mode: 'deck' });
  const later: (() => void)[] = [];
  const said2: unknown[][] = [];
  offerReload((...a: unknown[]) => { said2.push(a); }, (fn) => { later.push(fn); });
  assert.equal(said2.length, 0, 'not over a slide');
  useShell.setState({ mode: 'free' });
  later[0]!();
  assert.equal(said2.length, 1);
});

test('Shift C is the lens key too, ? in a talk opens the guide at While presenting, Esc in the sinusoid backs out to the lobule, and the zoom keys are the page\'s (2D keyboard.js)', () => {
  const ctx = { target: 'page' as const, searchOpen: false, sheetOpen: false, talk: false, keysOn: true };
  assert.deepEqual(decideKey({ key: 'C', code: 'KeyC', shiftKey: true }, ctx), { type: 'lens', dir: 1 });
  assert.equal(decideKey({ key: 'c', code: 'KeyC' }, ctx), null, 'plain C is nothing');
  const keys = src('src/ui/keys/useKeys.ts');
  assert.match(keys, /case 'help': openGuide\(sh\.mode === 'deck' \? 'present' : null\)/);
  assert.match(keys, /sh\.view === 'sinusoid'\) goToView\('lobule'\)/);
  assert.match(keys, /a\.type === 'zoom'/, 'a held + or - must not scroll the page behind');
  assert.equal(decideKey({ key: '?', code: 'Slash', shiftKey: true }, { ...ctx, talk: true })?.type, 'help', 'a talk keeps ? and /');
});

test('the page has the 2D page\'s head (description, share card, a theme colour per scheme) and its loading cover, with a plain message when a start fails', () => {
  const html = src('index.html');
  assert.match(html, /<meta name="description"/);
  assert.match(html, /property="og:title"/);
  assert.equal(html.split('name="theme-color"').length - 1, 2);
  assert.match(html, /prefers-color-scheme: dark\)">/);
  assert.match(html, /<div id="boot" role="status"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /ppsBootFail/);
  assert.match(html, /w\.ppsBootLift=lift/);
  assert.ok(html.indexOf('id="boot"') < html.indexOf('id="root"'));
  assert.ok(!/[\w.-]+@[\w-]+\.[a-z]{2,}/i.test(html), 'no email address in the page');
});

test('the laser is the 2D spotlight: R is min(W, H) x 0.09 between 50 and 100 px, a press of 500 ms on a touch screen, a 62% veil; L carries it out', () => {
  assert.equal(radius(390, 844), 50); assert.equal(radius(1440, 900), 81); assert.equal(radius(3000, 2000), 100);
  assert.equal(HOLD_MS, 500); assert.equal(VEIL, 0.62);
  assert.match(src('src/ui/deck/useDeckInput.ts'), /case 'laser': laser\.toggle\(\)/);
  const laser = src('src/ui/deck/laser.ts');
  assert.match(laser, /style\.transform/);
  assert.ok(!/\.style\.(left|top) =/.test(laser), 'only transform and opacity move per pointer event');
});

test('the parity claims say what the code does: Help pages, the shortcuts of a talk, Treat and Tests on the bars', () => {
  const by = new Map(claims.map((c) => [c.id, c.wired]));
  for (const id of ['help:About the model', 'help:References', 'help:Privacy', 'topbar:btnTreat', 'topbar:tabInstruments', 'bottombar:Treat', 'bottombar:Tests',
    'shortcut:While presenting/Number, then Enter', 'shortcut:While presenting/G', 'shortcut:While presenting/P', 'shortcut:While presenting/B or .', 'shortcut:While presenting/F', 'shortcut:While presenting/L',
    'shortcut:Run the model/J', 'shortcut:Change the view/I', 'shortcut:Change the view/T']) assert.equal(by.get(id), true, id);
});
