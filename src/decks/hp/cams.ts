// A 2D slide's camera name, as a 3D shot. The 2D app frames a REGION of its anatomy plate (decks.js REGIONS: a box in plate units), a raw box, or the
// whole plate ('fit'); the Lobule and Sinusoid views have their own names. The 3D figure is the same plate given depth in one shared frame
// (X = (x2d − 700) / 300, Y = −(y2d − 556) / 300; docs/b3-vessels-blood-lenses.md), so the shot is the box's middle and half extents in that frame,
// seen face-on, and the scene's room solver pulls back until it fits the room the cards leave. Nothing here is a drawing.
import { Vector3 } from 'three';
import type { Shot } from '../../scene/camera/shots.ts';
import { STATIONS } from '../../scene/labels/stations.ts';
import { lobuleShot, sinusoidShot, LOBULE_CAMS, type LobuleCam } from '../../scene/lobule/shots.ts';
import { REGIONS_HP as REGIONS, CIRC_REGIONS_HP as CIRC_REGIONS, box2Of, centreOf, type Box3 } from '../../scene/anatomy/source.ts';
import { camProblems as onProblems, box3Of, placedFitBox, wholeShot } from '../rw/cams.ts';   // (the by-name camera { on: [names], near }: one implementation, shared by every deck)
import type { CopiedSlide } from './types.ts';
import { ROUTE_TO_STATIONS } from '../overlay/frames.ts';

// (the framing policy's data moved to src/decks/overlay/frames.ts; these names stay readable from here for the tests and the other cameras)
export { FRAME_FIXES, CONTEXT_FLOOR, CLOSE_UPS, WIDE_ROUTES, ROUTE_TO_STATIONS } from '../overlay/frames.ts';

export type Box = readonly [number, number, number, number];

/** The whole anatomy plate: the 2D app's `fit` (x 300 to 1120, y 0 to 920, decks.js). */
export const PLATE: Box = [300, 0, 1120, 920];
/** What a slide with no `cam` frames: the 2D presenter's default region (presenter-proc.js camBox). */
export const DEFAULT_CAM = 'route';

const SCALE = 300, X0 = 700, Y0 = 556;
/** Plate units to the scene's X and Y. */
export const sceneX = (x: number) => (x - X0) / SCALE;
export const sceneY = (y: number) => -(y - Y0) / SCALE;

/** Face-on, the way the rest shots look (camera/shots.ts: yaw 0, pitch 0, the atlas and what the 2D app shows); the viewer can orbit from here. The catheter shots keep their small turns. */
export const YAW = 0, PITCH = 0;
/** The body's middle plane in depth: the figure's own, so a shot's perspective centre sits in the middle of what it shows. */
export const DEPTH = -0.2;
/** The nearest a derived shot sits, scene units: a small region is shown big, never closer than this. */
export const NEAR = 2.8;

export function boxToShot(b: Box): Shot {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  return { yaw: YAW, pitch: PITCH, r: NEAR, target: [sceneX(cx), sceneY(cy), DEPTH], half: [(b[2] - b[0]) / 2 / SCALE, (b[3] - b[1]) / 2 / SCALE] };
}

const isBox = (c: unknown): c is Box => Array.isArray(c) && c.length === 4 && c.every((n) => typeof n === 'number' && Number.isFinite(n));
const isNames = (c: unknown): c is string[] => Array.isArray(c) && c.length > 0 && c.every((n) => typeof n === 'string');

export function unionBox(boxes: readonly Box[]): Box {
  let [x0, y0, x1, y1] = boxes[0]!;
  for (const b of boxes) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  return [x0, y0, x1, y1];
}

/** A placed box (anatomy/source.ts, the approved placement) as this deck's body shot: the same pose and nearest distance as `boxToShot`, the box's middle at its own depth. */
export function box3ToShot(b: Box3): Shot {
  const c = centreOf(b);
  return { yaw: YAW, pitch: PITCH, r: NEAR, target: [c[0], c[1], c[2]], half: [(b[3] - b[0]) / 2, (b[4] - b[1]) / 2] };
}
/** A body plan from a placed box: the shot from the box, and the box in the 2D figure's units (what the plan carries). */
const placedBody = (name: string, b: Box3): CamPlan => ({ kind: 'body', name, box: box2Of(b), shot: box3ToShot(b) });

/** What a slide's camera is: a shot on the body, a lobule or sinusoid camera, or a Circuit region (the Circuit view is batch B7's). */
export type CamPlan =
  | { kind: 'body'; name: string; box: Box; shot: Shot }
  | { kind: 'lobule'; name: LobuleCam; shot: Shot }
  | { kind: 'circuit'; name: string; box: Box };

export class CamError extends Error {}

/** FRAMING RULE F3 (Mohammad, 25 Nov, "do it"; docs/approved/framing-rules.md): a slide's frame always takes in every station its labels name, with this much air all round (scene units; 0.13 keeps every station 40 px or more inside the room on a phone, an iPad and a Mac, measured over every talk, tests/camera-framing-rules.test.ts). Root cause of the clipped labels (RHV on Prehepatic 13, RA on Choose 15, VAR on the bleed frame ...): a camera came from the 2D deck's region
 *  box alone and never from what the slide labels, so a station could stand on or past the room's edge. A frame that already holds its stations is returned as it was. */
