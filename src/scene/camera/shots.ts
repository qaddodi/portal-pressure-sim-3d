import type { Vec3 } from '../anatomy/vessels.ts';
import { x3, y3 } from '../frame2d.ts';

// Named shots for the HVPG slice. A shot says what to look at (target, direction, how close at least, how much of the body it needs
// on screen); the room solver (room.ts) then fits it into whatever room the cards leave free on this device. Frontal view: the patient's
// right is on the viewer's left.

export interface Shot {
  /** Turn round the target, radians; 0 looks straight at the front, positive swings the camera to the viewer's right. */
  yaw: number;
  /** Tilt above the horizon, radians. */
  pitch: number;
  /** The nearest the camera may sit, scene units. The room solver pulls back when the subject would not fit. */
  r: number;
  target: Vec3;
  /** Half extents (scene units, in the view plane) of what the shot must keep in the free room. */
  half: [number, number];
}

export type ShotName = 'title' | 'route' | 'free' | 'wedge' | 'hvpg' | 'play' | 'pick';

// Positions are the 2D figure's own (1400 x 1000 units, the confluence at 700, 556) carried by frame2d.ts: x = (x2d - 700) / 300, y = -(y2d - 556) / 300. The figure is
// about 4.7 x 3.3 scene units; `r` is the nearest the camera may sit and `half` what the shot must keep in the free room, so the room solver does the framing.
export const SHOTS: Readonly<Record<ShotName, Shot>> = {
  // deck title: the whole figure, slow settle
  title: { yaw: 0.32, pitch: 0.06, r: 7, target: [x3(740), y3(480), 0], half: [2.0, 1.8] },
  // route: from the neck down the SVC, the right atrium and the IVC to the hepatic vein junction
  route: { yaw: -0.14, pitch: 0.06, r: 3.7, target: [x3(560), y3(70), -0.3], half: [0.8, 0.75] },
  // free: tip free in the right hepatic vein; the hepatic veins, the IVC and the liver
  free: { yaw: -0.3, pitch: 0.1, r: 3.7, target: [x3(560), y3(260), -0.2], half: [1.1, 0.87] },
  // wedge and hvpg: closer on the right lobe where the balloon sits
  wedge: { yaw: -0.3, pitch: 0.1, r: 3.0, target: [x3(540), y3(250), -0.25], half: [0.87, 0.7] },
  hvpg: { yaw: -0.3, pitch: 0.1, r: 3.0, target: [x3(540), y3(250), -0.25], half: [0.87, 0.7] },
  // free play (outside the deck): the whole splanchnic bed, then a pick on the portal tree
  play: { yaw: 0.18, pitch: 0.12, r: 7.6, target: [x3(740), y3(500), 0.2], half: [1.55, 1.75] },
  pick: { yaw: 0.18, pitch: 0.12, r: 5.5, target: [x3(740), y3(500), 0.2], half: [1.15, 1.1] },
};

/** Vertical field of view, degrees. */
export const FOV = 30;
/** Camera shot to shot: 950 ms, ease in-out cubic (look-and-feel.md section 7). */
export const SHOT_MS = 950;
/** Gentle limited orbit around the shot, radians (±25°). */
export const ORBIT_LIMIT = (25 * Math.PI) / 180;
