// The figure key stands where the 2D app docks it on every device (owner, 19 Nov: "the legend is in the wrong place"): the 2D app's rules, from its
// stylesheet (copied: LABEL_STYLE.KEY), judged on each screen and for keys of every length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barOf, planLayout, footDrop, credRow } from '../src/ui/layout/plan.ts';
import { layoutOf, isSideways } from '../src/ui/layout/rules2d.ts';
import { dockKey, keyFontPx, keyVars, GAP_ABOVE_PILL, GAP_ABOVE_PILL_SIDE, PHONE_SIDE, PHONE_MIN_H, PHONE_UP_FOOT, TAB_FOOT, TAB_UP_FOOT } from '../src/scene/labels/key-dock.ts';
import { hits, type Box } from '../src/scene/labels/geometry.ts';
import { LS } from '../src/scene/labels/type.ts';
import { keyModel, KEY_LENSES } from '../src/scene/labels/key.ts';

const S = (top = 0, right = 0, bottom = 0, left = 0) => ({ top, right, bottom, left });
const SCREENS = {
  mac: { w: 1440, h: 900, safe: S() }, 'mac-small': { w: 1280, h: 720, safe: S() },
  'ipad-landscape': { w: 1180, h: 820, safe: S(24, 0, 20, 0) }, 'ipad-portrait': { w: 820, h: 1180, safe: S(24, 0, 20, 0) },
  'iphone-portrait': { w: 393, h: 852, safe: S(59, 0, 34, 0) }, 'iphone-landscape': { w: 852, h: 393, safe: S(0, 59, 21, 59) },
} as const;
const need = (vp: { w: number; h: number }) => [{ id: 'teach' as const, slot: 'words' as const, h: 300 }];
const box = (r: { x: number; y: number; w: number; h: number }): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

for (const [name, vp] of Object.entries(SCREENS)) {
  test(`${name}: the key docks as the 2D app docks it, on the screen, clear of the pill`, () => {
    const layout = layoutOf(vp.w, vp.h), side = isSideways(vp.w, vp.h), bar = barOf(vp).rect;
    const words = planLayout(vp, need(vp), 'words').cards.find((c) => c.slot === 'words')?.rect ?? null;
    for (const natural of [{ w: 150, h: 40 }, { w: 230, h: 28 }, { w: 330, h: 28 }, { w: 520, h: 28 }]) {
      const d = dockKey({ vp, words, natural });
      const b = d.box, on: Box = { x0: vp.safe.left, y0: vp.safe.top, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom + (layout === 'stack' ? footDrop(vp) : 0) };   // (an iPhone's bottom card reaches down to the screen's corner, the pill and the key in its foot: footDrop)
      assert.ok(b.x0 >= on.x0 - 0.5 && b.x1 <= on.x1 + 0.5 && b.y0 >= on.y0 - 0.5 && b.y1 <= on.y1 + 0.5, `${name} ${natural.w}: inside the screen (${JSON.stringify(b)})`);
      assert.ok(!hits(b, box(bar)) || (layout === 'stack' || layout === 'tab') && d.at === 'beside-pill' && b.x1 <= bar.x - 1, `${name} ${natural.w}: never over the pill`);
      if (layout === 'stack') {
        assert.equal(b.x0, vp.safe.left + PHONE_SIDE, 'phone: 21 px in from the side');
        if (d.at === 'beside-pill') { assert.equal(b.y1, vp.h - PHONE_SIDE - vp.safe.bottom + footDrop(vp) - credRow(vp), 'on the pill\'s row'); assert.ok(b.y1 - b.y0 >= PHONE_MIN_H, 'at least the row\'s height'); assert.ok(b.x1 <= bar.x - 8 + 0.5, 'beside the pill'); }
        else assert.equal(b.y1, words ? words.y - 30 : vp.h - PHONE_UP_FOOT - vp.safe.bottom + footDrop(vp), 'a row of its own above the words\' card (never over its words)');
      } else if (layout === 'tab') {
        assert.equal(b.y1, d.at === 'beside-pill' ? vp.h - TAB_FOOT - vp.safe.bottom : words ? words.y - 30 : vp.h - TAB_UP_FOOT - vp.safe.bottom);
        assert.ok(b.x0 >= (words ? words.x : 0), 'inside the card\'s left edge');
      } else {
        assert.equal(b.x1, bar.x + bar.w, 'right-aligned with the pill');
        assert.equal(b.y1, bar.y - (d.wrap !== null && side ? GAP_ABOVE_PILL_SIDE : GAP_ABOVE_PILL), 'on top of the pill');
        if (d.wrap !== null) assert.ok(words && b.x0 >= words.x + words.w + 8 - 0.5, 'wrapped beside the card, never under it');
      }
    }
  });
}

