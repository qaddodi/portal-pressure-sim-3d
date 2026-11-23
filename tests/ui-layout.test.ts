import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceClass, typeFor, checkTypeScale, type DeviceClass, type Rect } from '../src/ui/layout/device.ts';
import { planLayout, largestFreeRect, widthOf, stepsFor, barOf, footReserve, PILL_W, BAR_H_PHONE, PILL_CORNER, type Need } from '../src/ui/layout/plan.ts';
import { pairGap, margin, shufCol, SHUF, layoutOf, isSideways, sideColW } from '../src/ui/layout/rules2d.ts';

const SCREENS: Record<string, { vp: { w: number; h: number; safe: { top: number; right: number; bottom: number; left: number } }; device: DeviceClass }> = {
  mac: { vp: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, device: 'desktop' },
  'mac-big': { vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, device: 'desktop' },
  'ipad-landscape': { vp: { w: 1180, h: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, device: 'desktop' },
  'ipad-portrait': { vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, device: 'tablet-portrait' },
  'iphone-portrait': { vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, device: 'phone-portrait' },
  'iphone-landscape': { vp: { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } }, device: 'phone-landscape' },
};
const needs = (words = 280, data = 220): Need[] => [{ id: 'teach', slot: 'words', h: words }, { id: 'ladder', slot: 'data', h: data }];
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('a screen is told apart by the 2D app\'s media queries', () => {
  for (const [name, s] of Object.entries(SCREENS)) assert.equal(deviceClass(s.vp.w, s.vp.h), s.device, name);
});

for (const [name, s] of Object.entries(SCREENS)) {
  test(`${name}: cards stay on screen and never overlap each other, the bar or the figure's free room`, () => {
    for (const active of ['words', 'data'] as const) {
      const plan = planLayout(s.vp, needs(), active);
      const boxes = plan.cards.map((c) => c.rect).concat(plan.strip ? [plan.strip.rect] : []);
      for (const b of boxes) {
        assert.ok(inside(b, s.vp.w, s.vp.h), `${name} ${JSON.stringify(b)} is off screen`);
        assert.ok(b.y + b.h <= s.vp.h + 0.5, `${name} card runs off the foot`);
        assert.ok(!hit(b, plan.free), `${name} a card covers the figure's room`);
        if (plan.bar.edge === 'foot') assert.ok(!hit(b, plan.bar.rect), `${name} a card covers the pill`);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!hit(boxes[i], boxes[j]), `${name} cards overlap`);
      assert.ok(plan.free.w > 0 && plan.free.h > 0);
    }
  });
}

test('Mac and iPad on its side: the data card stands under the words at the same width, 0.6 of the margin below, from the margin in', () => {
  for (const name of ['mac', 'mac-big', 'ipad-landscape']) {
    const { vp } = SCREENS[name];
    const p = planLayout(vp, needs(260, 200));
    const [w, d] = [p.cards.find((c) => c.slot === 'words')!.rect, p.cards.find((c) => c.slot === 'data')!.rect];
    assert.equal(w.x, d.x, name); assert.equal(w.w, d.w, name);
    assert.equal(d.y, w.y + w.h + pairGap(vp.w, vp.h, layoutOf(vp.w, vp.h)), name);
    assert.ok(w.x >= margin(vp.w, vp.h, layoutOf(vp.w, vp.h)) - 0.5, name);
    assert.equal(w.w, widthOf(vp), name);
    assert.equal(p.strip, null, name);
  }
});

test('Mac: a pair a few px too tall rises into its top margin (never nearer than 4 px); one that is much too tall stays stacked and its words page', () => {
  const { vp } = SCREENS.mac;
  const a = planLayout(vp, needs(260, 460));   // a little too tall (760 against the 734 the margins leave)
  assert.ok(a.cards[0].rect.y >= 4 - 0.5 && a.cards[0].rect.y < margin(vp.w, vp.h, layoutOf(vp.w, vp.h)));
  const tall = planLayout(vp, needs(420, 400));
  const [w, d] = [tall.cards.find((c) => c.slot === 'words')!.rect, tall.cards.find((c) => c.slot === 'data')!.rect];
  assert.equal(d.x, w.x, 'the data card never moves to the top right: it stays under the words');
  assert.ok(tall.overflow.length, 'the room it lacks is reported, so the words page rather than shrink');
});

