import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceClass, typeFor, checkTypeScale, type DeviceClass, type Rect } from '../src/ui/layout/device.ts';
import { planLayout, largestFreeRect, widthOf, stepsFor, barOf, footReserve, STRIP_H, PILL_W, BAR_H_PHONE, PILL_CORNER, type Need } from '../src/ui/layout/plan.ts';
import { pairGap, margin, shufCol, SHUF, layoutOf } from '../src/ui/layout/rules2d.ts';

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

test('iPhone upright: where the figure and the words need the room, the data card comes in closed as a strip at the top, and a swap opens it', () => {
  const { vp } = SCREENS['iphone-portrait'];
  const p = planLayout(vp, needs(330, 330));
  assert.equal(p.shut, true);
  assert.equal(p.strip?.slot, 'data'); assert.equal(p.strip?.rect.h, STRIP_H); assert.ok(p.strip!.rect.y < p.cards[0].rect.y);
  assert.equal(p.cards[0].slot, 'words');
  const q = planLayout(vp, needs(330, 330), 'data');
  assert.equal(q.cards[0].slot, 'data'); assert.equal(q.strip?.slot, 'words');
});

test('iPad upright: the phone stack at 70 % of the width, centred', () => {
  const { vp } = SCREENS['ipad-portrait'];
  const p = planLayout(vp, needs(260, 200));
  for (const c of p.cards) { assert.equal(c.rect.w, Math.round(vp.w * 0.7)); assert.equal(c.rect.x, Math.round((vp.w - c.rect.w) / 2)); }
});

test('iPhone on its side: the wallet. One 400 px column centred on the screen, the card in front, the other a 48 px strip at the foot; the pill at the lower right', () => {
  const { vp } = SCREENS['iphone-landscape'];
  const p = planLayout(vp, needs(230, 180));
  assert.equal(p.sideways, true);
  const c = p.cards[0].rect;
  assert.equal(c.w, Math.round(shufCol(0, vp.w))); assert.equal(c.w, 400);
  assert.ok(Math.abs(c.x + c.w / 2 - vp.w / 2) < 1, 'centred');
  assert.equal(p.strip!.rect.h, SHUF.strip); assert.equal(p.strip!.rect.y + p.strip!.rect.h, vp.h);
  assert.ok(p.strip!.rect.y > c.y + c.h, 'the strip is under the card');
  assert.equal(p.bar.edge, 'foot');
  assert.ok(!hit(p.strip!.rect, p.bar.rect) && !hit(c, p.bar.rect), 'clear of the pill');
  assert.equal(p.cards.length, 1);
  const a = planLayout(vp, needs(), 'words'), b = planLayout(vp, needs(), 'data');
  assert.equal(a.cards[0].id, 'teach'); assert.equal(a.strip?.id, 'ladder'); assert.equal(b.cards[0].id, 'ladder'); assert.equal(b.strip?.id, 'teach');
});

test('iPhone on its side: a card too tall for its column asks for a wider one before it asks for a page', () => {
  const { vp } = SCREENS['iphone-landscape'];
  assert.ok(stepsFor(vp, true) >= 7, 'the usual three in each tighter room, then the wider ones');
  assert.ok(widthOf(vp, true, 99) > widthOf(vp, true, 0), 'the last step is the widest');
  
  assert.ok(widthOf(vp, true, 99) <= barOf(vp).rect.x - 8 - 59, 'never under the pill');
  assert.deepEqual(planLayout(vp, needs(400, 100)).overflow, ['teach']);
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
  for (const s of Object.values(SCREENS)) { const b = barOf(s.vp); assert.ok(inside(b.rect, s.vp.w, s.vp.h), s.device); assert.ok(b.rect.h >= (b.edge === 'card' && s.vp.w < 600 ? BAR_H_PHONE : 44)); }
});

test('type floors on every screen the 2D app has: body 17 px floating and 16 stacked, titles 1.4× body (1.33× stacked), data text 12 px or more', () => {
  const sizes: [number, number][] = [[1440, 900], [1440, 780], [1913, 1188], [1180, 820], [820, 1180], [390, 844], [844, 390], [375, 667], [320, 568], [667, 375], [430, 932], [744, 1133], [1024, 768], [1280, 720], [700, 500]];
  for (const [w, h] of sizes) assert.deepEqual(checkTypeScale(w, h), [], `${w}×${h}`);
  assert.ok(checkTypeScale(1440, 900, { ...typeFor(1440, 900), body: 16 }).length, 'a 16 px body on a Mac is caught');
  assert.ok(checkTypeScale(390, 844, { ...typeFor(390, 844), data: 11 }).length, 'an 11 px data text is caught');
  assert.ok(checkTypeScale(1440, 900, { ...typeFor(1440, 900), slideTitle: 22 }).length, 'a title under 1.4× is caught');
});

