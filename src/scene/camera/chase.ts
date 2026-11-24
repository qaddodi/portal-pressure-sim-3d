// The chase camera (approved 24 Nov 2026, move 4 variant A; docs/approved/camera-chase.md): on a slide that runs the HVPG catheter, the camera glides in from behind and outside the tip as it advances up the cava
// into the hepatic vein, swings with the vein's bend and stops framing the wedge with the balloon up. A pure function of how far the catheter has come, so it moves exactly as the catheter does (and Back runs it
// backwards): no clock, no scene. The rig (rig.ts setChase) eases into and out of it and draws it with the lens it names.
// The numbers are the approved mock's own (/mnt/project-files/camera-move-mocks-24nov/move4-A-camera-values.md, rendered from the real scene): distance in scene units from the aim, yaw and pitch of the rig's own
// orbit formula (negative yaw puts the camera toward the viewer's left), lens 20, the aim on the vein's centreline 0.015 of the way ahead of the tip. The mock's five frames are its keyframes.
import { Vector3 } from 'three';
import { route3d, type Route3D } from '../procedures/route3d.ts';

/** The mock's five frames: the catheter's advance (the share of its way in), the distance from the aim (scene units), yaw and pitch (radians). */
export const CHASE_KEYS: readonly { u: number; d: number; yaw: number; pitch: number }[] = [
  { u: 0.62, d: 4.2, yaw: 0, pitch: 0.05 },
  { u: 0.74, d: 2.6, yaw: -0.12, pitch: 0.06 },
  { u: 0.82, d: 1.7, yaw: -0.3, pitch: 0.1 },
  { u: 0.92, d: 1.1, yaw: -0.45, pitch: 0.14 },
  { u: 0.995, d: 0.75, yaw: -0.55, pitch: 0.16 },
];
/** The lens the chase is shot on (degrees; the figure's rest lens is 14). */
export const CHASE_FOV = 20;
/** The aim is this far ahead of the tip, as a share of the way. */
export const CHASE_AHEAD = 0.015;

export interface ChasePose { yaw: number; pitch: number; dist: number; fov: number; target: [number, number, number] }

/** The geometry a chase reads: the route's own samples. (Route3D satisfies it; a test may give its own.) */
export type ChaseRoute = Pick<Route3D, 'point' | 'tipD'>;

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
  const s = Math.min(1, Math.max(0, u)), a = r.point(r.tipD(Math.min(1, s + CHASE_AHEAD)), new Vector3());
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