test('the Back / Next pill: lower right of a wide screen inside the foot of the words card on an iPhone and an upright iPad; lower right sideways', () => {
  const mac = barOf(SCREENS.mac.vp);
  assert.equal(mac.edge, 'foot'); assert.equal(mac.rect.h, 44);
  assert.equal(mac.rect.x + mac.rect.w, SCREENS.mac.vp.w - margin(1280, 800, 'short'));
  const ph = barOf(SCREENS['iphone-portrait'].vp);
  assert.equal(ph.edge, 'card');
  assert.equal(ph.rect.x + ph.rect.w, 393 - 8 - PILL_CORNER, 'the card\'s lower right corner, inside it'); assert.ok(ph.rect.h < 44 && ph.rect.w < PILL_W, 'a phone\'s pill is smaller');
  const ip = barOf(SCREENS['ipad-portrait'].vp);
  assert.equal(ip.edge, 'card'); assert.ok(ip.rect.x + ip.rect.w <= 820 * 0.85 + 0.5, 'the right of the 70 % card');
  const sw = barOf(SCREENS['iphone-landscape'].vp);
  assert.equal(sw.edge, 'foot');
});

test('iPhone upright: data card on top, words at the foot (the pill stands in it), the figure between', () => {
  const { vp } = SCREENS['iphone-portrait'];
  const p = planLayout(vp, needs(230, 150));
  const [w, d] = [p.cards.find((c) => c.slot === 'words')!.rect, p.cards.find((c) => c.slot === 'data')!.rect];
  assert.equal(d.y, vp.safe.top + 8); assert.equal(w.y + w.h, vp.h - footReserve(vp));
  assert.equal(w.w, vp.w - 16); assert.equal(d.w, vp.w - 16);
  assert.ok(p.free.y >= d.y + d.h && p.free.y + p.free.h <= w.y, 'the figure is between the cards');
  assert.ok(p.free.h >= 0.3 * vp.h - 1, 'and keeps its share');
  assert.equal(p.strip, null); assert.equal(p.shut, false);
  assert.equal(p.bar.edge, 'card');
  assert.ok(p.bar.rect.y > w.y && p.bar.rect.y + p.bar.rect.h <= w.y + w.h, 'the pill is inside the words card');
});

test('iPhone upright: a phone never closes a card on its own (Plan 42): a tall pair keeps both cards up, the data card keeps what the words leave, the words page', () => {
  const { vp } = SCREENS['iphone-portrait'];
  for (const [wh, dh] of [[330, 330], [246, 330], [327, 264], [400, 250], [900, 900]]) for (const active of ['words', 'data'] as const) {
    const p = planLayout(vp, needs(wh, dh), active);
    assert.equal(p.shut, false); assert.equal(p.strip, null);
    assert.deepEqual(p.cards.map((c) => c.slot).sort(), ['data', 'words']);
    for (const c of p.cards) assert.ok(c.rect.h > 0);
  }
  // the column between the data card's top and the words card's foot is shared: 844 - 67 - 187 - 16 = 574 px
  const p = planLayout(vp, needs(246, 330));
  assert.equal(p.maxH.data, 328); assert.equal(p.maxH.words, 574 - 328);
  const q = planLayout(vp, needs(400, 250));
  assert.equal(q.maxH.data, 230); assert.equal(q.maxH.words, 344 + 0);
});

test('iPad upright: the phone stack at 70 % of the width, centred', () => {
  const { vp } = SCREENS['ipad-portrait'];
  const p = planLayout(vp, needs(260, 200));
  for (const c of p.cards) { assert.equal(c.rect.w, Math.round(vp.w * 0.7)); assert.equal(c.rect.x, Math.round((vp.w - c.rect.w) / 2)); }
});

