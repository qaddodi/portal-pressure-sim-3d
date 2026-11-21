// Mohammad / visual review, 21 Nov 2026 (iPhone Pro Max, 430 x 932): the floating "© 2026 Mohammad Almeqdadi, MD" landed on card words (HVPG 9, Sites 4, Variceal 1).
// Root cause: on a phone the credit hunted for bare figure among rectangles measured while the cards were still sliding, fading and re-measuring, so it could be placed on words that moved after.
// Fix at the root, as 2D does on an iPhone (app-05 `.pz-cred`): the credit is one line in a foot row the words card reserves for it, the same place on every slide; the floating one stays away on a phone's talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barOf, credRow, CRED_ROW, planLayout, PILL_CORNER, BAR_H_PHONE } from '../src/ui/layout/plan.ts';

const S = (w: number, h: number, safe: [number, number, number, number]) => ({ vp: { w, h, safe: { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] } } });
const SCREENS = { 'iphone-portrait': S(393, 852, [59, 0, 34, 0]), 'iphone-pro-max': S(430, 932, [59, 0, 34, 0]), 'iphone-se': S(375, 667, [20, 0, 0, 0]), 'iphone-short': S(320, 568, [20, 0, 0, 0]), 'ipad-portrait': S(820, 1180, [24, 0, 20, 0]), mac: S(1440, 900, [0, 0, 0, 0]) };

test('a phone taller than 600 px reserves the credit row; every other screen reserves none', () => {
  for (const n of ['iphone-portrait', 'iphone-pro-max', 'iphone-se'] as const) assert.equal(credRow(SCREENS[n].vp), CRED_ROW, n);
  for (const n of ['iphone-short', 'ipad-portrait', 'mac'] as const) assert.equal(credRow(SCREENS[n].vp), 0, n);
});

test('the pill stands CRED_ROW higher in the card, so the credit row under it is clear of the pill and the words', () => {
  const vp = SCREENS['iphone-pro-max'].vp;
  const w = planLayout(vp, [{ id: 'teach', slot: 'words', h: 230 }]).cards.find((c) => c.slot === 'words')!.rect;
  const b = barOf(vp).rect;
  assert.equal(b.y + b.h, w.y + w.h - PILL_CORNER - CRED_ROW);
  assert.equal(b.h, BAR_H_PHONE);
  assert.ok(w.y + w.h - (b.y + b.h) >= CRED_ROW + PILL_CORNER, 'the row is under the pill');
});

test('the words card carries the credit line and the foot padding leaves its row; the floating credit yields to it', () => {
  const frame = readFileSync('src/ui/cards/CardFrame.tsx', 'utf8');
  assert.match(frame, /lay === 'stack' && !data && surface\.startsWith\('pz-shade'\) && <span className="pz-cred" aria-hidden="true">\{CREDIT\}<\/span>/);
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /@media \(min-height: 601px\) \{ \.deck-ui\[data-layout="stack"\] \.dk-card:not\(\[data-card="ladder"\]\) \.dk-in \{ padding-bottom: calc\(var\(--pad-y\) \+ 50px \+ 20px\)/);
  assert.equal(CRED_ROW, 20, 'the CSS says 20 px');
  const chrome = readFileSync('src/ui/shell/chrome-3d.css', 'utf8');
  assert.match(chrome, /\.deck-ui\[data-layout="stack"\] ~ \.sh-root\[data-mode="deck"\] \.stage-credit\.placed \{ opacity: 0; \}/);
  const two = readFileSync('src/ui/css2d/app-05-presenter-cards.css', 'utf8');
  assert.match(two, /@media \(min-height: 601px\) \{\s*\.pz-shade\.stack:not\(\.tab\) \.pz-cred \{ display: block; position: absolute;/, '2D\'s own row rule is the one in use');
});
