// The portal triad's frame (framing rule S7, Mohammad 25 Nov): 1.75 times closer than 2D's station, centred on the tract, the triad and its collagen cuff whole in the room on every device.
// Pure numbers, no browser: the room solver and the lobule's own room.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE, lobuleWorld } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { TRIAD_D, TRIAD_A } from '../src/scene/lobule/geometry.ts';
import { TRACT_REACH_PX, PX_PER_R } from '../src/scene/lobule/collagen-edge.ts';
import { TRACT_RING_R } from '../src/scene/lobule/callout-spot.ts';
import { lobuleRoom } from '../src/ui/shell/room.ts';

const roomOf = (W: number, H: number) => lobuleRoom({ w: W, h: H, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, { topSafe: 47 + 44, cmpH: 0, pzT: 0, pzB: 0, pzL: 0, pzR: 0, botOcc: 34 + 150, presenting: false });
const SCREENS = [[1440, 900], [1024, 768], [390, 844], [844, 390], [1180, 820]] as const;
/** Pixels per lobule radius the triad shot rests at, and the frame's aim in lobule radii from the lobule's middle (x). */
function triadOn(W: number, H: number) {
  const room = roomOf(W, H), shot = lobuleShot('lobule:triad');
  const D = effectiveDistance(shot, room, H, W);
  const pxR = (H / (2 * Math.tan((FOV * Math.PI) / 360)) / D) * LOBULE_SCALE * LOBULE_R;
  const x0 = lobuleWorld([0, 0, 0])[0], aim = (shot.target[0] - x0) / (LOBULE_SCALE * LOBULE_R);
  return { room, pxR, aim };
}
const REACH_R = TRACT_REACH_PX / PX_PER_R;   // the collagen cuff's reach from the tract's centre, lobule radii
/** The triad's own extent from the tract's centre (-1, 0): the small vessels stand TRIAD_D out, the arteriole and ductule TRIAD_A either side of that ray. */
const TRIAD_X0 = -TRIAD_D - DISC_R.lv, TRIAD_Y = TRIAD_D * Math.sin(TRIAD_A) + DISC_R.bd;

test('the triad frame is centred on the tract and 1.75 times closer than 2D\'s station (zoom 2 to 3.5) on every screen', () => {
  for (const [W, H] of SCREENS) {
    const { aim, pxR } = triadOn(W, H);
    assert.ok(Math.abs(aim + 1) < 0.01, `${W}x${H}: aimed at ${aim.toFixed(3)} R, the tract stands at -1 R`);
    const old = (() => { const room = roomOf(W, H); const s = lobuleShot('lobule:triad'); const half = (W < 720 ? s.halfNarrow! : s.half); const was = effectiveDistance({ ...s, half: [half[0] * 1.75, half[1] * 1.75], halfNarrow: [half[0] * 1.75, half[1] * 1.75] }, room, H, W); return (H / (2 * Math.tan((FOV * Math.PI) / 360)) / was) * LOBULE_SCALE * LOBULE_R; })();
    assert.ok(Math.abs(pxR / old - 1.75) < 0.01, `${W}x${H}: ${pxR.toFixed(0)} px per R against ${old.toFixed(0)}`);
  }
});

test('the triad, its callout ring and its collagen cuff are whole in the room on every screen, the cuff with 8 px of air or more (11 px on a phone held sideways, 30 px or more elsewhere)', () => {
  for (const [W, H] of SCREENS) {
    const { room, pxR, aim } = triadOn(W, H);
    const left = (room.w / 2) / pxR + (aim + 1), right = (room.w / 2) / pxR - (aim + 1), vert = room.h / 2 / pxR;   // room edges from the tract, in R
    const need = (what: string, x: number, y: number, air: number) => {
      assert.ok((left - x) * pxR >= air && (right - x) * pxR >= air && (vert - y) * pxR >= air, `${W}x${H}: ${what} ${(Math.min(left - x, right - x, vert - y) * pxR).toFixed(0)} px from the room's edge, needs ${air}`);
    };
    need('the cuff', REACH_R, REACH_R, 8);
    need('the ring', TRACT_RING_R, TRACT_RING_R, 12);
    need('the triad', -TRIAD_X0, TRIAD_Y, 12);
  }
});
