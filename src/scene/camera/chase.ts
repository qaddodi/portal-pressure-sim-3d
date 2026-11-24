// The chase camera (approved 24 Nov 2026, move 4 variant A; docs/approved/camera-chase.md): on a slide that runs the HVPG catheter, the camera glides in from behind and outside the tip as it advances up the cava
// into the hepatic vein, swings with the vein's bend and stops framing the wedge with the balloon up. A pure function of how far the catheter has come, so it moves exactly as the catheter does (and Back runs it
// backwards): no clock, no scene. The rig (rig.ts setChase) eases into and out of it and draws it with the lens it names.
// The numbers are the approved mock's own (/mnt/project-files/camera-move-mocks-24nov/move4-A-camera-values.md, rendered from the real scene): distance in scene units from the aim, yaw and pitch of the rig's own
// orbit formula (negative yaw puts the camera toward the viewer's left), lens 20, the aim on the vein's centreline 0.015 of the way ahead of the tip. The mock's five frames are its keyframes, but from the second on pulled well back (final 2.4) (Mohammad, 24 Nov, twice: "zoomed out a bit", then "we agreed to make this view zoomed out"): the wedge frame holds the balloon behind the tip AND the vein ahead where the WHVP reading is taken (its leader ran to a dot off the left edge when the camera was at 0.75 to 1.0: the point 6.4 radii ahead of the tip was out of the picture), with the vein and liver round it.
import { Vector3 } from 'three';
import { route3d, type Route3D } from '../procedures/route3d.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';

/** The mock's five frames: the catheter's advance (the share of its way in), the distance from the aim (scene units), yaw and pitch (radians). */
export const CHASE_KEYS: readonly { u: number; d: number; yaw: number; pitch: number }[] = [
  { u: 0.62, d: 4.2, yaw: 0, pitch: 0.05 },
  { u: 0.74, d: 3.5, yaw: -0.12, pitch: 0.06 },
  { u: 0.82, d: 3.0, yaw: -0.3, pitch: 0.1 },
  { u: 0.92, d: 2.7, yaw: -0.45, pitch: 0.14 },
  { u: 0.995, d: 2.4, yaw: -0.55, pitch: 0.16 },
];
/** The lens the chase is shot on (degrees; the figure's rest lens is 14). */
export const CHASE_FOV = 20;
/** The aim is this far ahead of the tip, as a share of the way, at first; by the wedge it has moved to the middle of the stretch the readings use (below). */
export const CHASE_AHEAD = 0.015;
/** The stretch the wedge frame must hold, in radii of the vein the tip is in (cath-shot.ts AHEAD_RADII and BEHIND_RADII: the vein ahead where the wedged reading is taken, and the balloon behind): the aim moves to its middle as the tip arrives, and the distance (CHASE_KEYS) is enough to show all of it on a phone. */
export const CHASE_AHEAD_RADII = 6.4, CHASE_BEHIND_RADII = 4.6;

export interface ChasePose { yaw: number; pitch: number; dist: number; fov: number; target: [number, number, number] }

/** The geometry a chase reads: the route's own samples. (Route3D satisfies it; a test may give its own.) */
export type ChaseRoute = Pick<Route3D, 'point' | 'tipD'> & Partial<Pick<Route3D, 'lumen'>>;

/** A monotone cubic through the keys (Fritsch-Carlson), so the camera passes each approved frame exactly and never overshoots or stops between them. `f` picks the value; distance goes through its log (a geometric glide). */
function through(u: number, f: (k: (typeof CHASE_KEYS)[number]) => number): number {
  const K = CHASE_KEYS, n = K.length;
  if (u <= K[0]!.u) return f(K[0]!);
  if (u >= K[n - 1]!.u) return f(K[n - 1]!);
  let i = 0;
  while (u > K[i + 1]!.u) i++;
  const x = K.map((k) => k.u), y = K.map(f), h = x.slice(1).map((v, j) => v - x[j]!), s = h.map((hh, j) => (y[j + 1]! - y[j]!) / hh);
  const m = y.map((_, j) => (j === 0 ? s[0]! : j === n - 1 ? s[n - 2]! : s[j - 1]! * s[j]! <= 0 ? 0 : (s[j - 1]! + s[j]!) / 2));
  for (let j = 0; j < n - 1; j++) {
    if (s[j] === 0) { m[j] = 0; m[j + 1] = 0; continue; }
    const a = m[j]! / s[j]!, b = m[j + 1]! / s[j]!, q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); m[j] = t * a * s[j]!; m[j + 1] = t * b * s[j]!; }
  }
  const t = (u - x[i]!) / h[i]!, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y[i]! + (t3 - 2 * t2 + t) * h[i]! * m[i]! + (-2 * t3 + 3 * t2) * y[i + 1]! + (t3 - t2) * h[i]! * m[i + 1]!;
}

/** The camera for the tip at share `u` of its way (0 at the start of the route, 1 at the vein's end). */
export function chaseAt(r: ChaseRoute, u: number, out?: ChasePose): ChasePose {
  const s = Math.min(1, Math.max(0, u)), tipD = r.tipD(s);
  // the aim: just ahead of the tip, moving to the middle of (balloon behind, vein ahead) as the tip arrives, so the wedged reading's point stays in the frame with the tip
  const w = ((x) => x * x * (3 - 2 * x))(Math.min(1, Math.max(0, (s - 0.82) / 0.18)));
  const R = r.lumen ? r.lumen(tipD) * UNITS_PER_SCENE : 0;
  const mid = (CHASE_AHEAD_RADII - CHASE_BEHIND_RADII) / 2 * R;
  const a = r.point(Math.min(r.tipD(1), tipD + CHASE_AHEAD * (r.tipD(1) - r.tipD(0)) * (1 - w) + mid * w), new Vector3());
  const o = out ?? { yaw: 0, pitch: 0, dist: 0, fov: 0, target: [0, 0, 0] };
  o.yaw = through(s, (k) => k.yaw); o.pitch = through(s, (k) => k.pitch); o.dist = Math.exp(through(s, (k) => Math.log(k.d))); o.fov = CHASE_FOV;
  o.target[0] = a.x; o.target[1] = a.y; o.target[2] = a.z;
  return o;
}

/** The chase for the HVPG route as the figure draws it now, or null when the route is not there. */
export function hvpgChase(u: number, out?: ChasePose): ChasePose | null {
  const r3 = route3d('hvpg');
  return r3 ? chaseAt(r3, u, out) : null;
}
