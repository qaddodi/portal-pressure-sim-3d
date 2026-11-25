import type { Vec3 } from '../anatomy/vessels.ts';
import { x3, y3 } from '../frame2d.ts';
import { boxOfNames, centreOf, FIGURE_NAMES, VISIBLE_FIGURE_NAMES, type Box3 } from '../anatomy/source.ts';

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
  /** Points (scene x, y) that must stand `KEEP_PX` or more inside the free room, whatever room the cards leave: the stations a slide labels (decks/hp/cams.ts withStations). The room solver (room.ts `effectiveDistance`) pulls back until they do, so the margin is in pixels on every device, never in scene units. */
  keep?: readonly (readonly [number, number])[];
  /** The share of the free room the half extents may fill (room.ts FILL when left out). The whole-figure frames carry WHOLE_FILL: their ends fade, so they stand nearer the room's edge (Mohammad, 25 Nov: "decrease the upper and lower margin ... so it's more zoomed"). */
  fill?: number;
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
const TODAY_SHOTS: Readonly<Record<ShotName, Shot>> = {
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


/** What each named shot is about, by name (organs, engine edges, whole-vessel keys: anatomy/placed-bounds.ts). Placed, the shot keeps its turn, tilt, nearest distance and room, and follows
 *  its subject: the target moves as the subject's middle moved, it looks at the subject's own depth, and the room grows where the subject would no longer fit in it. */
export const SHOT_SUBJECTS: Readonly<Record<ShotName, readonly string[]>> = {
  title: FIGURE_NAMES,
  route: ['V_UP', 'SVC_RA_1', 'SVC_RA', 'heart-ra', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'RHV_IVC_1'],
  free: ['RHV_IVC', 'RHV_IVC_1', 'rhva', 'rhvb', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'IVC_IS', 'liver'],
  // (the wedge sits in the main right hepatic vein's trunk, short of its fork: Mohammad 24 Nov, docs/approved/anatomy-placement.md; the frame keeps the fork and its branches round it)
  wedge: ['RHV_IVC', 'RHV_IVC_1', 'rhva', 'rhvb', 'IVC_IS'],
  hvpg: ['RHV_IVC', 'RHV_IVC_1', 'rhva', 'rhvb', 'IVC_IS'],
  play: VISIBLE_FIGURE_NAMES,
  pick: ['PV_TRUNK', 'PV_TRUNK_1', 'SV_CONF', 'SV_MID', 'V_SPL', 'SMV_CONF', 'V_INT', 'V_INT_1', 'V_IMV', 'V_COL', 'LGV_CONF', 'PVH_R', 'PVH_R_1', 'PVH_R_2', 'PVH_L', 'PVH_L_1', 'rpva', 'rpvp'],
};

/** The camera's right and up in the scene for a turn and tilt (the rig's: positive yaw swings the camera to the viewer's right, the camera at target + r (sin yaw cos pitch, sin pitch, cos yaw cos pitch)). */
export function viewAxes(yaw: number, pitch: number): { right: Vec3; up: Vec3 } {
  return { right: [Math.cos(yaw), 0, -Math.sin(yaw)], up: [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)] };
}
/** How far a box reaches from a shot's target across the view, scene units (right, up): what the shot's half extents must hold for the box to be in the room. */
export function viewReach(b: Box3, s: Pick<Shot, 'yaw' | 'pitch' | 'target'>): [number, number] {
  const { right, up } = viewAxes(s.yaw, s.pitch);
  let rx = 0, ry = 0;
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
    const d = [x - s.target[0], y - s.target[1], z - s.target[2]] as const;
    rx = Math.max(rx, Math.abs(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]));
    ry = Math.max(ry, Math.abs(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]));
  }
  return [rx, ry];
}
/** The room kept round a placed subject inside a shot's half extents, scene units (about 1 cm of body). */
export const SHOT_MARGIN = 0.04;
/** The whole figure's share of the free room and the margin kept round it (Mohammad, 25 Nov: "Zoom fit: decrease the upper and lower margin between end of figure and UI so it's more zoomed"; then "there is still quite a bit of margin, it doesn't look centered"). The margin is 0.01 (a part keeps SHOT_MARGIN 0.04).
 *  Free play (the Fit button's frame) fills WHOLE_FILL 0.92 of the room, the most its names allow today: at 0.93 the right sinusoids' name finds no place on a 393 pt phone (tests/labels-give-way.test.ts). A talk's overview has its stations held by `keep`, so it fills DECK_WHOLE_FILL 0.94. */
