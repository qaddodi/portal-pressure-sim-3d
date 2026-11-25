// Mohammad / visual review, 21 Nov 2026 (iPhone Pro Max, 430 x 932): the floating "© 2026 Mohammad Almeqdadi, MD" landed on card words (HVPG 9, Sites 4, Variceal 1).
// Root cause: on a phone the credit hunted for bare figure among rectangles measured while the cards were still sliding, fading and re-measuring, so it could be placed on words that moved after.
// Fix at the root, as 2D does on an iPhone (app-05 `.pz-cred`): the credit is one line in a foot row the words card reserves for it, the same place on every slide; the floating one stays away on a phone's talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barOf, credRow, CRED_ROW, planLayout, PILL_CORNER, BAR_H_PHONE, footReserve } from '../src/ui/layout/plan.ts';

const S = (w: number, h: number, safe: [number, number, number, number]) => ({ vp: { w, h, safe: { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] } } });
const SCREENS = { 'iphone-portrait': S(393, 852, [59, 0, 34, 0]), 'iphone-pro-max': S(430, 932, [59, 0, 34, 0]), 'iphone-se': S(375, 667, [20, 0, 0, 0]), 'iphone-short': S(320, 568, [20, 0, 0, 0]), 'ipad-portrait': S(820, 1180, [24, 0, 20, 0]), mac: S(1440, 900, [0, 0, 0, 0]) };

