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

/** Vertical field of view, degrees. The anatomy is a long lens (atlas-look-plan §6, owner's decision B, 19 Nov): at rest the figure is nearly
 *  orthographic, so the 3D plate lines up with the 2D app's flat one and a turn still shows depth. (30° until 19 Nov.) */
export const FOV = 14;
/** The distance that frames, at `FOV`, what a 30° lens framed at `r`: the shots below were set for the 30° lens, and the distance scales by the ratio of the half-angle tangents. */
export const lensDistance = (r: number, fov = FOV): number => (r * Math.tan((15 * Math.PI) / 180)) / Math.tan((fov * Math.PI) / 360);

// Positions are the 2D figure's own (1400 x 1000 units, the confluence at 700, 556) carried by frame2d.ts: x = (x2d - 700) / 300, y = -(y2d - 556) / 300. The figure is
// about 4.7 x 3.3 scene units; `r` is the nearest the camera may sit and `half` what the shot must keep in the free room, so the room solver does the framing.
// The rest shots (title, play, pick) look straight at the plate (yaw 0, pitch 0): that is the atlas, and what the 2D app shows. The orbit is the reward for touching
// (the drag turns it, ±25°, and it springs back to the shot: gesture/controller.ts). The catheter shots keep a small turn, because they look past the liver at the hepatic veins.
export const SHOTS: Readonly<Record<ShotName, Shot>> = {
  // deck title: the whole figure, slow settle
  title: { yaw: 0, pitch: 0, r: lensDistance(7), target: [x3(740), y3(480), 0], half: [2.0, 1.8] },
  // route: from the neck down the SVC, the right atrium and the IVC to the hepatic vein junction
  route: { yaw: -0.1, pitch: 0, r: lensDistance(3.7), target: [x3(560), y3(70), -0.3], half: [0.8, 0.75] },
  // free: tip free in the right hepatic vein; the hepatic veins, the IVC and the liver
  free: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.7), target: [x3(560), y3(260), -0.2], half: [1.1, 0.87] },
  // wedge and hvpg: closer on the right lobe where the balloon sits
  wedge: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.0), target: [x3(540), y3(250), -0.25], half: [0.87, 0.7] },
  hvpg: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.0), target: [x3(540), y3(250), -0.25], half: [0.87, 0.7] },
  // free play (outside the deck): the whole splanchnic bed, then a pick on the portal tree
  // (what the figure draws, measured: the organs' outlines and the vessels' courses together run x 321 to 1104 and y -90 to 1072 in the 2D units (the esophagus's top to the colon's foot), so the middle is (712, 491) and
  // the half extents 1.31 by 1.94. The plate (PLATE_BOUNDS, 380 to 1100 by 0 to 1000) is less than that: framing it cut the foot off in a short room, with the Tests sheet up and in a talk. tests/atlas-camera.test.ts measures them.)
  play: { yaw: 0, pitch: 0, r: lensDistance(7.6), target: [x3(712), y3(491), 0.2], half: [1.32, 1.94] },
  pick: { yaw: 0, pitch: 0, r: lensDistance(5.5), target: [x3(740), y3(500), 0.2], half: [1.15, 1.1] },
};

/** Camera shot to shot: 950 ms, ease in-out cubic (look-and-feel.md section 7). */
export const SHOT_MS = 950;
/** Gentle limited orbit around the shot, radians (±25°). */
export const ORBIT_LIMIT = (25 * Math.PI) / 180;
/** Fit brings a turn home as a critically damped spring (`orbitHome` in rig.ts); `ORBIT_HOME_OMEGA` is its stiffness, rad/s: about 1.3 s to settle. A free drag is not brought home: the angle the viewer left stays. */
export const ORBIT_HOME_OMEGA = 7;
