// The promotion pictures (?promotion): the device outlines fit their canvas, the screen sits inside its body, the brand band stands clear above the device, a typed slide list is read the way
// the capture's pick is, every proposed slide exists, and the frame's address carries the promotion flags. Pure arithmetic and the registry: no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFor, FRAME_KIND, type Layout, type Rect } from '../src/ui/debug/promo/frames.ts';
import { parseSlides, slidesText, promoName, promoNameOf, targetOf, baseOf, splitKeys, isExtra, PROMO_SLIDES, PROMO_EXTRAS, PROMO_RATIO, PROMO_SIZES } from '../src/ui/debug/promo/slides.ts';
import { promoSrc, promoSizes } from '../src/ui/debug/promo/outer.ts';
import { promoRatio } from '../src/ui/debug/audit/promo-prep.ts';
import { builtinDecks, lazyDecks, loadBuiltin } from '../src/decks/registry.ts';
import { unpackPick } from '../src/ui/debug/audit/capture-pick.ts';

const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const SHOTS: [string, number, number][] = [['mac', 2880, 1800], ['iphone', 1170, 2532], ['ipad-portrait', 1640, 2360]];

test('every size has a frame, a ratio and a device outline', () => {
  for (const id of PROMO_SIZES) { assert.ok(FRAME_KIND[id], id); assert.ok(PROMO_RATIO[id]! >= 2, id); }
});

for (const [id, w, h] of SHOTS) {
  test(`${id}: the screen is inside the body, the body inside the picture, the brand band above the device`, () => {
    const L: Layout = layoutFor(FRAME_KIND[id]!, w, h), canvas = { x: 0, y: 0, w: L.w, h: L.h };
    assert.equal(L.screen.w, w); assert.equal(L.screen.h, h);
    assert.ok(inside(L.screen, L.body), 'screen in body');
    assert.ok(inside(L.body, canvas), 'body in picture');
    if (L.base) assert.ok(inside(L.base, canvas), 'base in picture');
    for (const b of L.buttons) assert.ok(inside(b, canvas), 'button in picture');
    assert.ok(L.brand.y + L.brand.h <= L.body.y, 'the brand band ends where the device begins');
    assert.ok(L.body.x >= 0.05 * L.u && L.w - (L.body.x + L.body.w) >= 0.05 * L.u, 'room each side of the device');
    if (L.camera) assert.ok(inside(L.camera, canvas), 'camera in picture');
    if (L.bar) assert.ok(inside(L.bar, L.screen), 'home bar on the screen');
  });
}

test('the same screen at 2x and 3x frames alike (every size is a fraction of the picture width)', () => {
  const a = layoutFor('iphone', 780, 1688), b = layoutFor('iphone', 1170, 2532);
  assert.ok(Math.abs(a.w / a.h - b.w / b.h) < 0.002);
  assert.ok(Math.abs(a.screen.r / a.u - b.screen.r / b.u) < 0.002);
});

test('a typed list is read as deck:number, notes after # are dropped, repeats and bad entries are told apart', () => {
  const r = parseSlides('lobule:4, hvpg:3  # the wedge\nhvpg:3\n  circulation:1\nnope\nlobule:0\nlobule:x');
  assert.deepEqual(r.keys, ['lobule:4', 'hvpg:3', 'circulation:1']);
  assert.deepEqual(r.bad, ['nope', 'lobule:0', 'lobule:x']);
  assert.deepEqual(parseSlides(slidesText()).keys, [...PROMO_SLIDES.map((s) => `${s.deck}:${s.slide}`), ...PROMO_EXTRAS.map((x) => x.key)]);
  assert.equal(parseSlides(slidesText()).bad.length, 0);
});

test('the proposed slides are twenty, none twice, each a real slide of a real talk, each with a reason', async () => {
  await Promise.all(lazyDecks().map((l) => loadBuiltin(l.id)));
  const decks = new Map(builtinDecks().map((d) => [d.id, d]));
  assert.equal(PROMO_SLIDES.length, 20);
  assert.equal(new Set(PROMO_SLIDES.map((s) => `${s.deck}:${s.slide}`)).size, 20);
  for (const s of PROMO_SLIDES) {
    const d = decks.get(s.deck);
    assert.ok(d, `talk ${s.deck}`);
    assert.ok(s.slide >= 1 && s.slide <= d.slides.length, `${s.deck}:${s.slide} is outside 1 to ${d.slides.length}`);
    assert.ok(s.why.length > 20, `${s.deck}:${s.slide} has no reason`);
  }
});

test('file names carry the place, the slide and the device', () => {
  assert.equal(promoName(3, 'lobule', 4, 'Cirrhosis narrows the sinusoid', 'iphone'), '03-lobule-4-cirrhosis-narrows-the-sinusoid-iphone.jpg');
  assert.equal(promoName(12, 'hvpg', 3, '', 'mac'), '12-hvpg-3-slide-mac.jpg');
});

test("the frame's address is the capture child's with the promotion flags, and drops the page's own", () => {
  const src = promoSrc('/preview/', '?promotion&pick=a:1&sizes=mac&speed=2&look=light', { keys: ['lobule:4', 'hvpg:3'], ratio: 3 });
  assert.equal(src, '/preview/?audit=capture&promo=3&pick=lobule:4,hvpg:3&look=light');
  const phone = promoSrc('/preview/', '?promotion&safe=1', { keys: ['lobule:4'], ratio: 3, safe: [47, 0, 34, 0] });
  assert.equal(phone, '/preview/?audit=capture&promo=3&safe=47,0,34,0&pick=lobule:4', 'a phone frame carries its safe edges, the page\'s own are dropped');
  assert.ok(!promoSrc('/preview/', '', { keys: ['lobule:4'], ratio: 2, safe: [0, 0, 0, 0] }).includes('safe='), 'a Mac has none');
  assert.deepEqual([...(unpackPick('lobule:4,hvpg:3') ?? [])], ['lobule:4', 'hvpg:3']);
  assert.deepEqual(promoSizes('iphone,tv,mac'), ['iphone', 'mac']);
  assert.deepEqual(promoSizes(null), [...PROMO_SIZES]);
});

