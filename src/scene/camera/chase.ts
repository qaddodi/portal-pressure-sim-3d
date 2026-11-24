// The chase camera (approved 24 Nov 2026, move 4 variant A; docs/approved/camera-chase.md): on a slide that runs the HVPG catheter, the camera glides in from behind and outside the tip as it advances
// up the cava into the hepatic vein, swings with the vein's bends and stops framing the wedge with the balloon up. A pure function of how far the catheter has come, so it moves exactly as the
// catheter does (and Back runs it backwards): no clock, no scene. The rig (rig.ts setChase) eases into and out of it and draws it with the lens it names.
import { Vector3 } from 'three';
import { route3d, type Route3D } from '../procedures/route3d.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';

/** From the tip, scene units: far at the mouth of the route (the whole liver in view), close at the vein's end (the wedge). The approved mock: "glides 4.2 to 0.75 from the tip". */
export const CHASE_FAR = 4.2, CHASE_NEAR = 0.75;
/** How far the camera swings round the tip, at most (radians, 32 degrees), to the OUTSIDE of the vein's bend. */
export const CHASE_SWING = (32 * Math.PI) / 180;
/** The lens the chase is shot on (degrees; the figure's rest lens is 14). */
export const CHASE_FOV = 20;
/** A little tilt above the horizon, as the catheter shots have (shots.ts free). */
export const CHASE_PITCH = 0.04;
/** The aim sits this share of the camera's distance AHEAD of the tip along the vein, so the balloon behind the tip and the vein ahead of it fill the frame. */
export const CHASE_AHEAD = 0.2;

export interface ChasePose { yaw: number; pitch: number; dist: number; fov: number; target: [number, number, number] }

/** The geometry a chase reads: the route's own samples. (Route3D satisfies it; a test may give its own.) */
export type ChaseRoute = Pick<Route3D, 'point' | 'dir' | 'tipD'>;

/** The window the bend is shared out over: this share of the way either side of the tip, and the samples taken in it. */
const WINDOW = 0.18, WINDOW_N = 9;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
const heading = (v: Vector3): number => Math.atan2(v.y, v.x);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

const kept = new Map<string, { turnEnd: number }>();
/** How far the route's heading has turned, in the view plane, from its start to the end of the way (signed, radians): what the swing is shared out by. */
function turnEndOf(r: ChaseRoute): number {
  const h0 = heading(r.dir(r.tipD(0), new Vector3()));
  return wrap(heading(r.dir(r.tipD(1), new Vector3())) - h0);
}

/** The camera for the tip at share `u` (0 at the start of the route, 1 at the vein's end) of its way. */
export function chaseAt(r: ChaseRoute, u: number, out?: ChasePose): ChasePose {
  const s = Math.min(1, Math.max(0, u)), d = r.tipD(s), tip = r.point(d, new Vector3()), t = r.dir(d, new Vector3());
  const key = `${smoothJoinsOn()}|${r.tipD(1).toFixed(3)}`;
  if (!kept.has(key)) kept.set(key, { turnEnd: turnEndOf(r) });
  const turnEnd = kept.get(key)!.turnEnd;
  // the swing grows with how much of the route's whole turn the tip has made, so the camera opens round the bend as the vein bends; it goes to the outside of the turn. The vein turns sharply at its mouth, so the share is
  // the turn averaged over a stretch of the route either side of the tip (a window of WINDOW of the way): the camera opens round the corner over a stretch, not in a step.
  const d0 = r.tipD(0), d1 = r.tipD(1), h0 = heading(r.dir(d0, new Vector3())), v = new Vector3();
  let sum = 0;
  for (let i = 0; i < WINDOW_N; i++) {
    const du = ((i / (WINDOW_N - 1)) * 2 - 1) * WINDOW, di = Math.min(d1, Math.max(d0, r.tipD(Math.min(1, Math.max(0, s + du)))));
    sum += Math.abs(turnEnd) > 1e-3 ? Math.min(1, Math.max(0, wrap(heading(r.dir(di, v)) - h0) / turnEnd)) : 0;
  }
  const share = sum / WINDOW_N;
  const side = turnEnd >= 0 ? -1 : 1;
  const dist = CHASE_FAR * Math.pow(CHASE_NEAR / CHASE_FAR, smooth(s));
  const a = r.point(Math.min(r.tipD(1), d + CHASE_AHEAD * dist), new Vector3());
  const o = out ?? { yaw: 0, pitch: 0, dist: 0, fov: 0, target: [0, 0, 0] };
  o.yaw = side * CHASE_SWING * smooth(share); o.pitch = CHASE_PITCH; o.dist = dist; o.fov = CHASE_FOV;
  o.target[0] = a.x; o.target[1] = a.y; o.target[2] = a.z;
  return o;
}

/** The chase for the HVPG route as the figure draws it now, or null when the route is not there. */
export function hvpgChase(u: number, out?: ChasePose): ChasePose | null {
  const r3 = route3d('hvpg');
  return r3 ? chaseAt(r3, u, out) : null;
}