export const STATION_AIR = 0.05;
/** Where a station's dot stands at rest in the scene (x, y), or null when it has none: the label controller's own anchor (labels/stations.ts `at` at `u0`), so the frame holds the dot the viewer sees. */
export function stationDot(id: string): [number, number] | null {
  const st = STATIONS.find((x) => x.id === id);
  if (!st) return null;
  try { const v = st.at(st.u0, new Vector3()); return Number.isFinite(v.x) && Number.isFinite(v.y) ? [v.x, v.y] : null; } catch { return null; }
}
export function withStations(shot: Shot, stations: readonly string[]): Shot {
  let x0 = shot.target[0] - shot.half[0], x1 = shot.target[0] + shot.half[0], y0 = shot.target[1] - shot.half[1], y1 = shot.target[1] + shot.half[1], grew = false;
  const keep: [number, number][] = [];
  for (const n of stations) {
    const at = stationDot(n);
    if (!at) continue;
    keep.push(at);
    const a = STATION_AIR, sx0 = at[0] - a, sx1 = at[0] + a, sy0 = at[1] - a, sy1 = at[1] + a;
    if (sx0 < x0) { x0 = sx0; grew = true; } if (sx1 > x1) { x1 = sx1; grew = true; }
    if (sy0 < y0) { y0 = sy0; grew = true; } if (sy1 > y1) { y1 = sy1; grew = true; }
  }
  if (!keep.length) return shot;
  if (!grew) return { ...shot, keep };
  return { ...shot, target: [(x0 + x1) / 2, (y0 + y1) / 2, shot.target[2]], half: [(x1 - x0) / 2, (y1 - y0) / 2], keep };
}

/** The camera of a slide, from its `cam` (and `view`) exactly as the 2D deck writes them. Throws on a name neither app has, so none is silently dropped. */
export function camPlan(cam: CopiedSlide['cam'], view?: string | null, stations: readonly string[] = [], floor = 0): CamPlan {
  const plan = camPlanOf(cam === ROUTE_TO_STATIONS ? routeBox(stations) : cam, view);
  if (plan.kind !== 'body') return plan;
  let shot = floor > 0 ? { ...plan.shot, half: [Math.max(plan.shot.half[0], floor), Math.max(plan.shot.half[1], floor)] as [number, number] } : plan.shot;
  if (stations.length) shot = withStations(shot, stations);
  return shot === plan.shot ? plan : { ...plan, shot };
}

/** FRAMING RULE S6 (Mohammad, 25 Nov, "do it" to more rules for every scenario): the `route` region (liver to right atrium, 0.87 x 1.10 half) is taller than the labels on it. A route slide is framed to the route's width and only the height its labelled stations
 *  need (plus STATION_AIR), so on a phone, where the cards leave a room barely 200 px tall, a vein still draws 8 px or more (F6) and the margin rule (F3) holds in the room the solver is given. Context above and below the stations may leave the room. */
const ROUTE_X: readonly [number, number] = [380, 900];
function routeBox(stations: readonly string[]): CopiedSlide['cam'] {
  const ys = stations.map((n) => stationDot(n)).filter((p): p is [number, number] => !!p).map((p) => p[1]);
  if (!ys.length) return 'route';
  const y2d = (y: number) => 556 - 300 * y;
  return [ROUTE_X[0], Math.round(y2d(Math.max(...ys) + STATION_AIR)), ROUTE_X[1], Math.round(y2d(Math.min(...ys) - STATION_AIR))];
}
/** The camera a slide asks for and the floor it keeps: the slide's own `frame` (the 3D overlay, src/decks/overlay.ts), when it has one and the copied camera is still the one it replaces. */
export function slideCam(s: Pick<CopiedSlide, 'cam' | 'frame'>): { cam: CopiedSlide['cam']; floor: number } {
  const f = s.frame;
  return f && s.cam === f.was ? { cam: f.cam, floor: f.floor } : { cam: s.cam, floor: 0 };
}

function camPlanOf(cam: CopiedSlide['cam'], view?: string | null): CamPlan {
  if (view === 'circuit') {
    if (cam == null || cam === 'fit') return { kind: 'circuit', name: 'fit', box: [30, 30, 1360, 730] };
    const b = isBox(cam) ? cam : typeof cam === 'string' ? CIRC_REGIONS[cam] : null;
    if (!b) throw new CamError(`no Circuit region "${JSON.stringify(cam)}"`);
    return { kind: 'circuit', name: typeof cam === 'string' ? cam : 'box', box: b };
  }
  if (cam == null) return camPlanOf(DEFAULT_CAM);
  if (cam === 'fit') { const b = placedFitBox(); return { kind: 'body', name: 'fit', box: box2Of(b), shot: wholeShot(box3ToShot(b)) }; }
  if (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam)) {
    if (!(LOBULE_CAMS as readonly string[]).includes(cam)) throw new CamError(`no lobule camera "${cam}"`);
    const name = cam as LobuleCam;
    return { kind: 'lobule', name, shot: name === 'sinusoid' ? sinusoidShot() : lobuleShot(name) };
  }
  if (typeof cam === 'string') {
    if (!REGIONS[cam]) throw new CamError(`no region "${cam}"`);
    return placedBody(cam, box3Of(cam)!);
  }
  if (isBox(cam)) return placedBody('box', box3Of(cam)!);
  if (cam && typeof cam === 'object' && !Array.isArray(cam) && Array.isArray((cam as { on?: unknown }).on)) {
    const bad = onProblems(cam as never);
    if (bad.length) throw new CamError(`camera ${JSON.stringify(cam)}: ${bad.join('; ')}`);
    const b3 = box3Of(cam);
    return b3 ? placedBody('on', b3) : camPlanOf('fit');
  }
  if (isNames(cam)) {
    for (const n of cam) if (!REGIONS[n]) throw new CamError(`no region "${n}"`);
    return placedBody(cam.join('+'), box3Of(cam)!);
  }
  throw new CamError(`a camera is a region, a box, a list of regions, 'fit' or a lobule camera, not ${JSON.stringify(cam)}`);
}