test('a promo ratio is read from the address and kept between 1x and 4x', () => {
  assert.equal(promoRatio(null), null);
  assert.equal(promoRatio('3'), 3);
  assert.equal(promoRatio('9'), 4);
  assert.equal(promoRatio(''), 2);
});

test('a case at a stop and the menu are named like a slide: history:<case>[:<stop>], overview[:<tab>]', () => {
  assert.deepEqual(targetOf('history:hist-bleed:3'), { kind: 'history', id: 'hist-bleed', stop: 3 });
  assert.deepEqual(targetOf('history:hist-bleed'), { kind: 'history', id: 'hist-bleed', stop: null });
  assert.deepEqual(targetOf('overview'), { kind: 'overview', tab: 'present' });
  assert.deepEqual(targetOf('overview:talks'), { kind: 'overview', tab: 'present' });
  assert.deepEqual(targetOf('overview:patients'), { kind: 'overview', tab: 'patients' });
  assert.deepEqual(targetOf('overview:histories'), { kind: 'overview', tab: 'histories' });
  assert.deepEqual(targetOf('lobule:4'), { kind: 'slide', deck: 'lobule', slide: 4 });
  for (const bad of ['history:hist-bleed:0', 'history', 'history:', 'overview:nope', 'overview:1', 'history:1', 'a:b', 'lobule:0', 'history:x:y:3']) assert.equal(targetOf(bad), null, bad);
  const r = parseSlides('lobule:4, history:hist-hcv:2  # the cure\nhistory:hist-hcv:2\noverview overview:patients\nhistory:hist-x:0\noverview:nope');
  assert.deepEqual(r.keys, ['lobule:4', 'history:hist-hcv:2', 'overview', 'overview:patients']);
  assert.deepEqual(r.bad, ['history:hist-x:0', 'overview:nope']);
  assert.deepEqual(splitKeys(r.keys), { slides: ['lobule:4'], extras: ['history:hist-hcv:2', 'overview', 'overview:patients'] });
  assert.ok(isExtra('overview') && !isExtra('lobule:4') && !isExtra('nope'));
});

test('each key has its own file base and picture name, none shared between two keys', () => {
  const keys = ['lobule:4', 'history:hist-bleed:3', 'history:hist-bleed', 'history:hist-bleed:2', 'overview', 'overview:patients', 'overview:histories'];
  assert.equal(new Set(keys.map(baseOf)).size, keys.length);
  assert.equal(baseOf('lobule:4'), 'lobule-4');
  assert.equal(baseOf('history:hist-bleed'), 'history-hist-bleed-last');
  assert.equal(promoNameOf(1, 'lobule:4', 'Cirrhosis narrows the sinusoid', 'iphone'), promoName(1, 'lobule', 4, 'Cirrhosis narrows the sinusoid', 'iphone'));
  assert.equal(promoNameOf(21, 'history:hist-bleed:3', 'TIPS placed', 'mac'), '21-history-hist-bleed-3-tips-placed-mac.jpg');
  assert.equal(promoNameOf(24, 'overview:patients', 'Menu, patients', 'ipad-portrait'), '24-overview-patients-ipad-portrait.jpg');
});

test('the proposed extras: each a real case and stop, or a real menu tab, with a reason; none twice', async () => {
  const { HISTORIES } = await import('../src/ui/histories/index.generated.ts');
  assert.ok(PROMO_EXTRAS.length >= 4);
  assert.equal(new Set(PROMO_EXTRAS.map((x) => x.key)).size, PROMO_EXTRAS.length);
  for (const x of PROMO_EXTRAS) {
    const t = targetOf(x.key);
    assert.ok(t && t.kind !== 'slide', x.key);
    assert.ok(x.why.length > 20, `${x.key} has no reason`);
    if (t.kind === 'history') {
      const h = HISTORIES.find((c) => c.id === t.id);
      assert.ok(h, `case ${t.id}`);
      assert.ok(t.stop === null || t.stop <= (h.play?.stops?.length ?? 0), `${x.key}: stop ${t.stop} of ${h.play?.stops?.length}`);
    }
  }
});

test('the frame is handed slides in `pick` and the rest in `extras`; a run of extras alone has no pick (it would take every slide)', () => {
  const both = promoSrc('/preview/', '?promotion&sizes=mac&pick=x:1', { keys: ['lobule:4', 'history:hist-bleed:3', 'overview'], ratio: 2 });
  assert.match(both, /pick=lobule:4(&|$)/); assert.match(both, /extras=history:hist-bleed:3,overview/);
  assert.doesNotMatch(both, /sizes=|promotion/);
  const only = promoSrc('/preview/', '?promotion&extras=old', { keys: ['overview:patients'], ratio: 3 });
  assert.doesNotMatch(only, /pick=/); assert.match(only, /extras=overview:patients(&|$)/); assert.doesNotMatch(only, /extras=old/);
  const slidesOnly = promoSrc('/preview/', '?promotion', { keys: ['lobule:4'], ratio: 2 });
  assert.doesNotMatch(slidesOnly, /extras=/);
});
