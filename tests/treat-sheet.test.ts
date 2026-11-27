// The Treat sheet is the 2D app's (treat-page.js, dock-sheet.js, card-glide.js, seg-glide.js, chart.js): its height at Half, the glide of the card's height, the tab glide, the Changes memory, the page's slide, and its markup class for class.
// Pure parts run here without a browser; the markup is read as text (a .tsx cannot load in node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { sheetHeight, SIZES, THUMB, TABLET } from '../src/ui/treat/sheet-height.copied.ts';
import { glideFrames, cutFrames, rideFrames } from '../src/ui/treat/card-glide.copied.ts';
import { readOpen, writeOpen, startsOpen, toggled, KEPT_KEY } from '../src/ui/treat/keep.ts';
import { slideMs, PAGE_AWAY } from '../src/ui/surface/page-push.ts';
import { pinned2D } from './two-d-pin.ts';

const mem = (init?: string) => { const m = new Map<string, string>(); if (init != null) m.set(KEPT_KEY, init); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

test('the stops are the 2D app\'s: every screen, a phone over the thumb dock, an upright tablet', () => {
  assert.deepEqual(SIZES, [0.32, 0.56, 0.9]);
  assert.deepEqual(THUMB, [0.62, 1]);
  assert.deepEqual(TABLET, [0.45, 0.62]);
});

test('sheetHeight: Half is as tall as the words need up to Full, Full while the Changes page stands (2D sheetHeight)', () => {
  const base = { size: 0, half: 0, stops: THUMB, room: 700, area: 700 };
  assert.equal(sheetHeight({ ...base, need: 200 }), '200px', 'words shorter than Half: the sheet is only as tall as its words');
  assert.equal(sheetHeight({ ...base, need: 500 }), '500px', 'words taller than Half: it grows to its words');
  assert.equal(sheetHeight({ ...base, need: 900 }), '700px', 'and no further than Full');
  assert.equal(sheetHeight({ ...base, need: Infinity }), `${Math.round(0.62 * 700)}px`, 'words not asked: the stop');
  assert.equal(sheetHeight({ ...base, need: 100, page: true }), '700px', 'a page is open: Full');
  assert.equal(sheetHeight({ size: 0, half: 0, stops: SIZES, room: 0, area: 800, need: Infinity }), '32%');
  assert.equal(sheetHeight({ size: 0, half: 0, stops: SIZES, room: 0, area: 800, need: Infinity, page: true }), '90%');
});

test('the card-height glide: the plate scales from the old height, a card on its foot rides its words, parts below the change ride and parts opening are cut (2D card-glide.js)', () => {
  const up = glideFrames(300, 400, false), foot = glideFrames(300, 400, true);
  assert.equal(up.origin, '50% 0');
  assert.equal(up.words, null);
  assert.deepEqual(up.plate, [{ transform: 'scaleY(0.7500)' }, { transform: 'none' }]);
  assert.equal(foot.origin, '50% 100%');
  assert.deepEqual(foot.words, [{ transform: 'translateY(100.0px)' }, { transform: 'none' }]);
  assert.deepEqual(rideFrames(300, 400), [{ transform: 'translateY(-100.0px)' }, { transform: 'none' }]);
  assert.deepEqual(cutFrames(300, 400), [{ clipPath: 'inset(-6px -6px 94.0px -6px)' }, { clipPath: 'inset(-6px)' }]);
});

test('Changes is remembered: it starts closed, stays open after a visit, a damaged value starts closed, Advanced physiology is the other way round (2D pps.chartOpen3)', () => {
  const s = mem();
  assert.equal(startsOpen('changes', readOpen(s)), false, 'starts closed');
  const set = readOpen(s);
  toggled('changes', true, set); writeOpen(set, s);
  assert.equal(s.getItem(KEPT_KEY), '["changes"]');
  assert.equal(startsOpen('changes', readOpen(s)), true, 'open again the next time');
  toggled('changes', false, set); writeOpen(set, s);
  assert.equal(startsOpen('changes', readOpen(s)), false);
  for (const bad of ['not json', '{"a":1}', '[1,2]', 'null']) assert.equal(startsOpen('changes', readOpen(mem(bad))), false, `damaged: ${bad}`);
  assert.equal(startsOpen('adv-x', new Set()), true, 'the Advanced sections start open');
  assert.equal(startsOpen('adv-x', new Set(['adv-x'])), false, 'and the saved set holds the ones shut');
  assert.equal(startsOpen('changes', readOpen(null)), false, 'no storage: closed, no throw');
});

test('the Changes page slides for as long as the distance asks, the rest of the sheet stands back (2D page-push.js)', () => {
  assert.equal(slideMs(390, 390), 240);
  assert.equal(slideMs(0, 390), 120);
  assert.equal(slideMs(-195, 390), 180);
  assert.equal(PAGE_AWAY, 0.3);
});

test('the sheet is 2D\'s markup, class for class, glued to the 2D stylesheets and the one clock', () => {
  // (the head and the tab strip are the one panel head's, surface/PanelHead.tsx and Tabs.tsx: their classes are the 2D card's still)
  const card = readFileSync('src/ui/treat/TreatCard.tsx', 'utf8');
  assert.match(card, /<PanelHead className="tc-head"/, 'Treat\'s head is the one panel head');
  assert.match(card, /variant: 'text', className: 'treat-tabs'/, 'its tabs are the one strip, text variant');
  const src = [card, readFileSync('src/ui/surface/PanelHead.tsx', 'utf8'), readFileSync('src/ui/surface/Tabs.tsx', 'utf8')].join('\n');
  const baseCss = readdirSync('src/ui/styles').filter((n) => n.endsWith('.css')).map((n) => readFileSync(`src/ui/styles/${n}`, 'utf8')).join('\n');
  assert.ok(baseCss.length > 1000, 'the 2D stylesheets are there');
  for (const c of ['treat-card', 'tr-card', 'has-plate', 'sheet-plate', 'tr-in', 'tc-head', 'card-head', 'card-title', 'card-meta', 'card-close', 'instr-tabs', 'treat-tabs', 'instr-tab', 'tt-l', 'tt-n',
    'tc-body', 'treat-pane', 'order-chips', 'order-chip', 'oc-t', 'oc-dot', 'order-grid', 'order-btn', 'fluid-btn', 'ob-t', 'ob-on', 'section', 'chart-sec', 'tc-page', 'tcp-head', 'tcp-back', 'tcp-title', 'tcp-body', 'tcp-row', 'tp-off', 'tp-gone']) {
    assert.ok(src.includes(c), `Treat's card (or its panel head) uses .${c}`);
    if (!['has-plate', 'tr-in', 'oc-t', 'oc-dot', 'ob-t', 'ob-on', 'tt-l', 'tt-n', 'tp-off', 'tp-gone', 'fluid-btn'].includes(c)) assert.ok(baseCss.includes(`.${c}`) || readFileSync('src/ui/treat/treat.css', 'utf8').includes(`.${c}`), `.${c} is styled`);
  }
  for (const t of ['glideHeight', 'startSegGlideOn', 'pushPage', 'remember', 'sheetHeight']) assert.ok(card.includes(t), `TreatCard.tsx: ${t}`);
  assert.ok(!/requestAnimationFrame/.test(src), 'one clock');
  assert.match(readFileSync('src/ui/glass.css', 'utf8'), /\.tr-card > \.sheet-plate/, 'the glass is on the plate');
});

test('the copies are the 2D app\'s at the pin (skipped against any other checkout)', (t) => {
  const two = pinned2D('src/ui/dock-sheet.js');
  if (two.skip) return t.skip(two.skip);
  execFileSync('node', ['scripts/copy-treat-sheet.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});
