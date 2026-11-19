// The colour legend stands where the 2D app puts it: in the figure header, in the lens pill beside the Blood button, never over the figure or the foot
// (owner, 19 Nov: "the legend is in the wrong place"). Its sizes are the 2D styles' (copied: LABEL_STYLE.LEGEND).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LS } from '../src/scene/labels/type.ts';

const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8'), top = readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), css = readFileSync('src/ui/shell/shell.css', 'utf8');

test('the legend is in the top bar\'s lens pill and nowhere at the foot of the figure', () => {
  assert.ok(!/<Legend/.test(shell) && !/sh-key\b/.test(shell + css), 'no legend over the play bar');
  assert.match(top, /<Legend variant="bar"/);
});

test('its scale, bar, notches, numbers and caption breakpoint are the 2D app\'s', () => {
  const L = LS.LEGEND;
  const rule = (sel: string) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, `shell.css has no ${sel}`); return css.slice(i, css.indexOf('}', i)); };
  const scale = rule('.sh-lens .lg-bar-wrap'), bar = rule('.sh-lens .lg-bar'), tick = rule('.sh-lens .lg-tick');
  assert.match(scale, new RegExp(`width: ${L.width}px; height: ${L.height}px`));
  assert.match(bar, new RegExp(`top: ${L.barTop}px; height: ${L.barHeight}px; border-radius: ${L.barRadius}px`));
  assert.match(tick, new RegExp(`top: ${L.tickTop}px;[^}]*height: ${L.tickHeight}px`));
  assert.match(css, new RegExp(`\\.sh-lens \\.lg-nums span[^{]*\\{ top: ${L.numTop}px;[^}]*font-weight: ${L.numWeight}`));
  assert.match(css, new RegExp(`@media \\(max-width: ${L.captionBelow}px\\)`));
});
