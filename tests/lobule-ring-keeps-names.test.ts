// The presinusoidal slide's tract names (Mohammad, 27 Nov 2026, capture b1bb14d7, slide 7/15 "Normal HVPG, high portal pressure": "this slide should show the labels; they appear then disappear").
// Root cause: the slide's callout rings the portal tract ("Resistance"), and the callout's claim on the figure was the whole square round its ring, handed to the lobule's names as a `blocker`. The
// names are first placed before the callout has faded in; the claim then arrives, the names are placed again, and the solver's rule 6 ("a dot under a card has nothing to label") hid every one of them:
// the venule, arteriole and ductule stand INSIDE the ring, by design. A ring's room is now `encircled`: a wall for a name's box, never for the dot it rings, and a leader may leave the ring it starts in.
// The rule is general (every ring callout, every slide, every screen): a name the slide's figure asked for stays, outside the ring, with a leader reaching in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { buildLobuleCaptions, framedTriad } from '../src/scene/lobule/captions.ts';
import { cardRings, cardClaims, RING_AIR, type CardIn } from '../src/scene/labels/figure-cards.ts';
import { calloutClaims } from '../src/scene/labels/callout-claims.ts';
import { boxOf, solve } from '../src/scene/labels/solver.ts';
import { type Box, crosses, hits } from '../src/scene/labels/geometry.ts';
import { FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { lobuleLabelView } from '../src/scene/lobule/captions.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { BAR } from '../src/ui/layout/plan.ts';

const net = buildLobule();
const measure = (t: string) => t.length * 6.8;
const FRAMES = [
  { n: 'iPhone 390x844', w: 390, h: 844, top: 47, port: true }, { n: 'iPhone 430x932', w: 430, h: 932, top: 59, port: true },
  { n: 'iPad portrait 820x1180', w: 820, h: 1180, top: 24, port: true },
  { n: 'iPad 1180x820', w: 1180, h: 820, top: 0, port: false }, { n: 'Mac 1440x900', w: 1440, h: 900, top: 0, port: false },
] as const;

/** The slide's triad shot as it stands at rest on a screen: the room the cards leave, the plate's scale, and the cards themselves (the data card up top, the words card at the foot). */
function frame(f: (typeof FRAMES)[number]) {
  const cards: Box[] = f.port ? [{ x0: 0, y0: f.top, x1: f.w, y1: f.top + Math.round(f.h * 0.25) }, { x0: 0, y0: Math.round(f.h * 0.675), x1: f.w, y1: f.h }]
    : f.w < 900 ? [{ x0: 0, y0: 0, x1: 330, y1: f.h }] : [{ x0: 0, y0: 60, x1: 380, y1: f.h - 20 }];
  const room = f.port ? { x: 0, y: cards[0]!.y1, w: f.w, h: cards[1]!.y0 - cards[0]!.y1 } : { x: cards[0]!.x1, y: f.top, w: f.w - cards[0]!.x1, h: f.h };
  const full = { w: f.w, h: f.h, safe: { top: f.top, right: 0, bottom: f.port ? 34 : 0, left: 0 } };
  const D = effectiveDistance(lobuleShot('lobule:triad'), room, f.h, f.w);
  const pxR = (f.h / (2 * Math.tan((FOV * Math.PI) / 360)) / D) * LOBULE_R * LOBULE_SCALE;
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
  // (the shot looks at the portal corner, x = -1 R)
  const proj = (x: number, y: number): [number, number] => [cx + (x + 1) * pxR, cy + y * pxR];
  return { cards, view: lobuleLabelView(full, BAR, room), proj, pxR, vp: { w: f.w, h: f.h } };
}

for (const f of FRAMES) for (const lymph of [false, true]) {
  test(`${f.n}${lymph ? ', Lymph layer' : ''}: the names of a tract a callout rings stay, outside the ring, and none is hidden for having its dot inside it`, () => {
    const { cards, view, proj, pxR, vp } = frame(f);
    const t = net.triads[framedTriad(net.triads)]!, [rx, ry] = proj(t.x, t.y);
    // the ring the callout draws round the tract: the venule's disc and half again, as the callout's ring is drawn, with its air, exactly as the callout's claim takes it
    const ins: CardIn[] = [{ id: 'callout', x: rx, y: ry, w: 70, h: 18, ring: Math.max(10, DISC_R.pv * 1.6 * pxR) + RING_AIR }];
    const rings = cardRings(ins);
    assert.equal(rings.length, 1, 'a ring callout claims its ring\'s room as a ring');
    assert.deepEqual(cardClaims(ins, [{ id: 'callout', x0: rx + 200, y0: ry, box: { x0: rx + 200, y0: ry, x1: rx + 270, y1: ry + 18 }, ok: true }]).filter((b) => hits(b, { x0: rx - 1, y0: ry - 1, x1: rx + 1, y1: ry + 1 })), [], 'and not as a wall over the dots inside it');
    // the names, built as the layer builds them: the callout's claim is not a card, so a tract whose dot is inside the ring is still the tract in view
    const inView = (x: number, y: number) => x > view.x0 + 64 && x < view.x1 - 64 && y > view.y0 + 64 && y < view.y1 - 64 && !cards.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
    const c = buildLobuleCaptions({ proj, vp, measure, net, layers: { zones: false, lymph }, inView });
    const want = ['triad', 'ha', 'bd', ...(lymph ? ['lymph'] : [])];
    const out = solve({ items: c.items, view, blockers: cards, encircled: rings, lines: c.lines, keep: c.keep });
    for (const id of want) {
      assert.ok(!out.hidden.includes(id), `${id} is not hidden by the ring it stands in (hidden ${out.hidden})`);
      const p = out.placed.find((x) => x.id === id);
      assert.ok(p, `${id} is placed (dropped ${out.dropped}, skipped ${out.skipped})`);
      const it = c.items.find((i) => i.id === id)!, box = boxOf(p, it.ax, it.ay);
      for (const r of rings) assert.ok(!hits(box, r), `${id}'s words stand outside the ring`);
      for (const w of cards) assert.ok(!hits(box, w), `${id} clear of the cards`);
      if (p.leader) for (const r of rings) {
        if (it.ax > r.x0 && it.ax < r.x1 && it.ay > r.y0 && it.ay < r.y1) continue;
        assert.ok(!crosses(it.ax, it.ay, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, r), `${id}'s leader crosses no ring it does not start in`);
      }
    }
  });
}

test('the ring as a blocker is what hid the tract (the old wiring), so the test above has teeth', () => {
  const f = FRAMES[0], { cards, view, proj, pxR, vp } = frame(f);
  const t = net.triads[framedTriad(net.triads)]!, [rx, ry] = proj(t.x, t.y), r = Math.max(10, DISC_R.pv * 1.6 * pxR) + RING_AIR;
  const ring: Box = { x0: rx - r, y0: ry - r, x1: rx + r, y1: ry + r };
  const c = buildLobuleCaptions({ proj, vp, measure, net, layers: { zones: false, lymph: false } });
  const old = solve({ items: c.items, view, blockers: [...cards, ring], lines: c.lines, keep: c.keep });
  assert.ok(old.hidden.includes('triad'), 'as a blocker, the ring hides the venule it rings');
});

test('the lobule layer hands the ring to the solver as `encircled`, keeps its walls and its signature in step, and the callout writes it apart from its other claims', () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const lc = src('src/scene/lobule/LobuleCaptions.tsx');
  assert.match(lc, /encircled: rings\(\)/, 'the solver is given the rings');
  assert.match(lc, /calloutClaims\.rings\.map\(boxKey\)/, 'a ring that moves places the names again');
  assert.match(lc, /boxesFit\(boxesOf\(\), ride, view\(\), \[\.\.\.blockers\(\), \.\.\.rings\(\)\]\)/, 'a carried name that comes to stand in a ring is placed again');
  assert.doesNotMatch(src('src/scene/labels/figure-cards.ts'), /out\.push\(\{ x0: i\.x - i\.ring/, 'cardClaims no longer makes the ring a wall for dots');
  calloutClaims.set([], [{ x0: 1, y0: 1, x1: 2, y1: 2 }]);
  assert.equal(calloutClaims.rings.length, 1);
  assert.equal(calloutClaims.boxes.length, 0, 'the ring is not among the boxes every other writer keeps off');
  calloutClaims.set([]);
  assert.equal(calloutClaims.rings.length, 0);
});