test('on the sideways phone a key that would reach under the centred card wraps beside it; where it fits it stands on one line', () => {
  const vp = SCREENS['iphone-landscape'], words = planLayout(vp, need(vp), 'words').cards[0].rect;
  assert.equal(dockKey({ vp, words, natural: { w: 90, h: 28 } }).wrap, null);
  const d = dockKey({ vp, words, natural: { w: 330, h: 28 } });
  assert.ok(d.wrap !== null && d.wrap < 330, 'wrapped');
});

test('a key that does not fit beside the phone\'s pill takes two lines in the pill\'s row, then a row above it', () => {
  const vp = SCREENS['iphone-portrait'], words = null, bar = barOf(vp).rect, room = bar.x - (vp.safe.left + PHONE_SIDE) - 8;
  assert.equal(dockKey({ vp, words, natural: { w: room - 5, h: 28 } }).at, 'beside-pill');
  const two = dockKey({ vp, words, natural: { w: room * 1.6, h: 18 } });
  assert.equal(two.at, 'beside-pill'); assert.equal(two.wrap, room);
  assert.equal(dockKey({ vp, words, natural: { w: room * 1.6, h: 40 } }).at, 'above-pill', 'two lines too tall for the row: above it');
  assert.equal(dockKey({ vp, words, natural: { w: room * 3, h: 22 } }).at, 'above-pill');
});

test('the key\'s type is the 2D pill\'s: 0.9 of the caption size (0.78 for a gradient key), never under 12 px, a phone at the 12 px caption', () => {
  assert.equal(keyFontPx(SCREENS['iphone-portrait'], false), 12);
  assert.equal(keyFontPx(SCREENS['iphone-landscape'], false), 12);
  const mac = keyFontPx(SCREENS.mac, false), grad = keyFontPx(SCREENS.mac, true);
  assert.ok(mac > 12 && grad >= 12 && grad < mac);
  assert.ok(Math.abs(mac - Math.max(12, Math.min(21, 1.733 * 9) * 0.9)) < 1e-9, 'a 900 px screen: 1.733 of 9 px, times .9');
  const v = keyVars(SCREENS.mac, true);
  assert.equal(v['--lb-key-bar-w'], `${LS.KEY.GRAD.barW}em`); assert.equal(keyVars(SCREENS.mac, false)['--lb-key-bar-w'], `${LS.KEY.BAR.w}em`);
});

test('every lens\'s key stays one pill: a name and either a scale or swatches', () => {
  for (const lens of KEY_LENSES) { const k = keyModel(lens, 'light')!; assert.ok(k.name && (k.scale || k.swatches)); }
});

// Root cause of the key's flicker and its two heights (20 Nov, eyes on 7ac0595): the hidden twin that reports the key's size on one line was never watched, so the dock fell back on the size the key
// is DRAWN at, which depends on the dock's own answer (wrapped, it looks short enough for one line; on one line it is too long and wraps): it flipped for ever and the key faded in and out at two heights.
test('the dock decides by the key on one line alone: the size it is drawn at never changes the answer', () => {
  const vp = SCREENS['iphone-portrait'];
  const words = planLayout(vp, need(vp), 'words').cards.find((c) => c.slot === 'words')?.rect ?? null;
  for (const natural of [{ w: 150, h: 28 }, { w: 230, h: 28 }, { w: 300, h: 28 }]) {
    const a = dockKey({ vp, words, natural });
    const drawnWide = dockKey({ vp, words, natural, wrapped: { w: natural.w, h: natural.h } });
    const drawnNarrow = dockKey({ vp, words, natural, wrapped: a.wrap ? { w: a.wrap, h: natural.h * 2 } : { w: natural.w, h: natural.h } });
    assert.equal(drawnWide.wrap, a.wrap, `${natural.w}: wrap`);
    assert.equal(drawnNarrow.wrap, a.wrap, `${natural.w}: wrap (drawn narrow)`);
    assert.equal(drawnNarrow.at, a.at, `${natural.w}: place`);
  }
});

