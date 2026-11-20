// The camera's close-up of the HVPG catheter's tip (2D presenter.js cathTo: cathFocus('tip', ..., { both: true })): centred between the tip and the vein ahead of it, where the wedged reading hangs, and
// framed so the balloon just behind the tip fills the free room. 2D shows it about six times closer than the whole figure; the slice's old wedge shot was 2 to 3 times wider than that, so the balloon read as a speck.
// The frame is read from the route itself (what the balloon is: fitBalloon in devices/catheters/proc-catheter.ts), so it follows the vein's real size. Pure: no scene, no clock.
import { Vector3 } from 'three';
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
  // The viewer sees the way in (a stretch of the cava, the vein's mouth) and where the tip sits in the vein, not a macro of the balloon (Mohammad, 20 Nov: "far too tight, the vein fills the screen"):
  // the frame starts a few radii before the vein's mouth and holds the balloon and the vein ahead of the tip.
  const mouth = r3.tipD(OSTIUM_U);
  const a = r3.point(Math.max(0, Math.min(d - R * BEHIND_RADII, mouth - R * 6))), b = r3.point(Math.min(r.total, d + R * AHEAD_RADII));
  const pad = (R / UNITS_PER_SCENE) * 4;
  const half: [number, number] = [Math.max(0.3, Math.abs(a.x - b.x) / 2 + pad), Math.max(0.25, Math.abs(a.y - b.y) / 2 + pad)];
  const shot: Shot = { yaw: YAW, pitch: PITCH, r: lensDistance(0.3), target: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], half };
  kept.set(key, shot);
  return shot;
}

/** Whether a catheter state is read close up at the tip (the route slide shows the whole way in; the others stand at the tip). */
export const closeUpOf = (c: string | null | undefined): 'tip' | 'ostium' | null => (c === 'free' || c === 'wedge' || c === 'result' ? 'tip' : c === 'blocked' ? 'ostium' : null);

/** Where along a route (length, figure units) a scene point is: the nearest of its samples. */
function lengthOf(kind: string, at: { x: number; y: number; z: number }): number | null {
  const r3 = route3d(kind);
  if (!r3) return null;
  let best = Infinity, bi = 0;
  r3.pos.forEach((p, i) => { const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2 + (p.z - at.z) ** 2; if (d < best) { best = d; bi = i; } });
  return r3.route.cum[bi]!;
}

/**
 * The frame of a procedure step, derived from the step's own geometry (no per-slide numbers): the stretch of the route the step works on, its bounds in the view plane plus a margin of vein radii,
 * handed to the camera's room solver, which fits it into the free area (clear of the cards) on a phone and on a Mac alike.
 *   way  the tip's surroundings as it travels (a window of vein radii either side, moving with the tip)
 *   tip  the balloon behind the tip and the vein ahead of it; where the step works across a tract (the TIPS) the whole tract and the veins it joins
 *   fill, work  the legs the procedure works in (the route's focus legs), with the tip's surroundings
 * Pure. Null when the procedure has no route (a graft, a scope): the caller keeps its own frame.
 */
export function stepShot(kind: string, shot: string, at: { x: number; y: number; z: number }, route = kind): Shot | null {
  const r3 = route3d(route);
  if (!r3 || !['way', 'tip', 'fill', 'work'].includes(shot)) return null;
  const r = r3.route, U = UNITS_PER_SCENE, d = lengthOf(route, at) ?? r3.tipD(1);
  const R = Math.max(r3.lumen(Math.min(r.total, d)) * U, r3.rc * U * 2);
  let a = d - R * (shot === 'way' ? 12 : BEHIND_RADII), b = d + R * (shot === 'way' ? 12 : AHEAD_RADII);
  const acrossTract = r.spans.tract !== undefined;
  if (shot === 'fill' || shot === 'work' || (shot === 'tip' && acrossTract)) { a = Math.min(a, r.focus[0] - R * 1.5); b = Math.max(b, r.focus[1] + R * 1.5); }
  a = Math.max(0, a); b = Math.min(r.total, b);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zs = 0, n = 0;
  const p = new Vector3(), step = Math.max(R * 0.5, 1);
  for (let s = a; s <= b + 1e-6; s += step) { r3.point(Math.min(s, b), p); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); zs += p.z; n++; }
  if (!n) return null;
  const pad = (R / U) * 4.5;
  // (the least a frame holds, so a short stretch never shows a speck of the figure: the way in keeps its surroundings, the tip its balloon, a fill or the finished work the vein it runs in)
  const [fx, fy] = shot === 'way' ? [0.5, 0.45] : shot === 'tip' ? [0.26, 0.22] : [0.3, 0.25];
  const half: [number, number] = [Math.max(fx, (x1 - x0) / 2 + pad), Math.max(fy, (y1 - y0) / 2 + pad)];
  // (a "way" is followed by the rig: it frames the point it follows, so its target is the tip itself and the window is only its size)
  const target: [number, number, number] = shot === 'way' ? [at.x, at.y, at.z] : [(x0 + x1) / 2, (y0 + y1) / 2, zs / n];
  return { yaw: YAW, pitch: PITCH, r: lensDistance(0.3), target, half };
}
