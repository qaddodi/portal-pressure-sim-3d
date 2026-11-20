import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout, centredBox, centredKind, pzhOf, type Need } from '../src/ui/layout/plan.ts';
import { viewAt } from '../src/ui/deck/presenter-machine.ts';
import { maxPages } from '../src/ui/cards/pages.ts';

// Mohammad, 20 Nov: "the objectives should cover the entire screen card just like 2D; the case card should be a big centered card, not on the left (also on phone)".
// 2D draws the outline and the quick check as `.pz-panel` (centred, up to 1560 px wide, the page veiled behind) and a case as `.pz-case` (centred, 920 px at most).
const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const ipad = { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } };
const mac = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const side = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
const need = (id: Need['id'], h: number): Need[] => [{ id, slot: 'words', h }];
const centred = (r: { x: number; y: number; w: number; h: number }, vp: { w: number; h: number }) => Math.abs(r.x + r.w / 2 - vp.w / 2) <= 1;

test('which cards stand alone: the outline, the quick check and a case', () => {
  assert.equal(centredKind('title'), 'panel'); assert.equal(centredKind('check'), 'panel'); assert.equal(centredKind('case'), 'case');
  assert.equal(centredKind('teach'), null); assert.equal(centredKind('ladder'), null); assert.equal(centredKind('table'), null);
});

test('the outline is 2D\'s panel: on a Mac its reading width (50 body sizes, 82% at most), on a phone the width less 16 px, centred, the screen\'s room', () => {
  const B = Math.min(28, Math.max(17, 2.311 * 9));   // 2D --pz-b on a 900 px high window
  assert.equal(centredBox(mac, 'panel', 'outline').w, Math.round(Math.min(50 * B, 0.82 * 1440)));
  assert.equal(centredBox(mac, 'panel', 'check').w, Math.round(Math.min(42 * B, 0.82 * 1440)));
  assert.equal(centredBox(mac, 'panel', 'table').w, Math.round(Math.min(54 * B, 0.82 * 1440)));
  assert.equal(centredBox(mac, 'panel', 'plane').w, Math.round(Math.min(48 * B, 0.74 * 1440)));
  assert.equal(centredBox(mac, 'panel', 'walls').w, Math.round(Math.min(54 * B, 0.82 * 1440)), 'any other chart takes the table\'s width');
  assert.equal(centredBox(mac, 'panel').maxH, Math.round(900 - 2 * Math.min(56, Math.max(16, 4 * 9))));
  const p = planLayout(mac, need('title', 600));
  assert.equal(p.cards.length, 1); assert.equal(p.strip, null);
  assert.ok(centred(p.cards[0]!.rect, mac) && Math.abs(p.cards[0]!.rect.y + p.cards[0]!.rect.h / 2 - 450) <= 1, 'centred both ways');
  assert.equal(centredBox(side, 'panel', 'outline').w, Math.round(Math.min(1560, 852 - 2 * Math.max(Math.min(64, Math.max(16, 0.03 * 852)), 59))), 'a phone on its side keeps the whole width (2D .pz.low)');
  const ph = centredBox(phone, 'panel');
  assert.equal(ph.w, 393 - 16); assert.equal(ph.maxH, 852 - 72 - 34);
  const q = planLayout(phone, need('title', 500)).cards[0]!.rect;
  assert.equal(q.x, 8); assert.equal(q.w, 377); assert.equal(q.y, Math.round(8 + (ph.maxH - 500) / 2), 'centred between 8 px from the top and the pill\'s foot');
  assert.equal(centredBox(ipad, 'panel').w, Math.round(0.7 * 820), 'an upright iPad\'s is 70% wide');
});

test('a summary table or a chart slide is one centred panel (2D visual): no words card, no data card, the table\'s own width', () => {
  assert.equal(centredKind('visual'), 'panel');
  const slide = { id: 's', kicker: '', title: 'T', line: '', visual: 'table', table: { rows: [] } } as never;
  const v = viewAt([{ kind: 'slide', slide } as never], { stop: 0, beat: 0 } as never);
  assert.equal(v.words, 'visual'); assert.equal(v.data, null);
  const p = planLayout(mac, [{ id: 'visual', slot: 'words', visual: 'plane', h: 500 }]);
  assert.equal(p.cards.length, 1); assert.equal(p.cards[0]!.rect.w, centredBox(mac, 'panel', 'plane').w);
  const t = readFileSync(new URL('../src/ui/cards/VisualCard.tsx', import.meta.url), 'utf8');
  assert.match(t, /TeachingCard panel/); assert.match(t, /TableCard/); assert.match(t, /ToolCard/);
});

test('the case is 2D\'s big centred card: 920 px at most (the width less 32 px on a phone), 70% on an upright iPad, centred both ways, never left', () => {
  assert.equal(centredBox(mac, 'case').w, 920);
  assert.equal(centredBox(phone, 'case').w, 393 - 32);
  assert.equal(centredBox(ipad, 'case').w, Math.round(0.7 * 820));
  for (const vp of [mac, phone, ipad, side]) {
    const r = planLayout(vp, need('case', 300)).cards[0]!.rect;
    assert.ok(centred(r, vp), `${vp.w}x${vp.h} centred across`);
    assert.ok(Math.abs(r.y + r.h / 2 - vp.h / 2) <= 1, `${vp.w}x${vp.h} centred down`);
  }
  assert.equal(centredBox(mac, 'case').maxH, Math.round(900 - 2 * Math.max(84, 0.11 * 900)));
});

