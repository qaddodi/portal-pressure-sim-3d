// The credit keeps off the Sinusoid's vessel (phone play-test, 20 Nov 2026: on a 390 x 844 phone the vessel runs top to bottom through the middle and the credit printed over it).
// The rule is 2D's own freeSpots with its `avoid` hook; the art is the vessel's strip (credit-avoid.ts). With no bare spot the credit is hidden by a fade (the class `covered`), never popped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORNERS, freeSpots as free2D } from '../src/ui/shell/credit-spots.copied.js';
import { VESSEL_PAD, avoidVessel, vesselRect, widestWall, type Rect } from '../src/ui/shell/credit-avoid.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';
import { isPortrait, restScale, shortSide } from '../src/scene/sinusoid/portrait.ts';

type Spot = { x: number; y: number } | null;
const freeSpots = free2D as (fig: unknown, obs: unknown[], w: number, h: number, o: unknown) => Record<string, Spot>;
const W = 190, H = 17;   // (the credit's line at 12 px: about 190 px wide)
const WALL = UM.lum * 1.3 + UM.endo;   // (a congested lumen, widest)

/** The vessel on a screen of vw x vh as the camera frames it at rest: the sinusoid through the middle of the room (the bars are left out: the strip runs the whole screen), `restScale` px per micrometre. */
function vesselOn(vw: number, vh: number): Rect {
  const room = { w: vw, h: vh }, portrait = isPortrait(vw, vh), k = restScale(shortSide(portrait, room)), cx = vw / 2, cy = vh / 2;
  return vesselRect((x, y) => (portrait ? [cx + y * k, cy + x * k] : [cx + x * k, cy + y * k]), WALL);
}
const bars = (vw: number, vh: number, phone: boolean) => phone ? [{ l: 0, t: vh - 96, r: vw, b: vh }, { l: 0, t: 0, r: vw, b: 96 }] : [{ l: 0, t: vh - 60, r: vw, b: vh }];
const overlaps = (a: Rect, b: Rect, pad = 0) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;

for (const [vw, vh] of [[390, 844], [393, 852], [430, 932], [844, 390]] as const) {
  test(`${vw} x ${vh}: no spot the credit takes touches the vessel; none free means hidden`, () => {
    const ves = vesselOn(vw, vh), fig = { l: 0, t: 0, r: vw, b: vh };
    const spots = freeSpots(fig, bars(vw, vh, vw < 700), W, H, { gap: 10, inset: 12, avoid: avoidVessel(ves) });
    for (const c of CORNERS) {
      const s = spots[c];
      if (s) assert.ok(!overlaps({ l: s.x, t: s.y, r: s.x + W, b: s.y + H }, ves, VESSEL_PAD), `${c} spot (${s.x}, ${s.y}) is clear of the vessel ${JSON.stringify(ves)}`);
    }
    const some = CORNERS.some((c) => spots[c]);
    if (vw < vh) assert.ok(!some, 'a phone held upright: the vessel takes the middle of the screen, 90 px either side is too narrow for the line, so it is hidden');
    else assert.ok(some, 'a phone on its side: the strip is flat, the credit stands below it');
    // without the avoidance the very same screen put the credit over the vessel (the bug)
    if (vw < vh) {
      const old = freeSpots(fig, bars(vw, vh, true), W, H, { gap: 10, inset: 12 });
      const hits = CORNERS.some((c) => old[c] && overlaps({ l: old[c]!.x, t: old[c]!.y, r: old[c]!.x + W, b: old[c]!.y + H }, ves));
      assert.ok(hits, 'the unguarded rule printed it over the vessel');
    }
  });
}

test('a line that fits beside the vessel keeps its corner (the avoidance hides only what must be hidden)', () => {
  const ves = vesselOn(430, 932), fig = { l: 0, t: 0, r: 430, b: 932 };
  const narrow = freeSpots(fig, bars(430, 932, true), 100, H, { gap: 10, inset: 12, avoid: avoidVessel(ves) });
  assert.ok(narrow.bl, 'a short line fits left of the vessel');
  assert.ok(narrow.bl!.x + 100 <= ves.l - VESSEL_PAD, 'and stands clear of it');
});

test('the vessel box: the strip runs off both ends, as wide as the wall; its widest wall is read from the view', () => {
  const r = vesselRect((x, y) => [100 + x * 2, 50 + y * 2], 6);
  assert.ok(r.l < -500 && r.r > 800, 'long past the screen either side');
  assert.deepEqual([r.t, r.b], [38, 62]);
  assert.ok(widestWall((x) => 5 + (Math.abs(x) < 7 ? 1 : 0)) === 6);
});

test('Credit.tsx hands the vessel to the rule as `avoid`, waits for the camera to land, and fades (never pops)', () => {
  const src = readFileSync(new URL('../src/ui/shell/Credit.tsx', import.meta.url), 'utf8');
  assert.match(src, /avoid: ves \? avoidVessel\(ves\) : null/);
  assert.match(src, /view === 'sinusoid'/);
  assert.match(src, /cel\.rig\.isMoving/, 'while the camera flies to the view the strip is not where it lands: hidden until it has');
  const css = readFileSync(new URL('../src/ui/shell/chrome-3d.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage-credit \{ transition: opacity/, 'the credit fades');
  assert.match(css, /\.stage-credit:is\(\.covered, \.moving\) \{ opacity: 0; \}/, 'hidden when covered or moving, after (and so over) the placed rule');
  assert.ok(css.indexOf('.stage-credit.placed { opacity: 1; }') < css.indexOf('.stage-credit:is(.covered, .moving)'), 'the covered rule comes after .placed, which has the same weight');
});
