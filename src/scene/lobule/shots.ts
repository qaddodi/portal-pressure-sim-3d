// The lobule's and the sinusoid's camera shots, as the 2D app's slide cameras name them (decks: cam 'lobule' | 'lobule:fit' | 'lobule:triad' |
// 'lobule:sinusoid' | 'lobule:central' | 'sinusoid'). A shot is the same `Shot` the rest of the scene uses, so `sceneApi.goTo(shot, room)` flies to
// it straight from wherever the camera is (no fit waypoint, 950 ms), fitted into the room the cards leave free.
//
// The views are INSIDE the liver (owner, 19 Nov: "the lobule and sinusoid views have to be INSIDE, like a dive in"). The lobule is built in its own
// local units (R = 3, a slab 0.9 thick) and stands at a point inside the right lobe, at LOBULE_SCALE of the scene (frames.ts); the sinusoid is built
// in its own units and stands inside the lobule, at a sinusoid, one more step down. Opening a view is therefore one straight camera dive from the body:
// anatomy, liver, lobule, sinusoid, and back out the same way. Nothing is built or moved to open one (the views open instantly, owner 17 Nov).
// The shots here are in WORLD units (local × the frame's scale, plus its place), so `goTo` needs nothing else.
import type { Shot } from '../camera/shots.ts';
import type { V3 } from './batch.ts';
import { LOBULE_SCALE, SIN_SCALE, lobuleWorld, sinusoidWorld } from './frames.ts';
import { FILL } from '../camera/room.ts';
import { acrossUm } from '../sinusoid/portrait.ts';
/** Micrometres across the stretch the sinusoid's own shot frames: `SPAN_UM` of sinusoid/view.ts, kept here so the shots do not import the view. */
const SPAN_UM = 97.4;

/** The lobule's radius in scene units (the body plate is about 4.6 wide) and the slab's thickness. */
export const LOBULE_R = 3;
export const LOBULE_T = 0.9;
/** The views' own origins: each is built around its own (0, 0, 0); frames.ts puts the lobule inside the liver and the sinusoid inside the lobule. */
export const LOBULE_ORIGIN: V3 = [0, 0, 0];
export const SINUSOID_ORIGIN: V3 = [0, 0, 0];
/** The sinusoid's drawn length (portal end at -L/2, central vein end at +L/2). */
export const SINUSOID_L = 6;

export type LobuleCam = 'lobule' | 'lobule:fit' | 'lobule:triad' | 'lobule:sinusoid' | 'lobule:central' | 'sinusoid';
export const LOBULE_CAMS: readonly LobuleCam[] = ['lobule', 'lobule:fit', 'lobule:triad', 'lobule:sinusoid', 'lobule:central', 'sinusoid'];

/** The 2D app's framing of a part: how far from the portal corner (the left one, at angle π) toward the centre the station is, and the zoom over the fit. */
const STATION = {
  fit: { wf: 1, zoom: 1 },
  triad: { wf: 0.12, zoom: 2 },
  sinusoid: { wf: 0.5, zoom: 2 },
  central: { wf: 1, zoom: 2 },
} as const;

/** Face on, as 2D shows the lobule: a flat plate seen square (decision B of the atlas plan). The viewer can still orbit from here (the camera rig's limit). */
const YAW = 0, PITCH = 0;
/** Half extents of the whole lobule's hexagon in the view plane (a hexagon of radius R: R wide, 0.866 R high, with the neighbours' hint). */
const FIT_HALF: [number, number] = [LOBULE_R * 1.12, LOBULE_R * 1.0];

/** The shot for a lobule camera name (world units: inside the liver). */
export function lobuleShot(cam: LobuleCam): Shot {
  const [ox, oy, oz] = LOBULE_ORIGIN;
  if (cam === 'sinusoid') return sinusoidShot();
  const part = cam === 'lobule' || cam === 'lobule:fit' ? 'fit' : (cam.slice(7) as 'triad' | 'sinusoid' | 'central');
  const st = STATION[part];
  // the corner at angle π (x = -1) is the portal tract the 2D framing starts from; the station lies wf of the way from it to the centre.
  // The whole lobule and the central vein look at the centre.
  const along = part === 'fit' || part === 'central' ? 0 : -1 + st.wf;
  return {
    yaw: YAW, pitch: PITCH,
    r: (part === 'fit' ? 6 : 2.5) * LOBULE_SCALE,
    target: lobuleWorld([ox + along * LOBULE_R, oy, oz]),
    half: [(FIT_HALF[0] / st.zoom) * LOBULE_SCALE, (FIT_HALF[1] / st.zoom) * LOBULE_SCALE],
  };
}

/** The sinusoid view's shot: the whole length of one cut sinusoid, portal end left (world units: inside the lobule). On a portrait screen (2D: W < H * 0.95) the sinusoid runs top to bottom (the view's
 *  plane is turned, sinusoid/portrait.ts), so the half extents swap. `shortPx`, the free room's short side in CSS px, gives 2D's own framing (sinusoid-view.js ensureGeo: lerp(40, 54, smooth(380, 720, short))
 *  µm across the short side, plates cut by the edges on a phone, both whole on a large screen); without it the whole stretch is kept in view. */
export function sinusoidShot(portrait = false, shortPx?: number): Shot {
  const [ox, oy, oz] = SINUSOID_ORIGIN;
  const along = (SINUSOID_L / 2 + 0.4) * SIN_SCALE, across = 1.9 * SIN_SCALE;
  // (the room fits the longer of the two needs: both halves at the short side's own half make the short side show exactly `acrossUm`, the long side as much as the screen's shape gives)
  const short = shortPx != null && shortPx > 0 ? (acrossUm(shortPx) / 2) * FILL * (SINUSOID_L / SPAN_UM) * SIN_SCALE : null;   // (the room keeps FILL of itself for the subject: 2D shows `across` over the whole short side)
  const half: [number, number] = short != null ? [short, short] : portrait ? [across, along] : [along, across];
  return { yaw: 0, pitch: 0, r: 3 * SIN_SCALE, target: sinusoidWorld([ox, oy, oz]), half };
}

/** The corners (scene units) of the box the hand's pan and zoom keep on screen while the sinusoid is the view: the stretch and a plate either side, turned as the plane is turned (portrait: top to bottom). */
export function sinusoidBox(portrait = false): V3[] {
  const out: V3[] = [], c = portrait ? 0 : 1, s = portrait ? -1 : 0;   // (cos, sin of the plane's turn: PORTRAIT_ANGLE is -PI/2)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (SINUSOID_L / 2 + 0.3), y = sy * 1.4;
    out.push(sinusoidWorld([x * c - y * s, x * s + y * c, sz * 1.0]));
  }
  return out;
}

/** Lobule coordinates (the 2D plane: x right, y DOWN, in lobule radii) to the lobule's own local units, on the slab's middle plane plus z. */
export function lobuleToScene(x: number, y: number, z = 0, out: V3 = [0, 0, 0]): V3 {
  out[0] = LOBULE_ORIGIN[0] + x * LOBULE_R; out[1] = LOBULE_ORIGIN[1] - y * LOBULE_R; out[2] = LOBULE_ORIGIN[2] + z;
  return out;
}

/** The plate's z at a place: 0 everywhere. The lobule is a flat histology plate, as 2D draws it (WP5, atlas-look-plan.md §5.1): every course lies in one
 *  plane, over the painted tissue, so nothing shows a side wall from any angle the camera takes. (It was a swell of ±0.14, which put courses under the tissue.) */
export function slabZ(_x: number, _y: number): number {
  return 0;
}
