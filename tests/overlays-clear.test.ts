// Release review #11, #15, #18: transient notices stand clear of the side panel, ?perf is a capped strip, and the Treat sheet rests at its content's height.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { perfStrip } from '../src/ui/perf/report.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the toast is centred in the room left of the side panel and capped to it (a thumb layout has no panel)', () => {
  const css = read('src/ui/shell/shell.css');
  assert.match(css, /\.sh-toast \{[^}]*left: calc\(50% - var\(--panel-w, 360px\) \/ 2\)/);
  assert.match(css, /\.sh-toast \{[^}]*max-width: min\(420px, calc\(100vw - var\(--panel-w, 360px\) - 24px\)\)/);
  assert.match(css, /html\.thumb-ui \.sh-toast \{ left: 50%/);
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