test('an upright phone or tablet taller than 600 px reserves the credit row; every other screen reserves none', () => {
  for (const n of ['iphone-portrait', 'iphone-pro-max', 'iphone-se', 'ipad-portrait'] as const) assert.equal(credRow(SCREENS[n].vp), CRED_ROW, n);
  for (const n of ['iphone-short', 'mac'] as const) assert.equal(credRow(SCREENS[n].vp), 0, n);
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
  assert.match(frame, /!data && \(lay === 'stack' \|\| lay === 'tab' \? surface\.startsWith\('pz-shade'\) : isSideways\(vp\.w, vp\.h\) && \(surface\.startsWith\('pz-shade'\) \|\| surface\.startsWith\('pz-panel'\)\)\) && <span className="pz-cred" aria-hidden="true">\{CREDIT\}<\/span>/);
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /@media \(min-height: 601px\) \{ \.deck-ui:is\(\[data-layout="stack"\], \[data-layout="tab"\]\) \.dk-card:not\(\[data-card="ladder"\]\) \.dk-in \{ padding-bottom: calc\(var\(--pad-y\) \+ 50px \+ 20px\)/);
  assert.equal(CRED_ROW, 20, 'the CSS says 20 px');
  const chrome = readFileSync('src/ui/shell/chrome-3d.css', 'utf8');
  assert.match(chrome, /\.deck-ui:is\(\[data-layout="stack"\], \[data-layout="tab"\]\):has\(\.pz-cred\) ~ \.sh-root\[data-mode="deck"\] \.stage-credit\.placed \{ opacity: 0; \}/, 'the floating credit yields only while a card carries its own row; a slide with a table alone (no words card) keeps one line (capture 2a54261a)');
  const two = readFileSync('src/ui/styles/app-05-presenter-cards.css', 'utf8');
  assert.match(two, /@media \(min-height: 601px\) \{\s*\.pz-shade\.stack:not\(\.tab\) \.pz-cred \{ display: block; position: absolute;/, '2D\'s own row rule is the one in use');
});

// Capture 2a54261a, HVPG 14 / Doppler 13 / Sites 11 (a table is the slide's one card, so there is no words card and no foot row): the floating credit stands in the screen's foot band, never a hunt over the table.
test('an upright phone slide with no card carrying the credit row puts the floating line in the foot band, and hides it where a card, the pill or a drawer is on that band', async () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /talk && \(lay === 'stack' \|\| lay === 'tab'\) && !document\.querySelector\('\.dk-card \.pz-cred'\)\) \{\s*const at = foot, clear = footShown\(at, w, h, vw, vh, '\.dk-strip, \.dk-card, \.dk-bar'\);/);
  const { footCredit, footClear } = await import('../src/ui/shell/credit-foot.ts');
  const vw = 440, vh = 736, h = 17, w = 210, safe = { top: 0, right: 0, bottom: 0, left: 0 };
  const at = footCredit({ vw, vh, safe, h, margin: 8 });
  assert.equal(at.y + h, vh - 2, 'the line stands at the screen\'s foot');
  assert.equal(footClear(at, w, h, [{ l: 8, t: 40, r: 432, b: 640 }]), true, 'the table card (HVPG 14: 40 to 640) leaves the band clear');
  assert.equal(footClear(at, w, h, [{ l: 8, t: 40, r: 432, b: 725 }]), false, 'a card on the band hides it');
  assert.equal(footClear(at, w, h, [{ l: 200, t: 700, r: 330, b: 730 }]), false, 'the pill on the band hides it');
});

// Regression from 1161e159 (25 Nov, coordinator: "the floating © sits over the last outline lines on the outline card in five decks"). Root cause: every foot-band branch judged only the cards' boxes (or nothing, on a
// laptop), and the outline card stands centred and as tall as its lines need, so its last lines reach the band. The one judge, footShown, now also counts every line of words and every picture of every card.
test('the © in the foot band never stands over a card\'s words or pictures, in every layout that uses the band', async () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /function footShown\([^)]*\): boolean \{\s*return footClear\(at, w, h, \[.*cardContent\(vw, vh, false\)\]\);/, 'the judge counts the cards\' content');
  assert.equal((src.match(/footClear\(/g) ?? []).length, 1, 'footClear is called once, by footShown: no foot branch judges by boxes alone');
  assert.ok((src.match(/footShown\(/g) ?? []).length >= 4, 'the laptop, tablet, phone-on-its-side and upright-phone branches all use it');
  assert.match(src, /edges && c\.width > 4/, 'the card\'s own edge is left out of the foot judgement: the line may stand in a card\'s foot padding');
  const { footCredit, footClear } = await import('../src/ui/shell/credit-foot.ts');
  const at = footCredit({ vw: 440, vh: 736, safe: { top: 0, right: 0, bottom: 0, left: 0 }, h: 17, margin: 16 }), w = 220, h = 17;
  // an outline card 8 to 432 across, its last numbered line at 706 to 722: on the band
  const lastLine = { l: 40, t: 706, r: 300, b: 722 };
  assert.equal(footClear(at, w, h, [lastLine]), false, 'a line of the outline on the band hides the ©');
  assert.equal(footClear(at, w, h, [{ l: 40, t: 560, r: 300, b: 576 }]), true, 'lines above the band leave it');
});

// Capture af1c51a0, iPad: where a card reached the foot band the credit hunted for bare figure and stood across vessels. An upright iPad now carries it in its words card's foot row, as the phone does.
test('an upright iPad: the words card carries the credit row, the pill stands CRED_ROW higher, the floating line yields and never hunts', () => {
  const vp = SCREENS['ipad-portrait'].vp;
  const w = planLayout(vp, [{ id: 'teach', slot: 'words', h: 230 }]).cards.find((c) => c.slot === 'words')!.rect;
  const b = barOf(vp).rect;
  assert.equal(b.y + b.h, vp.h - footReserve(vp) - 12 - CRED_ROW, 'the pill clears the row');
  assert.ok(w.y + w.h >= b.y + b.h + CRED_ROW, 'the row is under the pill, inside the card');
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.deck-ui:is\(\[data-sideways\], \[data-layout="tab"\]\) \.dk-card \.pz-cred \{ display: block;/);
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.doesNotMatch(src, /lay === 'tab' && footShown/, 'no hunt on the tablet in a talk');
});
