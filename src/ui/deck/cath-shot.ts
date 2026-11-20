// The camera's close-up of the HVPG catheter's tip (2D presenter.js cathTo: cathFocus('tip', ..., { both: true })): centred between the tip and the vein ahead of it, where the wedged reading hangs, and
// framed so the balloon just behind the tip fills the free room. 2D shows it about six times closer than the whole figure; the slice's old wedge shot was 2 to 3 times wider than that, so the balloon read as a speck.
// The frame is read from the route itself (what the balloon is: fitBalloon in devices/catheters/proc-catheter.ts), so it follows the vein's real size. Pure: no scene, no clock.
import { route3d } from '../../scene/procedures/route3d.ts';
import { OSTIUM_U } from '../../scene/procedures/ostium.ts';
import { smoothJoinsOn } from '../../scene/vessels/join-mode.ts';
import { UNITS_PER_SCENE } from '../../scene/frame2d.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import { lensDistance } from '../../scene/camera/shots.ts';

/** The turn the catheter shots keep (shots.ts free/wedge): a little off the front, because they look past the liver at the hepatic veins. */
const YAW = -0.18, PITCH = 0.04;
/** How far ahead of the tip the frame reaches, in radii of the vein the tip is in (2D: `ahead` is 6.4 of them). */
export const AHEAD_RADII = 6.4;
/** How far behind the tip the balloon reaches, in the vein's radii: the gap (4.2 catheter radii, the catheter is 0.3 of the vein) and the balloon's own length when fully up (2 x 1.6 radii), a little over. */
export const BEHIND_RADII = 4.6;

const kept = new Map<string, Shot | null>();

/** The close-up of the catheter's tip in the right hepatic vein: `tip` (free, wedged, the result) or `ostium` (a blocked vein: the tip waits at its mouth, so the frame holds the tip and the vein it cannot enter). */
export function tipCloseShot(mode: 'tip' | 'ostium' = 'tip'): Shot | null {
  const key = `${mode}|${smoothJoinsOn()}`;   // (the route is made again when the join mode changes)
  if (kept.has(key)) return kept.get(key)!;
  const r3 = route3d('hvpg');
  if (!r3) { kept.set(key, null); return null; }
  const r = r3.route, R = r3.lumen(r.free) * UNITS_PER_SCENE;   // the vein's radius in the route's own units
  const d = r3.tipD(mode === 'ostium' ? OSTIUM_U : 1);
  const a = r3.point(Math.max(0, d - R * BEHIND_RADII)), b = r3.point(Math.min(r.total, d + R * AHEAD_RADII));
  const pad = (R / UNITS_PER_SCENE) * 3.2;
  const half: [number, number] = [Math.max(0.1, Math.abs(a.x - b.x) / 2 + pad), Math.max(0.085, Math.abs(a.y - b.y) / 2 + pad)];
  const shot: Shot = { yaw: YAW, pitch: PITCH, r: lensDistance(0.3), target: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], half };
  kept.set(key, shot);
  return shot;
}

/** Whether a catheter state is read close up at the tip (the route slide shows the whole way in; the others stand at the tip). */
export const closeUpOf = (c: string | null | undefined): 'tip' | 'ostium' | null => (c === 'free' || c === 'wedge' || c === 'result' ? 'tip' : c === 'blocked' ? 'ostium' : null);
