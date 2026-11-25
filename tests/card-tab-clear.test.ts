// Plan 46 (3.3, reduced): the card's top padding always clears the name tab. Node only.
// Reduced from the plan's full calc() evaluator, on purpose: a phone's words card lets a short title stand level with the tab (`tab-beside`, presenter.js), which only the text's width can judge, so the
// words card on a phone/iPad is judged by the audit (`tab-over-title`) and not here. What is checkable from numbers and rules is judged here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutOf, padding, cardPad } from '../src/ui/layout/rules2d.ts';

const css = readFileSync('src/ui/styles/app-04-presenter.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const VIEWPORTS: [number, number][] = [[320, 568], [360, 640], [390, 844], [430, 932], [744, 1133], [820, 1180], [1024, 1366], [1180, 820], [1366, 1024], [1440, 900], [667, 375], [844, 390]];
const TS = [1, 1.15, 1.3];

test('a panel with a tab (.pz-panel.tabbed) keeps its top padding in terms of the tab\'s own height, in every layout', () => {
  const rules = [...css.matchAll(/(\.pz[^{}]*\.pz-panel\.tabbed)\s*\{([^{}]*)\}/g)];
  assert.ok(rules.length >= 2, `the tabbed panel's padding rules were found (${rules.length})`);
  for (const [, sel, body] of rules) {
    const pt = /padding-top:\s*([^;]+)/.exec(body!)?.[1];
    assert.ok(pt, `${sel} sets padding-top`);
    assert.match(pt!, /var\(--pz-tabh\)\s*\+\s*\d+px/, `${sel}: padding-top "${pt}" is the tab's height plus air, never a number of its own`);
  }
});

test('a floating words card (laptop, wide tablet): the padding and the half-tab of air under the strip hold the title below the tab, at every size and text size', () => {
  let judged = 0; const bad: string[] = [];
  for (const [w, h] of VIEWPORTS) {
    const lay = layoutOf(w, h);
    if (lay === 'stack' || lay === 'tab') continue;
    for (const ts of TS) {
      // wide: the tab is .72 of the card's padding (--pz-cp) and its words .56 of that, never under 12; short (`.low`): its words 12 at the text size (at most 18.2 to the card's width), the tab 1.6 times them
      const cw = Math.min(340, 0.42 * w + 28), cp = Math.round(padding(w, h, lay));
      const tabf = lay === 'short' ? Math.min(12 * ts, Math.max(12, (cw - 16) / 18.2)) : Math.max(12, cp * 0.72 * 0.56);
      const tabh = lay === 'short' ? tabf * 1.6 : cp * 0.72, inset = cardPad(w, h).y + tabh * 0.5;
      judged++;
      if (!(tabf <= tabh)) bad.push(`${lay} ${w}x${h} ts ${ts}: the tab's words (${tabf.toFixed(1)}) are taller than the tab (${tabh.toFixed(1)})`);
      if (!(inset >= tabh)) bad.push(`${lay} ${w}x${h} ts ${ts}: the title's inset ${inset.toFixed(1)} is under the tab ${tabh.toFixed(1)}`);
    }
  }
  assert.ok(judged >= 6, `judged ${judged} rows`);
  assert.deepEqual(bad, []);
});

test('the tab is placed once, by the card: absolute, top 0, right 0, in the card\'s own corner', () => {
  const tab = /\.pz-tabname\s*\{([^{}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(tab, /position:\s*absolute/); assert.match(tab, /top:\s*0\b/); assert.match(tab, /right:\s*0\b/);
});