test('a card taller than its room asks to split (the outline); the case never splits, its words ease down instead', () => {
  const tall = planLayout(phone, need('title', 2000));
  assert.deepEqual(tall.overflow, ['title']); assert.ok(tall.cards[0]!.rect.h <= tall.maxH.words);
  assert.equal(maxPages('case', 'One. Two. Three.'), 1);
  assert.equal(maxPages('title', undefined), 2);
  assert.deepEqual(planLayout(mac, need('title', 400)).overflow, []);
});

test('the figure is framed whole behind them (nothing of the card is a blocker), and the other cards still take their usual places', () => {
  const p = planLayout(mac, need('title', 600));
  assert.ok(p.free.w >= mac.w - 1 && p.free.h >= mac.h - 1);
  const t = planLayout(mac, [{ id: 'teach', slot: 'words', h: 300 }, { id: 'ladder', slot: 'data', h: 200 }]);
  assert.equal(t.cards.length, 2); assert.ok(t.cards[0]!.rect.x < 100, 'a teaching card stays at the left');
  assert.equal(pzhOf({ w: 800, h: 1200, safe: phone.safe }), Math.min(12, 6), '2D\'s --pzh on a portrait tablet');
});

test('behind a case card the camera keeps the slide\'s own framing (one shot, no back-out; owner 20 Nov) and the figure dips to 22%; a long outline zooms its contents down to fit (never under 12 px) before it splits', () => {
  const slide = { id: 'c', kicker: '', title: 'T', line: 'L.', shot: 'liver', vignette: 'A patient.' } as never;
  const stops = [{ kind: 'slide', slide } as never];
  assert.equal(viewAt(stops, { stop: 0, beat: 0 } as never).words, 'case');
  assert.equal(viewAt(stops, { stop: 0, beat: 0 } as never).shot, viewAt(stops, { stop: 0, beat: 1 } as never).shot, 'the case card and the lifted card share one framing: no second move');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /' on dip'/);
  assert.match(readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8'), /\.pz-veil\.dip \{ opacity: 0\.85/);
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /--pz-fit/); assert.match(frame, /12 \/ lb/);
});

test('the card layer dresses them in 2D\'s own surfaces and veils the page behind the outline and the quick check', () => {
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /pz-panel/); assert.match(frame, /pz-case on/); assert.match(frame, /data-visual=\{entry\.id === 'title' \? 'outline'/);
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /pz-veil/); assert.match(layer, /view\.words === 'title' \|\| view\.words === 'check'/);
  assert.match(layer, /onTap=\{e\.id === 'case'/, 'a tap on the case card goes on, as in 2D');
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.dk-card\.pz-panel, \.deck-ui\.pz \.dk-card\.pz-case \{ position: relative/);
});

test('the measures are 2D\'s CSS (the lifted copy): the panel, the stacked panel, the case', () => {
  // (the numbers are read from the lifted copy of 2D's CSS, which scripts/copy-2d-css.mjs keeps equal to the pin)
  const lifted = readFileSync(new URL('../src/ui/css2d/app-04-presenter.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/css2d/app-05-presenter-cards.css', import.meta.url), 'utf8');
  assert.match(lifted, /\.pz-panel \{[^}]*width: min\(1560px, calc\(100% - 2 \* max\(clamp\(16px, 3vw, 64px\)/);
  assert.match(lifted, /\.pz-panel \{[^}]*max-height: calc\(100% - 2 \* clamp\(16px, calc\(4 \* var\(--pzh\)\), 56px\)\)/);
  assert.match(lifted, /\.pz\.stack \.pz-panel \{ top: 8px; bottom: calc\(64px \+ var\(--pz-sb\)\); height: fit-content; margin-block: auto; translate: -50% 0; width: calc\(100% - 16px\); max-height: calc\(100% - 72px - var\(--pz-sb\)\)/);
  assert.match(lifted, /\.pz\.stack\.tab \.pz-panel \{ width: 70%; \}/);
  assert.match(lifted, /\.pz-case \{[^}]*width: min\(calc\(100% - 32px - 2 \* max\(env\(safe-area-inset-left, 0px\), env\(safe-area-inset-right, 0px\)\)\), 920px\)[^}]*max-height: calc\(100% - 2 \* max\(84px, 11vh\)\)/);
  assert.match(lifted, /\.pz\.stack\.tab \.pz-case \{ width: 70%; \}/);
});

test('the six ladders are 2D\'s `.pz-panel.fill`: the screen\'s width, not a reading width', () => {
  const full = centredBox(mac, 'panel', 'ladders').w, table = centredBox(mac, 'panel', 'table').w;
  assert.ok(full > table, 'wider than a table');
  assert.equal(full, Math.round(Math.min(1560, 1440 - 2 * Math.max(Math.min(64, Math.max(16, 0.03 * 1440)), 0))));
  assert.match(readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8'), /visual === 'ladders' \? 'fill'/);
});
