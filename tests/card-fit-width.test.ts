import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { summaryHeight } from '../src/ui/charts/plane/model.ts';
import { panelType, chartType } from '../src/ui/charts/type.ts';
import { fitOf } from '../src/ui/charts/fit.ts';
import { planLayout, pzhOf, centredBox } from '../src/ui/layout/plan.ts';

// Mohammad, 20 Nov (Mac, deck slide 9 and 10): "this slide card is insanely huge, the text is small, it needs to be centred and fit the display"; "the instrument card is width smaller wtf".
// Three roots, each in the one shared place: (1) a chart in a zoomed (fit) card measured its box in screen pixels; (2) a summary plot was as tall as its card was wide, where 2D's is the window's
// height; (3) a chart's type was a fixed 13 px, not the screen's own caption size; (4) lifted 2D width rules (with :has) beat the planner's width on the data card.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mac = { w: 1739, h: 1171, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const laptop = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };

test('a summary plot on a wide screen is 2D\'s height of the window (44 pzh, at least 240; compact 34 pzh, at least 200), never its width\'s', () => {
  assert.equal(summaryHeight({} as never, 'wide', pzhOf(mac)), Math.round(44 * 11.71));
  assert.equal(summaryHeight({ compact: true } as never, 'wide', pzhOf(mac)), Math.round(34 * 11.71));
  assert.equal(summaryHeight({} as never, 'short', 5), 240, 'a low window still gets the 240 px floor');
  assert.equal(summaryHeight({ compact: true } as never, 'short', 5), 200);
  assert.equal(summaryHeight({} as never, 'stack', 8.5), undefined, 'a phone keeps the stacked aspect');
  assert.equal(summaryHeight({} as never, 'tab', 11), undefined);
  // the plot no longer grows with the card: it is the same at any panel width
  const panelW = centredBox(mac, 'panel', 'plane').w;
  assert.ok(summaryHeight({} as never, 'wide', pzhOf(mac))! < panelW / 2, 'wide and low, not 1.15 : 1');
  assert.match(read('src/ui/charts/plane/PlaneCard.tsx'), /summaryHeight\(pl, layoutOf\(vp\.w, vp\.h\), pzhOf\(vp\)\)/);
});

test('a chart in a full-screen panel draws in the screen\'s own caption size (2D --s-cap), a phone keeps its own, never under the floor', () => {
  const base = chartType('desktop');
  assert.ok(base.sm < 14, 'the representative screen\'s data text, about 13 px');
  assert.ok(panelType(mac.w, mac.h, base).sm >= 20, 'a 1170 px high Mac: 20 px, not 13.6');
  assert.equal(panelType(laptop.w, laptop.h, base).sm, 15.6, 'a 900 px high laptop: 1.733 pzh');
  assert.equal(panelType(phone.w, phone.h, chartType('phone-portrait')).sm, chartType('phone-portrait').sm);
  for (const [w, h] of [[1280, 800], [1024, 768], [844, 390], [2560, 1440]]) assert.ok(panelType(w, h, base).sm >= base.sm, `${w}x${h} never under the base`);
  const chart = read('src/ui/charts/Chart.tsx');
  assert.match(chart, /closest\('\.pz-panel'\)/); assert.match(chart, /panelType\(vp\.w, vp\.h, chartType\(device\)\)/);
});

test('a chart measures its box in its own pixels: the card\'s fit zoom is divided out', () => {
  const doc = { body: {} };
  const el = (z: string, parent: unknown = null) => ({ z, parentElement: parent, ownerDocument: doc });
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = (a: { z: string }) => ({ getPropertyValue: () => a.z });
  const card = el('0.65', el('1', doc.body)), host = el('1', card);
  assert.equal(fitOf(host as never), 0.65);
  assert.equal(fitOf(el('1', el('normal')) as never), 1);
  assert.ok(Math.abs(fitOf(el('0.5', el('0.5')) as never) - 0.25) < 1e-9, 'nested zooms multiply');
  assert.match(read('src/ui/charts/Chart.tsx'), /const z = fitOf\(el\); setW\(ownWidth\(el, z\)\)/, 'the box is measured in the chart\'s own pixels: width divided by the fit zoom (and the card zoom: ownWidth, fit.ts)');
  assert.doesNotMatch(read('src/ui/charts/Chart.tsx'), /setW\(Math\.round\(el\.getBoundingClientRect\(\)\.width\)\)/);
});

test('the data card is the words card\'s width on every slide: the planner places one width, and no lifted 2D width rule can take it back', () => {
  for (const vp of [mac, laptop]) {
    const p = planLayout(vp, [{ id: 'teach', slot: 'words', h: 300 }, { id: 'ladder', slot: 'data', h: 300 }]);
    assert.equal(p.cards.length, 2);
    assert.equal(p.cards[0]!.rect.w, p.cards[1]!.rect.w, `${vp.w}x${vp.h}: one width for the pair`);
  }
  // every lifted rule that sizes a data or words card's own box
  const dir = new URL('../src/ui/css2d/', import.meta.url);
  const sizing: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/(^|\})\s*([^{}@]*\.pz-data[^{}]*)\{([^}]*)\}/g)) {
      const sel = m[2]!.trim(), body = m[3]!;
      if (/(^|[;\s])(max-)?width\s*:/.test(body) && /\.pz-data(\.[\w-]+|:[\w-]+\([^)]*\))*\s*$/.test(sel.split(',').pop()!.trim())) sizing.push(`${f}: ${sel}`);
    }
  }
  assert.ok(sizing.length >= 3, 'the lifted CSS sizes data cards by their instrument (has-tool, curve, flowtime): ' + sizing.length);
  const css = read('src/ui/deck-ui.css');
  assert.match(css, /\.deck-ui\.pz \.dk-card\[data-card\]:is\(\.pz-shade, \.pz-data\) \{ width: auto !important; min-width: 0 !important; max-width: none !important; \}/);
});
