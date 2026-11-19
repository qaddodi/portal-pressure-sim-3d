import type { Vec3 } from '../anatomy/vessels.ts';

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

export const SHOTS: Readonly<Record<ShotName, Shot>> = {
  // deck title: the whole body plate, slow settle
  title: { yaw: 0.32, pitch: 0.06, r: 11.5, target: [0.1, 0.35, 0], half: [2.6, 3.4] },
  // route: from the neck down the SVC, the right atrium and the IVC to the hepatic vein junction
  route: { yaw: -0.14, pitch: 0.06, r: 6.4, target: [-0.55, 2.0, -0.5], half: [1.5, 1.9] },
  // free: tip free in the right hepatic vein; the hepatic veins, the IVC and the liver
  free: { yaw: -0.3, pitch: 0.1, r: 6.4, target: [-0.55, 1.15, -0.2], half: [1.9, 1.5] },
  // wedge and hvpg: closer on the right lobe where the balloon sits
  wedge: { yaw: -0.3, pitch: 0.1, r: 5.2, target: [-0.85, 1.2, -0.25], half: [1.5, 1.2] },
  hvpg: { yaw: -0.3, pitch: 0.1, r: 5.2, target: [-0.85, 1.2, -0.25], half: [1.5, 1.2] },
  // free play (outside the deck): the whole splanchnic bed, then a pick on the portal tree
  play: { yaw: 0.18, pitch: 0.12, r: 13, target: [0.15, 0.55, 0.2], half: [2.4, 2.6] },
  pick: { yaw: 0.18, pitch: 0.12, r: 9.5, target: [0.15, 0.55, 0.2], half: [2.0, 1.9] },
};

/** Vertical field of view, degrees. */
export const FOV = 30;
/** Camera shot to shot: 950 ms, ease in-out cubic (look-and-feel.md section 7). */
export const SHOT_MS = 950;
/** Gentle limited orbit around the shot, radians (±25°). */
export const ORBIT_LIMIT = (25 * Math.PI) / 180;
