// 21 Nov (owner: "wtf is this rounded rectangle at the bottom"): the presenter's bar carries the pill only. The talk's title never stands beside it, on any screen.
import { merged2d } from './merged-2d.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barOf } from '../src/ui/layout/plan.ts';
const safe = { top: 0, right: 0, bottom: 0, left: 0 };
const VPS = [[1440, 900], [1920, 1080], [820, 1180], [390, 844], [844, 390]].map(([w, h]) => ({ w, h, safe }) as never);

test('no talk title bar: not in the markup, the styles, the fade-out or the bar placement', () => {
  for (const p of ['src/ui/deck/PresenterBar.tsx', 'src/ui/deck-ui.css', 'src/ui/shell/talk.ts', 'src/ui/layout/plan.ts']) assert.ok(!/dk-bar-title/.test(readFileSync(p, 'utf8')), p);
  for (const s of VPS) assert.ok(!('title' in barOf(s)));
});

test('no beat strokes under the slide count', () => {
  for (const p of ['src/ui/deck/PresenterBar.tsx', 'src/ui/deck-ui.css', 'src/ui/css2d-3d.css']) assert.ok(!/pzb-pips/.test(readFileSync(p, 'utf8')), p);
});