/** How much of the way from the 2D plate's old aim to the figure's own middle the figure is carried across: 0.75 leaves it 3 pt off centre on a phone (it was 12.5). All the way takes the right sinusoids' name out of the phone's figure (tests/labels-give-way.test.ts, phone 393): its dot stands 97 px from the left edge. */
export const WHOLE_CENTRE_X = 0.75;
export const WHOLE_FILL = 0.92, DECK_WHOLE_FILL = 0.94, WHOLE_MARGIN = 0.01;
/** A shot carried onto the placed anatomy: the same turn, tilt and nearest distance; the target moved as its subject's middle moved, at the subject's depth; the half extents the shot's own,
 *  grown only where the placed subject would reach past them. */
export function placedShot(s: Shot, names: readonly string[], margin = SHOT_MARGIN): Shot {
  const was = boxOfNames(names, false).box, now = boxOfNames(names, true).box;
  if (!was || !now) throw new Error(`a shot names nothing placed: ${names.join(', ')}`);
  const cw = centreOf(was), cn = centreOf(now);
  const target: Vec3 = [s.target[0] + cn[0] - cw[0], s.target[1] + cn[1] - cw[1], cn[2]];
  const reach = viewReach(now, { ...s, target });
  const grow = (h: number, k: 0 | 1) => Math.max(h, reach[k] + margin);
  return { ...s, target, half: [grow(s.half[0], 0), grow(s.half[1], 1)], ...(s.halfNarrow ? { halfNarrow: [grow(s.halfNarrow[0], 0), grow(s.halfNarrow[1], 1)] as [number, number] } : {}) };
}
/** The whole figure as a shot (free play): aimed at the middle of the organs' silhouette (VISIBLE_FIGURE_NAMES), across and up and down, and framed on what it reaches plus WHOLE_MARGIN. Root cause of the lopsided figure (Mohammad, 25 Nov, a phone screenshot: 68 pt of empty room on the left and 43 on the right, 37 above and 23 below, measured
 *  on the organs): the aim was the 2D plate's (712, 491) carried across, not the figure's own middle, and the frame took in the vessels and the esophagus' faded top as well. */
function wholeFigureShot(s: Shot, names: readonly string[]): Shot {
  const now = boxOfNames(names, true).box, was = boxOfNames(names, false).box;
  if (!now || !was) throw new Error('the whole figure names nothing placed');
  const c = centreOf(now), cw = centreOf(was);
  // (across: the figure's middle, less WHOLE_OFF_LEFT of the way back to where the 2D plate's aim stood; up and down: the figure's own middle)
  const old = s.target[0] + c[0] - cw[0], target: Vec3 = [c[0] + (old - c[0]) * (1 - WHOLE_CENTRE_X), c[1], c[2]], reach = viewReach(now, { ...s, target });
  return { ...s, target, half: [reach[0] + WHOLE_MARGIN, reach[1] + WHOLE_MARGIN], fill: WHOLE_FILL };
}
export const SHOTS: Readonly<Record<ShotName, Shot>> = Object.fromEntries(Object.entries(TODAY_SHOTS).map(([k, s]) => [k, k === 'play' ? wholeFigureShot(s, SHOT_SUBJECTS.play) : placedShot(s, SHOT_SUBJECTS[k as ShotName])])) as Record<ShotName, Shot>;

/** Camera shot to shot: 950 ms, ease in-out cubic (look-and-feel.md section 7). */
export const SHOT_MS = 950;
/** Gentle limited orbit around the shot, radians (±25°). */
/** (owner, 25 Nov: vertical tilt 20 degrees; the turn about the vertical axis is free all the way round in the body and the lobule, 25 degrees elsewhere.) The two limits of the viewer's turn, in one place (owner, 20 Nov: tune by feel): left and right, and up and down (tighter). Both stop softly (rig.ts softLimit). */
export const TURN_LIMIT_DEG = 25, TILT_LIMIT_DEG = 20;
export const ORBIT_LIMIT = (TURN_LIMIT_DEG * Math.PI) / 180;
export const TILT_LIMIT = (TILT_LIMIT_DEG * Math.PI) / 180;
/** Fit brings a turn home as a critically damped spring (`orbitHome` in rig.ts); `ORBIT_HOME_OMEGA` is its stiffness, rad/s: about 1.3 s to settle. A free drag is not brought home: the angle the viewer left stays. */
export const ORBIT_HOME_OMEGA = 7;
