// The colour legend stands where the 2D app puts it: in the figure header, in the lens pill beside the Blood button, never over the figure or the foot
// (owner, 19 Nov: "the legend is in the wrong place"). Its sizes are the 2D styles' (copied: LABEL_STYLE.LEGEND).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LS } from '../src/scene/labels/type.ts';

const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8'), top = readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), css = readFileSync('src/ui/shell/shell.css', 'utf8');
const css2d = readFileSync('src/ui/styles/app-01-chrome.css', 'utf8');

test('the legend is in the top bar\'s lens pill and nowhere at the foot of the figure', () => {
  assert.ok(!/<Legend|<LensKey/.test(shell) && !/sh-key\b/.test(shell + css), 'no legend over the play bar');
  // the 2D markup: #legend inside .lens-btn (#btnLayers), built by LensKey from the lens model
  assert.match(top, /<LensKey \/>/);
  assert.ok(top.indexOf('className="lens-btn"') < top.indexOf('<LensKey'));
  assert.match(readFileSync('src/ui/shell/LensKey.tsx', 'utf8'), /id=("legend"|\{out \? undefined : 'legend'\})/);
});

test('its scale, bar, notches, numbers and caption breakpoint are the 2D app\'s (the copied 2D stylesheet itself)', () => {
  const L = LS.LEGEND;
  const rule = (sel: string) => { const i = css2d.indexOf('\n' + sel + ' {') + 1; assert.ok(i >= 1, `the 2D stylesheet has no ${sel}`); return css2d.slice(i, css2d.indexOf('}', i)); };
  const scale = rule('.lg-scale'), bar = rule('.lg-bar'), tick = rule('.lg-tick'), num = rule('.lg-num');
  assert.match(scale, new RegExp(`width: ${L.width}px; height: ${L.height}px`));
  assert.match(bar, new RegExp(`top: ${L.barTop}px; height: ${L.barHeight}px; border-radius: ${L.barRadius}px`));
  assert.match(tick, new RegExp(`top: ${L.tickTop}px;[^}]*height: ${L.tickHeight}px`));
  assert.match(num, new RegExp(`top: ${L.numTop}px;[^}]*font-weight: ${L.numWeight}`));
  assert.match(css2d, new RegExp(`@media \\(max-width: ${L.captionBelow}px\\) \\{ \\.legend \\.lg-cap`));
});
