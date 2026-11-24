// A 2D slide's camera as a 3D shot (parity plan B13: "each deck's 3D shots"). Deck-agnostic: any 2D deck's `cam` goes in, a placed view comes out.
//
// The 2D forms (src/ui/cam-frame.js): 'fit' or none; a region name (REGIONS); [x0,y0,x1,y1] a raw box; ['portal','spleen'] a union of regions;
// { on: [names], near?: region } what the names point at (vessel ids, stations, organs, term targets, '@sets'); 'lobule', 'lobule:fit|triad|sinusoid|central'
// and 'sinusoid' (the lobule and sinusoid views); on a Circuit slide a Circuit region. The anatomy's plate and the 3D scene share one frame
// (X = (x2d − 700) / 300, Y = −(y2d − 556) / 300, depth 0.2 mid-body: docs/scene.md), so a 2D box becomes a 3D shot by arithmetic, never by hand:
// the shot's target is the box's centre, its half extents the box's, and the room solver (camera/room.ts) fits it into whatever room the cards leave.
// The slide's `kMax` (the most the 2D camera may zoom) is the 3D shot's nearest distance.
import { SHOTS, type Shot } from '../../scene/camera/shots.ts';
import { NODE_POS_2D, EDGE_PATH_2D } from '../../scene/anatomy/source.ts';
import { lobuleShot, sinusoidShot, LOBULE_CAMS, type LobuleCam } from '../../scene/lobule/shots.ts';
import { REGIONS_2D, SETS_2D, TARGETS_2D, ORGAN_BOX_2D, CIRC_REGIONS_2D, type Box2D } from './copied/plate.ts';

/** The plate's centre and scale in the shared frame (origin CONF at (700, 556), 300 plate units to one scene unit). */
export const PLATE = { cx: 700, cy: 556, unit: 300 } as const;
export const toX = (x: number): number => (x - PLATE.cx) / PLATE.unit;
export const toY = (y: number): number => (PLATE.cy - y) / PLATE.unit;

/** The depth the camera looks at: the middle of the vessels (0.30 to 0.54 in front) and the organs (which straddle 0). */
export const TARGET_Z = 0.2;
/** The tilt and turn of every body shot: the free-play rest pose (the camera rig's own `play` shot), so every slide sees the plate as 2D drew it, a hair from the front. */
const POSE = { yaw: SHOTS.play.yaw, pitch: SHOTS.play.pitch };
/** A region may not be framed tighter than this (scene units, half extents): the nearest the 3D camera sits is the HVPG wedge shot's, and no closer than it reads. */
export const MIN_HALF = 1.0;
/** The nearest distance of a body shot; the room solver pulls back further when the cards leave little room. */
export const MIN_R = 4.2;

export type Cam2D = undefined | null | string | readonly number[] | readonly string[] | { on: readonly string[]; near?: string };

/** Where a slide's camera goes. `body`: the anatomy (a shot); `lobule` and `sinusoid`: the scale views; `circuit`: the Circuit view's region (the Circuit batch frames it). */
export type Placed =
  | { view: 'body'; shot: Shot; box: Box2D | null; fit: boolean }
  | { view: 'lobule'; cam: LobuleCam; shot: Shot }
  | { view: 'sinusoid'; shot: Shot }
  | { view: 'circuit'; region: string | null; box: Box2D | null };

const isBox = (c: unknown): c is Box2D => Array.isArray(c) && c.length === 4 && c.every((v) => typeof v === 'number' && Number.isFinite(v));
const isNames = (c: unknown): c is readonly string[] => Array.isArray(c) && c.length > 0 && c.every((v) => typeof v === 'string' && v);
const isOn = (c: unknown): c is { on: readonly string[]; near?: string } => !!c && typeof c === 'object' && !Array.isArray(c) && Array.isArray((c as { on?: unknown }).on);

export function unionBox(boxes: readonly Box2D[]): Box2D | null {
  if (!boxes.length) return null;
  let [x0, y0, x1, y1] = boxes[0]!;
  for (const b of boxes) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  return [x0, y0, x1, y1];
}

/** `box` grown to take in `f` with room for its outline's glow (8 % of f's larger side, at least `floor` units): cam-frame.js growBox. */
export function growBox(box: Box2D | null, f: Box2D | null, floor = 0): Box2D | null {
  if (!f) return box;
  const m = Math.max(0.08 * Math.max(f[2] - f[0], f[3] - f[1]), floor);
  const g: Box2D = [f[0] - m, f[1] - m, f[2] + m, f[3] + m];
  return box ? unionBox([box, g]) : g;
}

const pathBox = (pts: readonly (readonly [number, number])[]): Box2D => unionBox(pts.map(([x, y]) => [x, y, x, y] as const))!;

