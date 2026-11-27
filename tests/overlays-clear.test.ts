// Release review #11, #15, #18: transient notices stand on the dock's axis, ?perf is a capped strip, and the Treat sheet rests at its content's height.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { perfStrip } from '../src/ui/perf/report.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every note that stands over the dock is centred on the dock\'s own axis (left: 50%) on every device, capped to the page, never offset by the side panel', () => {
  const css = read('src/ui/shell/shell.css'), dock = read('src/ui/styles/app-07-floating.css');
  assert.match(dock, /\.vdock \{\s*position: absolute; z-index: var\(--z-hud\); left: 50%; transform: translateX\(-50%\)/, 'the dock and its view pill are centred on the page');
  for (const sel of ['.sh-toast', '.sh-glnote']) {
    const rule = new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
    assert.ok(rule, `${sel} has its base rule`);
    assert.match(rule, /left: 50%/, `${sel} stands on the page centre line`);
    assert.doesNotMatch(rule, /--panel-w|--fs-foot|--fig-/, `${sel} is not offset by a side panel or a figure room`);
    assert.match(rule, /(?:width|max-width): (?:min\(\d+px, calc\(100vw - \d+px\)\)|max-content)|max-width: min\(calc\(100vw - \d+px\), \d+px\)/, `${sel} has a sensible max width of the page`);
  }
  // no later rule (a media query, a thumb-only override) moves the note off the axis again
  assert.doesNotMatch(css, /\.sh-toast\s*\{[^}]*left: calc\(/, 'no .sh-toast rule shifts left');
  assert.doesNotMatch(css, /\.sh-toast[^{]*\{[^}]*--panel-w/, 'no .sh-toast rule reads the side panel');
});


test('?perf is a one-line safe-area strip with a capped detail view and Hide', () => {
  const src = read('src/ui/perf/mount.ts');
  assert.match(src, /safe-area-inset-top/);
  assert.match(src, /max-height:min\(40vh,320px\)/);
  assert.match(src, /mk\('Hide'/);
  assert.match(src, /mk\('Detail'/);
  assert.equal(perfStrip('title\nframes drawn 9 · x\nmore'), 'frames drawn 9 · x');
});

import { sheetPlace } from '../src/ui/treat/sheet-place.ts';
import { roomWith } from '../src/ui/tests/place.ts';

test('the Treat sheet rests at its content height: only the Changes page sets a height, and the camera room is cut at the sheet\'s top', () => {
  const css = read('src/ui/treat/treat.css');
  const heights = css.split('\n').filter((l) => /(^|[\s;{])height:/.test(l) && !/max-height|min-height/.test(l));
  assert.equal(heights.length, 1);
  assert.match(heights[0]!, /\[data-page\]/);
  const vp = { w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } } as never;
  const short = sheetPlace(vp, 120, 220), tall = sheetPlace(vp, 120, 500);
  assert.equal(short.rect.y + short.rect.h + 34 + 120, 844);
  assert.ok(short.rect.y > tall.rect.y);   // a shorter sheet leaves the figure more room
  const room = { x: 0, y: 56, w: 390, h: 600 };
  assert.ok(roomWith(room, short).h > roomWith(room, tall).h);
});