test('the key beside the phone\'s pill never stands taller than the foot the words\' card keeps clear (it covered the last line, iPhone 21 Nov)', async () => {
  const { cardPad } = await import('../src/ui/layout/rules2d.ts');
  const { footReserve } = await import('../src/ui/layout/plan.ts');
  for (const vp of [SCREENS['iphone-portrait'], { w: 375, h: 667, safe: S(20, 0, 0, 0) }, { w: 430, h: 932, safe: S(59, 0, 34, 0) }]) {
    const bar = barOf(vp).rect, room = bar.x - (vp.safe.left + PHONE_SIDE) - 8;
    for (const h of [14, 19, 24, 30, 40]) for (const w of [room - 5, room * 1.5, room * 2.5]) {
      const d = dockKey({ vp, words: null, natural: { w, h } });
      if (d.at !== 'beside-pill') continue;
      const clear = cardPad(vp.w, vp.h).y + 50 + credRow(vp), top = (vp.h - footReserve(vp)) - d.box.y0;
      assert.ok(top <= clear + 0.5, `${vp.w}x${vp.h} key ${w}x${h}: its top ${top} px above the card's foot, words end ${clear}`);
    }
  }
});

// Root cause of "the lens legend wastes space" (iPhone, 22 Nov, First pass, not ammonia): the dock went from two long lines straight to a row of its own, never trying the swatches' short names as the 2D app
// does (presenter.js fitKey: two lines, then the short names, only then a row above the pill), so a key that fits beside the pill with Raw / Clear / HA / Sys took a whole row from the figure.
test('a key too long beside the phone\'s pill stands there with the short names before it takes a row of its own', () => {
  const vp = SCREENS['iphone-portrait'], bar = barOf(vp).rect, room = bar.x - (vp.safe.left + PHONE_SIDE) - 8;
  const natural = { w: room * 2.3, h: 18 }, short = { w: room * 1.5, h: 18 };
  assert.equal(dockKey({ vp, words: null, natural }).at, 'above-pill', 'without short names: a row above');
  const d = dockKey({ vp, words: null, natural, short });
  assert.equal(d.at, 'beside-pill'); assert.equal(d.short, true); assert.equal(d.wrap, room);
  assert.equal(dockKey({ vp, words: null, natural: { w: room * 1.6, h: 18 }, short }).short, false, 'long names that fit two lines stay long');
  assert.equal(dockKey({ vp, words: null, natural: { w: room * 4, h: 18 }, short: { w: room * 3, h: 18 } }).at, 'above-pill', 'too long even short: a row above');
});

test('the portal-blood split card\'s box holds its caption row, so the names that keep off it keep off all of it', async () => {
  const { splitWidth, cardSize } = await import('../src/scene/labels/figure-cards.ts');
  const t = { name: 12, num: 18 } as never, measure = (s: string, size: number) => s.length * size * 0.6;
  const c = { id: 's', kind: 'split', text: '', split: { liver: 100, shunt: 0, rate: 'lo' } } as never;
  assert.ok(splitWidth(c, t, measure) > 12 * 12.6, 'wider than 12.6 em when the caption is');
  assert.equal(cardSize(c, t, measure).w, Math.ceil((splitWidth(c, t, measure) + 8) * 100) / 100);
});

test('the split card\'s box holds its headline too ("70 % bypasses the liver" is wider than 12.6 em at a Mac\'s type)', async () => {
  const { splitWidth } = await import('../src/scene/labels/figure-cards.ts');
  const t = { name: 14, num: 18 } as never, measure = (s: string, size: number) => s.length * size * 0.6;   // (a wide face: the caption row is the short one here)
  const c = { id: 's', kind: 'split', text: '', split: { liver: 30, shunt: 70, rate: 'hi' } } as never;
  const head = measure('70', 21) + measure('%', 21) + 4 + measure('bypasses the liver', 14);
  assert.ok(splitWidth(c, t, measure) >= head, `holds ${head.toFixed(0)} px`);
});
