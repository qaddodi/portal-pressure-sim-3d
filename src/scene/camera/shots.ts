import type { Vec3 } from '../anatomy/vessels.ts';
import { x3, y3 } from '../frame2d.ts';
import { pointShift } from '../editor-anchors.ts';

/** A catheter shot's target on the figure (2D units, `z` depth), anchored to the vessels it looks at: it keeps its offset from the nearest point of those vessels' courses, so every edit of them (a node, a control point, a depth) carries it (the same point unedited). The rest shots (title, play, pick) frame the whole figure and have no anchor. */
const near = (x: number, y: number, z: number, on: readonly string[]): Vec3 => { const [dx, dy, dz] = pointShift(x, y, on); return [x3(x + dx), y3(y + dy), z + dz]; };
const HV_VESSELS = ['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC'], ROUTE_VESSELS = ['SVC_RA_1', 'SVC_RA', 'IVCS_RA', 'IVC_IS'];
/** The shots that frame the whole figure, and so follow no edit. */
export const UNANCHORED_SHOTS: readonly ShotName[] = ['title', 'play', 'pick'];

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
  /** The camera's roll about its view axis, radians (0 when left out): the picture turns the other way. A shot's own (the sinusoid on a portrait screen: sinusoid/portrait.ts), carried through every move so the
   *  whole picture (the lobule and the sinusoid with it) turns as ONE camera move, never one thing turning alone. */
  roll?: number;
  /** Half extents (scene units, in the view plane) of what the shot must keep in the free room. */
  half: [number, number];
  /** The half extents on a narrow stage (a phone, under `NARROW_STAGE` px wide), where the shot is framed differently (the lobule's: 2D's phone frame box). */
  halfNarrow?: [number, number];
}

/** A stage narrower than this is a phone (2D: `phoneMQ`, the lobule's `W < 720`). */
export const NARROW_STAGE = 720;

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
  route: { yaw: -0.1, pitch: 0, r: lensDistance(3.7), target: near(560, 70, -0.3, ROUTE_VESSELS), half: [0.8, 0.75] },
  // free: tip free in the right hepatic vein; the hepatic veins, the IVC and the liver
  free: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.7), target: near(560, 260, -0.2, HV_VESSELS), half: [1.1, 0.87] },
  // wedge and hvpg: closer on the right lobe where the balloon sits
  wedge: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.0), target: near(540, 250, -0.25, HV_VESSELS), half: [0.87, 0.7] },
  hvpg: { yaw: -0.18, pitch: 0.04, r: lensDistance(3.0), target: near(540, 250, -0.25, HV_VESSELS), half: [0.87, 0.7] },
  // free play (outside the deck): the whole splanchnic bed, then a pick on the portal tree
  // (what the figure draws, measured: the organs' outlines and the vessels' courses together run x 321 to 1104 and y -90 to 1072 in the 2D units (the esophagus's top to the colon's foot), so the middle is (712, 491) and
  // the half extents 1.31 by 1.94. The plate (PLATE_BOUNDS, 380 to 1100 by 0 to 1000) is less than that: framing it cut the foot off in a short room, with the Tests sheet up and in a talk. tests/atlas-camera.test.ts measures them.)
  play: { yaw: 0, pitch: 0, r: lensDistance(7.6), target: [x3(712), y3(491), 0.2], half: [1.32, 1.94] },
  pick: { yaw: 0, pitch: 0, r: lensDistance(5.5), target: [x3(740), y3(500), 0.2], half: [1.15, 1.1] },
};

/** Camera shot to shot: 950 ms, ease in-out cubic (look-and-feel.md section 7). */
export const SHOT_MS = 950;
/** Gentle limited orbit around the shot, radians (±25°). */
/** The two limits of the viewer's turn, in one place (owner, 20 Nov: tune by feel): left and right, and up and down (tighter). Both stop softly (rig.ts softLimit). */
export const TURN_LIMIT_DEG = 25, TILT_LIMIT_DEG = 12;
export const ORBIT_LIMIT = (TURN_LIMIT_DEG * Math.PI) / 180;
export const TILT_LIMIT = (TILT_LIMIT_DEG * Math.PI) / 180;
/** Fit brings a turn home as a critically damped spring (`orbitHome` in rig.ts); `ORBIT_HOME_OMEGA` is its stiffness, rad/s: about 1.3 s to settle. A free drag is not brought home: the angle the viewer left stays. */
export const ORBIT_HOME_OMEGA = 7;
