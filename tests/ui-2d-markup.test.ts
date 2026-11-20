// The cards, the wallet strip and the presenter pill are drawn by the 2D app's own stylesheets (src/ui/css2d, lifted unchanged), so they carry its class names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(p, 'utf8');
const has = (p: string, ...needles: string[]) => { const t = src(p); for (const n of needles) assert.ok(t.includes(n), `${p} should use "${n}"`); };

test('the words card is 2D markup: .pz-shade glass, .pz-text, .pz-kick, .pz-h, .pz-eq, .pz-line', () => {
  has('src/ui/cards/CardFrame.tsx', 'pz-shade pz-card', 'pz-text', 'pz-data', 'pz-panel', 'pz-case on');
  has('src/ui/cards/TeachingCard.tsx', 'pz-kick', 'pz-h', 'pz-eq', 'pz-line');
  has('src/ui/cards/TitleCard.tsx', 'pz-ph', 'pz-dtitle', 'pz-h', 'pz-outline', 'pzo-obj');   // (the 2D outline slide has no Start button: the pill's Next goes on)
  has('src/ui/cards/CaseCard.tsx', 'pz-site pz-case-tag', 'pz-case-p', 'pz-case-q');   // (2D presenter-case.js cardUp)
  has('src/ui/cards/CheckCard.tsx', 'pz-h', 'pz-line', 'pz-check', 'pzc-q', 'pzc-a');
});

test('the data card is 2D markup: .pz-dh, .pz-tiles, .pz-tile, .pzt-k, .pzt-v', () => {
  has('src/ui/cards/LadderCard.tsx', 'pz-dh', 'pz-tiles', 'pz-tile', 'pzt-k', 'pzt-v');
});

test('the pill is 2D markup (.pz-bar .pzb-pill / .phone, .ib, .pzb-n > .pzb-nt) and the wallet strip is the 2D wallet (.pz-shuf, data-strip)', () => {
  has('src/ui/deck/PresenterBar.tsx', 'pz-bar', 'pzb-pill', 'phone', 'className="ib"', 'pzb-n', 'pzb-nt', 'pzb-next');
  has('src/ui/wallet/Strip.tsx', 'pz-shuf', 'data-strip', 'pz-shade');
});

test('the deck UI is the 2D root (.pz, stack, tab, short, pz-card) and loads the lifted stylesheet before its own', () => {
  const t = src('src/ui/DeckUi.tsx');
  assert.ok(t.includes("'pz'") && t.includes("'stack'") && t.includes("'tab'") && t.includes("'short'") && t.includes('pz-card'), 'root classes');
  assert.ok(t.indexOf("./css2d/index.css") > -1 && t.indexOf("./css2d/index.css") < t.indexOf("./deck-ui.css"), 'css2d is imported before deck-ui.css');
});

test('no old card class names are left in the cards (dk-kicker, dk-title, dk-body, dk-eq, dk-btn, dk-ladder, dk-row)', () => {
  for (const f of ['CardFrame', 'TeachingCard', 'TitleCard', 'CaseCard', 'CheckCard', 'LadderCard']) {
    const t = src(`src/ui/cards/${f}.tsx`);
    for (const old of ['dk-kicker', 'dk-title', 'dk-body', 'dk-eq', 'dk-btn', 'dk-ladder', 'dk-row']) assert.ok(!t.includes(old), `${f} still uses ${old}`);
  }
});