/** What a list of names points at: the plate boxes of its vessels (their courses), stations, organs and term targets, and the names that are none of them. */
export function namesBox(on: readonly string[]): { box: Box2D | null; unknown: string[] } {
  const boxes: Box2D[] = [], unknown: string[] = [];
  const vessel = (id: string) => { const p = EDGE_PATH_2D[id]; if (p?.length) { boxes.push(pathBox(p)); return true; } return false; };
  const add = (n: string, depth = 0): void => {
    const t = TARGETS_2D[n];
    if (n.startsWith('@')) { const ids = SETS_2D[n.slice(1)]; if (!ids) unknown.push(n); else for (const id of ids) add(id, depth + 1); return; }
    if (t && (t.edges?.length || t.organ)) { for (const e of t.edges ?? []) vessel(e); if (t.organ && ORGAN_BOX_2D[t.organ]) boxes.push(ORGAN_BOX_2D[t.organ]!); return; }
    if (ORGAN_BOX_2D[n]) { boxes.push(ORGAN_BOX_2D[n]!); return; }
    const node = NODE_POS_2D[n];
    if (node) { boxes.push([node[0], node[1], node[0], node[1]]); return; }
    if (!vessel(n)) unknown.push(n);
  };
  for (const n of on) add(n);
  return { box: unionBox(boxes), unknown };
}

/** The plate box a body camera frames, or null for the whole plate ('fit'). Names that point at nothing are reported by `camProblems`, not here. */
export function boxOf(cam: Cam2D): Box2D | null {
  if (cam == null || cam === 'fit') return null;
  if (typeof cam === 'string') return REGIONS_2D[cam] ?? null;
  if (isBox(cam)) return cam;
  if (isNames(cam)) return unionBox(cam.map((r) => REGIONS_2D[r]).filter((b): b is Box2D => !!b));
  if (isOn(cam)) {
    const { box } = namesBox(cam.on);
    const near = cam.near ? REGIONS_2D[cam.near] ?? null : null;
    // (cam-frame.js: `near` is the region the camera starts from, grown to take in what is named; with no `near`, the named things and a little room round them.)
    return near ? growBox(near, box) : growBox(null, box, 40);
  }
  return null;
}

/** A plate box as a 3D shot. The half extents are the box's, never less than MIN_HALF; `kMax` (the slide's most zoom, 2D units of zoom over the fit) lifts the nearest distance. */
export function shotOfBox(box: Box2D): Shot {
  const hw = (box[2] - box[0]) / 2 / PLATE.unit, hh = (box[3] - box[1]) / 2 / PLATE.unit;
  return {
    yaw: POSE.yaw, pitch: POSE.pitch, r: MIN_R,
    target: [toX((box[0] + box[2]) / 2), toY((box[1] + box[3]) / 2), TARGET_Z],
    half: [Math.max(hw, MIN_HALF), Math.max(hh, MIN_HALF)],
  };
}

/** What is wrong with a slide's camera (the same checks the 2D deck test makes), as readable sentences. Empty: fine. */
export function camProblems(cam: Cam2D, view?: unknown): string[] {
  if (view === 'circuit') {
    if (cam == null || cam === 'fit' || isBox(cam)) return [];
    return typeof cam === 'string' && CIRC_REGIONS_2D[cam] ? [] : [`no Circuit region ${JSON.stringify(cam)}`];
  }
  if (cam == null || cam === 'fit') return [];
  if (typeof cam === 'string') return /^(lobule|sinusoid)/.test(cam) ? ((LOBULE_CAMS as readonly string[]).includes(cam) ? [] : [`no lobule camera ${cam}`]) : REGIONS_2D[cam] ? [] : [`no region ${cam}`];
  if (isBox(cam)) return cam[2] > cam[0] && cam[3] > cam[1] ? [] : ['a box needs x0 < x1 and y0 < y1'];
  if (Array.isArray(cam)) return isNames(cam) ? cam.filter((r) => !REGIONS_2D[r]).map((r) => `no region ${r}`) : ['a camera list holds region names, or four numbers for a box'];
  if (isOn(cam)) {
    const out = Object.keys(cam).filter((k) => k !== 'on' && k !== 'near').map((k) => `unknown field ${k}`);
    if (!isNames(cam.on)) out.push('on must list at least one name');
    else out.push(...namesBox(cam.on).unknown.map((n) => `"${n}" is no vessel, station, organ, target or set`));
    if (cam.near !== undefined && !REGIONS_2D[cam.near]) out.push(`near: no region ${cam.near}`);
    return out;
  }
  return ['a camera is a region, a box, a list of regions, \'fit\' or { on: [names] }'];
}

/** A slide's camera, placed. `view` is the slide's view ('circuit' or the anatomy). Throws on a camera `camProblems` names, so a bad one never plays as a guess. */
export function place(cam: Cam2D, view?: unknown): Placed {
  const bad = camProblems(cam, view);
  if (bad.length) throw new Error(`camera ${JSON.stringify(cam)}: ${bad.join('; ')}`);
  if (view === 'circuit') return { view: 'circuit', region: typeof cam === 'string' && cam !== 'fit' ? cam : null, box: isBox(cam) ? cam : typeof cam === 'string' ? CIRC_REGIONS_2D[cam] ?? null : null };
  if (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam)) {
    return cam === 'sinusoid' ? { view: 'sinusoid', shot: sinusoidShot() } : { view: 'lobule', cam: cam as LobuleCam, shot: lobuleShot(cam as LobuleCam) };
  }
  const box = boxOf(cam);
  return box ? { view: 'body', shot: shotOfBox(box), box, fit: false } : { view: 'body', shot: SHOTS.play, box: null, fit: true };
}
