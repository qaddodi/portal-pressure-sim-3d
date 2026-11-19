import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceClass, TYPE, checkTypeScale, type DeviceClass, type Rect } from '../src/ui/layout/device.ts';
import { planLayout, largestFreeRect, widthOf, STRIP_H, type Need, type Plan } from '../src/ui/layout/plan.ts';

const SCREENS: Record<string, { vp: { w: number; h: number; safe: { top: number; right: number; bottom: number; left: number } }; device: DeviceClass }> = {
  mac: { vp: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, device: 'desktop' },
  'ipad-landscape': { vp: { w: 1180, h: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, device: 'desktop' },
  'ipad-portrait': { vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, device: 'tablet-portrait' },
  'iphone-portrait': { vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, device: 'phone-portrait' },
  'iphone-landscape': { vp: { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } }, device: 'phone-landscape' },
};
const needs = (words = 280, data = 220): Need[] => [{ id: 'teach', slot: 'words', h: words }, { id: 'ladder', slot: 'data', h: data }];
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('a screen is told apart by its shorter side and its hold', () => {
  for (const [name, s] of Object.entries(SCREENS)) assert.equal(deviceClass(s.vp.w, s.vp.h), s.device, name);
});

for (const [name, s] of Object.entries(SCREENS)) {
  test(`${name}: cards stay on screen inside the safe areas and never overlap each other or the figure's free room`, () => {
    for (const active of ['words', 'data'] as const) {
      const plan = planLayout(s.vp, needs(), active);
      const boxes = plan.cards.map((c) => c.rect).concat(plan.strip ? [plan.strip.rect] : []);
      for (const b of boxes) {
        assert.ok(inside(b, s.vp.w, s.vp.h), `${name} ${JSON.stringify(b)} is off screen`);
        assert.ok(b.x >= s.vp.safe.left - 0.5 && b.x + b.w <= s.vp.w - s.vp.safe.right + 0.5 || s.device === 'phone-portrait' || s.device === 'tablet-portrait', `${name} card is outside the side safe areas`);
        assert.ok(b.y + b.h <= s.vp.h - s.vp.safe.bottom + 0.5, `${name} card runs into the bottom safe area`);
        assert.ok(!hit(b, plan.free), `${name} a card covers the figure's room`);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!hit(boxes[i], boxes[j]), `${name} cards overlap`);
      assert.ok(plan.free.w > 0 && plan.free.h > 0);
    }
  });
}

test('phones keep one card up and the other as a 48 px strip; Mac and iPad show both', () => {
  for (const [name, s] of Object.entries(SCREENS)) {
    const p = planLayout(s.vp, needs());
    if (s.device === 'desktop' || s.device === 'tablet-portrait') { assert.equal(p.cards.length, 2, name); assert.equal(p.strip, null, name); }
    else { assert.equal(p.cards.length, 1, name); assert.equal(p.strip?.rect.h, STRIP_H, name); }
  }
});

test('the wallet swap brings the other card forward and the first becomes the strip', () => {
  const vp = SCREENS['iphone-landscape'].vp;
  const a = planLayout(vp, needs(), 'words'), b = planLayout(vp, needs(), 'data');
  assert.equal(a.cards[0].id, 'teach'); assert.equal(a.strip?.id, 'ladder');
  assert.equal(b.cards[0].id, 'ladder'); assert.equal(b.strip?.id, 'teach');
});

test('iPhone on its side: a 330 px column inside the safe area, the card centred above the strip, the figure on the right', () => {
  const vp = SCREENS['iphone-landscape'].vp;
  const p = planLayout(vp, needs(260, 200));
  const c = p.cards[0].rect;
  assert.equal(c.x, 59); assert.equal(c.w, 330);
  assert.ok(p.strip!.rect.y > c.y + c.h, 'the strip is under the card');
  assert.ok(p.free.x >= c.x + c.w + 16 - 0.5, 'the figure is to the right of the column');
});

test('a card that is taller than its room is reported (the card pages itself; it never shrinks or scrolls)', () => {
  const p = planLayout(SCREENS['iphone-landscape'].vp, needs(400, 100));
  assert.deepEqual(p.overflow, ['teach']);
  assert.deepEqual(planLayout(SCREENS.mac.vp, needs(300, 200)).overflow, []);
});

test('the free room is the column that holds the tallest figure, not a wide sliver under a card', () => {
  const p = planLayout(SCREENS.mac.vp, needs(300, 260));
  assert.ok(p.free.h > p.free.w, `free ${JSON.stringify(p.free)}`);
  const r = largestFreeRect({ x: 0, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 40 }], 0);
  assert.deepEqual(r, { x: 0, y: 40, w: 100, h: 60 });
});

test('widths do not depend on heights (a card is measured at the width it will have)', () => {
  for (const s of Object.values(SCREENS)) for (const id of ['title', 'teach', 'ladder', 'check', 'case'] as const) {
    const w = widthOf(s.device, id, s.vp);
    assert.ok(w > 0 && w <= s.vp.w - (s.device === 'phone-landscape' ? 0 : 24), `${s.device} ${id} ${w}`);
  }
});

test('type floors: body 17 px on Mac and iPad and 16 on iPhone, titles 1.4× body (1.33× on a phone), data text 12 px or more', () => {
  for (const c of Object.keys(TYPE) as DeviceClass[]) assert.deepEqual(checkTypeScale(c), [], c);
  assert.ok(checkTypeScale('desktop', { ...TYPE.desktop, body: 16 }).length, 'a 16 px body on a Mac is caught');
  assert.ok(checkTypeScale('phone-portrait', { ...TYPE['phone-portrait'], data: 11 }).length, 'an 11 px data text is caught');
  assert.ok(checkTypeScale('desktop', { ...TYPE.desktop, slideTitle: 22 }).length, 'a title under 1.4× is caught');
});
