// The lobule fits the free room beside the cards (Mohammad, 27 Nov 2026: "fit the lobule to the free space", every deck, Mac, iPad, iPhone, tucked and untucked).
// Root cause: planLayout chose the free room for the tallest BODY figure (aspect 0.62) for every view, so beside the cards a narrow tall column (572 x 892 on a Mac) won over the
// wide room above the dock (898 x 795), and the lobule (wider than tall) was fitted to the column's width alone: about half its height, off centre. The room now takes the view's own aspect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { FOV, NARROW_STAGE } from '../src/scene/camera/shots.ts';
import { effectiveDistance, fitDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { planLayout, figureAspect, FIGURE_ASPECT, LOBULE_ASPECT, type CardId } from '../src/ui/layout/plan.ts';

const SCREENS = [
  { name: 'iPhone upright', w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: 'iPhone sideways', w: 844, h: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { name: 'iPad upright', w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: 'iPad sideways', w: 1180, h: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: 'Mac', w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
] as const;

/** The lobule's bounds (1.12 R by 0.98 R) in CSS px, centred in a room: the width and height the camera gives them. */
function boundsPx(room: { w: number; h: number }, vp: { w: number; h: number }) {
  const D = effectiveDistance(lobuleShot('lobule'), room, vp.h, vp.w);
  const pxR = (vp.h / (2 * Math.tan((FOV * Math.PI) / 360)) / D) * LOBULE_R * LOBULE_SCALE;
  return { pxR, w: 2.24 * pxR, h: 1.96 * pxR };
}

test('the lobule aspect is its own bounds, the sinusoid turns with the stage, the body keeps 0.62', () => {
  const fit = lobuleShot('lobule');
  assert.ok(Math.abs(fit.half[0] / fit.half[1] - LOBULE_ASPECT) < 1e-9);
  assert.equal(figureAspect('body', SCREENS[4]), FIGURE_ASPECT);
  assert.equal(figureAspect('circuit', SCREENS[4]), FIGURE_ASPECT);
  assert.ok(figureAspect('sinusoid', SCREENS[4]) > 1 && figureAspect('sinusoid', SCREENS[0]) < 1);
});

test('on every screen, with the card up and tucked, the lobule fills the best free room the cards leave and is never smaller than before', () => {
  const sizes = [[300, 240], [420, 240], [260, 0], [520, 0]] as const;
  let checked = 0;
  for (const vp of SCREENS) for (const [wh, dh] of sizes) for (const dock of [false, true]) {
    if (dock && !dh) continue;
    const needs = [{ id: 'teach' as CardId, slot: 'words' as const, h: wh }, ...(dh ? [{ id: 'ladder' as CardId, slot: 'data' as const, h: dh }] : [])];
    const old = planLayout(vp, needs, 'words', 0, dock), now = planLayout(vp, needs, 'words', 0, dock, figureAspect('lobule', vp));
    const a = boundsPx(old.free, vp), b = boundsPx(now.free, vp), tag = `${vp.name} ${wh}/${dh}${dock ? ' tucked' : ''}`;
    assert.ok(b.pxR >= a.pxR - 1e-6, `${tag}: ${b.pxR.toFixed(1)} px/R, it was ${a.pxR.toFixed(1)}`);
    // the camera is at the fit of the room (not held back by the shot's nearest distance), so the limiting side is filled and the camera centres the other
    const shot = lobuleShot('lobule'), half = shot.halfNarrow && vp.w < NARROW_STAGE ? shot.halfNarrow : shot.half;
    assert.equal(effectiveDistance(shot, now.free, vp.h, vp.w), fitDistance(half, now.free, vp.h), `${tag}: held off the fit`);
    // the room never reaches under a card or the controls: it is the planner's own free rectangle
    for (const c of now.cards) assert.ok(now.free.x >= c.rect.x + c.rect.w || now.free.x + now.free.w <= c.rect.x || now.free.y >= c.rect.y + c.rect.h || now.free.y + now.free.h <= c.rect.y, `${tag}: room under card ${c.id}`);
    assert.ok(now.free.x >= vp.safe.left - 0.5 && now.free.x + now.free.w <= vp.w - vp.safe.right + 0.5, `${tag}: inside the screen`);
    checked++;
  }
  assert.ok(checked >= 18);
});

test('a Mac beside a pair of cards: the lobule is 800 px wide, not 511 (the column was chosen for the body)', () => {
  const vp = SCREENS[4], needs = [{ id: 'teach' as CardId, slot: 'words' as const, h: 300 }, { id: 'ladder' as CardId, slot: 'data' as const, h: 240 }];
  const old = boundsPx(planLayout(vp, needs).free, vp), now = planLayout(vp, needs, 'words', 0, false, figureAspect('lobule', vp));
  const b = boundsPx(now.free, vp);
  assert.ok(old.w / 2.24 * 2 < 520 && b.w / 2.24 * 2 > 780, `hexagon ${(old.w / 1.12).toFixed(0)} -> ${(b.w / 1.12).toFixed(0)} px`);
  assert.ok(b.h * 0.866 / 0.98 / 1 / now.free.h > 0.8, 'the hexagon is over 80 % of the free height');
});

test('every deck: each lobule slide and beat asks the planner for the lobule aspect (and only those)', async () => {
  let lob = 0, other = 0;
  for (const d of UI.decks as readonly { id: string }[]) {
    const deck = (await loadBuiltin(d.id))!, stops = stopsOf(deck);
    stops.forEach((st, i) => {
      if (st.kind !== 'slide') return;
      for (let b = 0; b <= (st.slide.beats?.length ?? 0) + 1; b++) {
        const v = viewAt(stops, { stop: i, beat: b });
        const asp = figureAspect(v.scene?.view, SCREENS[4]);
        if (v.scene?.view === 'lobule') { lob++; assert.equal(asp, LOBULE_ASPECT); } else if (v.scene?.view === 'sinusoid') assert.notEqual(asp, FIGURE_ASPECT); else { other++; assert.equal(asp, FIGURE_ASPECT); }
      }
    });
  }
  assert.ok(lob > 10 && other > 100, `${lob} lobule views, ${other} others`);
});