test('iPhone on its side: two side columns, the words left and the instrument right, the figure between; tucked, the instrument is a 30 px strip at the right edge', () => {
  const { vp } = SCREENS['iphone-landscape'];
  const p = planLayout(vp, needs(230, 180));
  assert.equal(p.sideways, true);
  assert.equal(p.cards.length, 2);
  const [w, d] = [p.cards[0].rect, p.cards[1].rect];
  assert.equal(p.cards[0].id, 'teach'); assert.equal(p.cards[1].id, 'ladder');
  assert.equal(w.w, Math.round(0.27 * vp.w)); assert.equal(d.w, w.w, 'one column width');
  assert.equal(w.x, vp.safe.left, 'the words stand on the left safe edge');
  assert.equal(d.x + d.w, vp.w - vp.safe.right, 'the instrument stands on the right safe edge');
  assert.ok(d.x > w.x + w.w + 100, 'the figure has the middle');
  assert.equal(w.y, d.y); assert.equal(w.h, d.h);
  assert.equal(p.sidePill, 'open');
  assert.ok(!hit(w, p.free) && !hit(d, p.free) && !hit(w, p.bar.rect) && !hit(d, p.bar.rect), 'the figure column and the pill are clear of both cards');
  const t = planLayout(vp, needs(230, 180), 'words', 0, true);
  assert.equal(t.cards.length, 1); assert.equal(t.cards[0].id, 'teach');
  assert.equal(t.docked, true); assert.equal(t.sidePill, 'tucked');
  assert.equal(t.strip!.rect.w, 30, 'the handle is a 30 px strip');
  assert.equal(t.strip!.rect.x + t.strip!.rect.w, d.x + d.w, 'the strip stands on the card\'s own right end, inside the safe area');
  assert.equal(t.tucked!.x, d.x, 'the tucked card keeps its own place; a translate slides it away');
  assert.equal(t.tuckDx, t.strip!.rect.x - d.x);
  assert.ok(t.free.w > p.free.w, 'the figure gets the room the card left');
  assert.ok(!hit(t.strip!.rect, t.free), 'the strip is clear of the figure');
});

test('iPhone on its side: a card too tall for its column asks for a page, never a wider column (one width, 27 % of the screen, 220 to 260 px)', () => {
  const { vp } = SCREENS['iphone-landscape'];
  assert.equal(stepsFor(vp, true), 1);
  assert.equal(widthOf(vp, true, 0), widthOf(vp, true, 99));
  for (const w of [667, 750, 844, 852, 932, 1000]) assert.ok(sideColW(w) >= 220 && sideColW(w) <= 260, `${w}`);
  assert.deepEqual(planLayout(vp, needs(900, 100)).overflow, ['teach']);
});

test('a card that is taller than its room is reported (the card pages itself; it never shrinks or scrolls)', () => {
  assert.deepEqual(planLayout(SCREENS.mac.vp, needs(300, 200)).overflow, []);
  assert.ok(planLayout(SCREENS.mac.vp, needs(900, 200)).overflow.includes('teach'));
});

test('the free room is the column that holds the tallest figure, not a wide sliver under a card', () => {
  const p = planLayout(SCREENS.mac.vp, needs(300, 260));
  assert.ok(p.free.h > p.free.w * 0.8, `free ${JSON.stringify(p.free)}`);
  const r = largestFreeRect({ x: 0, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 40 }], 0);
  assert.deepEqual(r, { x: 0, y: 40, w: 100, h: 60 });
});

test('widths do not depend on heights (a card is measured at the width it will have)', () => {
  for (const s of Object.values(SCREENS)) for (const pair of [false, true]) {
    const w = widthOf(s.vp, pair);
    assert.ok(w > 0 && w <= s.vp.w, `${s.device} ${w}`);
  }
});

test('the pill is on screen on every layout', () => {
  for (const s of Object.values(SCREENS)) { const b = barOf(s.vp); assert.ok(inside(b.rect, s.vp.w, s.vp.h), s.device); assert.ok(b.rect.h >= (b.edge === 'card' && s.vp.w < 600 || isSideways(s.vp.w, s.vp.h) ? BAR_H_PHONE : 44)); }
});

test('type floors on every screen the 2D app has: body 17 px floating and 16 stacked, titles 1.4× body (1.33× stacked), data text 12 px or more', () => {
  const sizes: [number, number][] = [[1440, 900], [1440, 780], [1913, 1188], [1180, 820], [820, 1180], [390, 844], [844, 390], [375, 667], [320, 568], [667, 375], [430, 932], [744, 1133], [1024, 768], [1280, 720], [700, 500]];
  for (const [w, h] of sizes) assert.deepEqual(checkTypeScale(w, h), [], `${w}×${h}`);
  assert.ok(checkTypeScale(1440, 900, { ...typeFor(1440, 900), body: 16 }).length, 'a 16 px body on a Mac is caught');
  assert.ok(checkTypeScale(390, 844, { ...typeFor(390, 844), data: 11 }).length, 'an 11 px data text is caught');
  assert.ok(checkTypeScale(1440, 900, { ...typeFor(1440, 900), slideTitle: 22 }).length, 'a title under 1.4× is caught');
});

