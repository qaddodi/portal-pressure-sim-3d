// The Tests card's Doppler pane as Mohammad picked it, mock Q (25 Nov 2026, docs/approved/doppler-card.md): the selection row without boxes, the figures as ruled rows, and no bar under Speed.
// Node only, no browser. (1) The pane is rendered, for real, by Vite's own transform and react-dom/server: the Tests card says the usual speed as a last row of the figures and has no gauge;
// a slide's data card keeps its gauge and has no such row. (2) The cascade resolver says doppler-card.css wins over the copied 2D rules on every property it sets, on a laptop, a phone and
// a tablet at the side. (3) The usual speed's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { loadRules, resolve, specificity } from '../scripts/css-cascade.mjs';
import { usualSpeed } from '../src/ui/tests/doppler/model.ts';

test('the usual speed is said in words: a range, or a floor where the range has no top', () => {
  assert.equal(usualSpeed({ n0: 15, n1: 40, open: false }), '15 to 40');
  assert.equal(usualSpeed({ n0: 30, n1: null as unknown as number, open: true }), '≥30');
  assert.equal(usualSpeed(null), '');
});

test('the Tests card has the usual-speed row and no gauge; a slide\'s card keeps its gauge and has no row', { timeout: 120_000 }, async () => {
  const live = React.useSyncExternalStore;
  (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = (sub, get) => live(sub, get, get);
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null } as never });
  try {
    const { DopplerPane } = await server.ssrLoadModule('/src/ui/tests/doppler/DopplerPane.tsx');
    const html = (slide: boolean) => renderToString(createElement(DopplerPane, { narrow: true, plot: 200, square: 200, slide }));
    const card = html(false), slide = html(true);
    const dl = (h: string) => h.slice(h.indexOf('<dl'), h.indexOf('</dl>'));
    assert.match(dl(card), /<div class="dop-usual"[^>]*><dt>Usual speed<\/dt><dd>[^<]*<\/dd><\/div>$/, 'the last row of the figures says the usual speed');
    assert.ok(!card.includes('dop-range'), 'no gauge on the Tests card');
    assert.ok(!slide.includes('dop-usual'), 'a slide\'s card has no such row');
  } finally { await server.close(); }
});

const rules = loadRules();
const FILE = 'ui/tests/doppler/doppler-card.css';
const CARD = ['section.t-card.dock.instrument-workspace.float-ui', 'div.dock-body', 'div.dock-pane', 'div.instrument-view.dop'];
const CONTEXTS: Record<string, string[]> = { laptop: ['html', 'div#app.app'], phone: ['html', 'div#app.app.thumb', 'div.t-pos'], 'at the side': ['html', 'div#app.app', 'div.t-pos'] };
const MAIN = [...CARD, 'div.dop-main', 'div.dop-report', 'dl.dop-stats'];
const val = (pre: string[], chain: string[], prop: string) => resolve(rules, [...pre, ...chain], [prop]) as Record<string, string | null>;
/** the strongest rule that is not doppler-card.css must not out-weigh the one rule of ours that sets the property (a longhand of ours covered by no shorthand of theirs, or the reverse) */
function weakerThanOurs(pre: string[], chain: string[], prop: string, ourProp = prop): string | null {
  const ours = rules.find((r) => r.file === FILE && r.decls.has(ourProp) && r.selector.includes('html:root #app'));
  if (!ours) return `no rule of ours sets ${ourProp}`;
  const o = resolve(rules, [...pre, ...chain], [prop]) as Record<string, string | null>;
  if (!o[prop + ':rule'] || o[prop + ':rule']!.startsWith(FILE)) return null;
  const theirs = rules.find((r) => `${r.file}: ${r.selector}` === o[prop + ':rule']);
  const a = specificity(ours.selector), b = specificity(theirs!.selector);
  return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))) ? null : `${prop}: ${o[prop + ':rule']} out-weighs ours`;
}

test('doppler-card.css decides every property it sets, on a laptop, a phone and a tablet at the side', () => {
  const HEAD = [...CARD, 'div.dop-head'];
  const sets: [string[], string[]][] = [
    [[...HEAD, 'select.select.dop-vessel'], ['background-color', 'border-color', 'padding', 'flex', 'width', 'min-width', 'max-width', 'font-size', 'font-weight', 'color', 'box-shadow']],
    [[...HEAD, 'div.dop-btns', 'div.dop-modes', 'button.dop-mode-opt'], ['color', 'transition']],
    [[...HEAD, 'div.dop-btns', 'div.dop-modes', 'button.dop-mode-opt[aria-pressed=true]'], ['color']],
    [[...HEAD, 'div.dop-btns', 'button.dop-tint.dop-sweep'], ['color']],
    [[...HEAD, 'div.dop-btns', 'button.dop-tint.dop-inv'], ['color']],
    [[...HEAD, 'div.dop-btns', 'button.dop-tint.dop-sweep', 'i.ic.ic-clock'], ['background-image', 'opacity']],
    [MAIN, ['display', 'grid-auto-flow', 'grid-template-columns', 'grid-template-rows', 'column-gap', 'row-gap', 'padding', 'border-top']],
    [[...MAIN, 'div'], ['display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'min-height', 'padding', 'border', 'border-top', 'border-radius', 'background']],
    [[...MAIN, 'div', 'dt'], ['font', 'color', 'text-transform', 'letter-spacing', 'white-space']],
    [[...MAIN, 'div', 'dd'], ['font', 'letter-spacing', 'white-space', 'text-align']],
    [[...MAIN, 'div', 'dd', 'small'], ['font-size', 'font-weight', 'color', 'margin-left']],
    [[...MAIN, 'div.dop-usual', 'dd'], ['font-size', 'font-weight', 'color']],
    [[...MAIN, 'div.on', 'dt'], ['color', 'font-weight']],
  ];
  const bad: string[] = [];
  for (const [ctx, pre] of Object.entries(CONTEXTS)) for (const [chain, props] of sets) for (const p of props) {
    const w = weakerThanOurs(pre, chain, p);
    if (w) bad.push(`${ctx} ${chain[chain.length - 1]}: ${w}`);
  }
  assert.deepEqual(bad, []);
});

test('a 2D longhand (a left border on each figure, its padding) cannot beat the shorthand that takes it off', () => {
  const bad: string[] = [];
  for (const [ctx, pre] of Object.entries(CONTEXTS)) {
    for (const p of ['border-left', 'border-right', 'border-bottom']) { const w = weakerThanOurs(pre, [...MAIN, 'div'], p, 'border'); if (w) bad.push(`${ctx}: ${w}`); }
    for (const p of ['padding-left', 'padding-right', 'padding-top', 'padding-bottom']) { const w = weakerThanOurs(pre, [...MAIN, 'div'], p, 'padding'); if (w) bad.push(`${ctx}: ${w}`); }
  }
  assert.deepEqual(bad, []);
});

test('the figures hold three rows of 24 px (two on a short window), so the card\'s height never depends on how many figures a vessel has', () => {
  const css = rules.filter((r) => r.file === FILE);
  const rows = css.filter((r) => r.decls.has('grid-template-rows')).map((r) => r.decls.get('grid-template-rows')!.value);
  assert.deepEqual(rows, ['repeat(3, 24px)', 'repeat(2, 24px)']);
});
