// A 2D slide's camera name, as a 3D shot. The 2D app frames a REGION of its anatomy plate (decks.js REGIONS: a box in plate units), a raw box, or the
// whole plate ('fit'); the Lobule and Sinusoid views have their own names. The 3D figure is the same plate given depth in one shared frame
// (X = (x2d − 700) / 300, Y = −(y2d − 556) / 300; docs/b3-vessels-blood-lenses.md), so the shot is the box's middle and half extents in that frame,
// seen from the front a hair above, and the scene's room solver pulls back until it fits the room the cards leave. Nothing here is a drawing.
import type { Shot } from '../../scene/camera/shots.ts';
import { lobuleShot, sinusoidShot, LOBULE_CAMS, type LobuleCam } from '../../scene/lobule/shots.ts';
import { REGIONS, CIRC_REGIONS } from './regions.copied.ts';
import { boxOf as boxOfOn, camProblems as onProblems } from '../rw/cams.ts';   // (the by-name camera { on: [names], near }: one implementation, shared by every deck)
import type { CopiedSlide } from './types.ts';

export type Box = readonly [number, number, number, number];

/** The whole anatomy plate: the 2D app's `fit` (x 300 to 1120, y 0 to 920, decks.js). */
export const PLATE: Box = [300, 0, 1120, 920];
/** What a slide with no `cam` frames: the 2D presenter's default region (presenter-proc.js camBox). */
export const DEFAULT_CAM = 'route';

const SCALE = 300, X0 = 700, Y0 = 556;
/** Plate units to the scene's X and Y. */
export const sceneX = (x: number) => (x - X0) / SCALE;
export const sceneY = (y: number) => -(y - Y0) / SCALE;

/** Frontal, a hair above, the way the slice's own shots look (camera/shots.ts); the viewer can orbit ±25° from here. */
export const YAW = 0.1, PITCH = 0.08;
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

/** What a slide's camera is: a shot on the body, a lobule or sinusoid camera, or a Circuit region (the Circuit view is batch B7's). */
export type CamPlan =
  | { kind: 'body'; name: string; box: Box; shot: Shot }
  | { kind: 'lobule'; name: LobuleCam; shot: Shot }
  | { kind: 'circuit'; name: string; box: Box };

export class CamError extends Error {}

/** The camera of a slide, from its `cam` (and `view`) exactly as the 2D deck writes them. Throws on a name neither app has, so none is silently dropped. */
export function camPlan(cam: CopiedSlide['cam'], view?: string | null): CamPlan {
  if (view === 'circuit') {
    if (cam == null || cam === 'fit') return { kind: 'circuit', name: 'fit', box: [30, 30, 1360, 730] };
    const b = isBox(cam) ? cam : typeof cam === 'string' ? CIRC_REGIONS[cam] : null;
    if (!b) throw new CamError(`no Circuit region "${JSON.stringify(cam)}"`);
    return { kind: 'circuit', name: typeof cam === 'string' ? cam : 'box', box: b };
  }
  if (cam == null) return camPlan(DEFAULT_CAM);
  if (cam === 'fit') return { kind: 'body', name: 'fit', box: PLATE, shot: boxToShot(PLATE) };
  if (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam)) {
    if (!(LOBULE_CAMS as readonly string[]).includes(cam)) throw new CamError(`no lobule camera "${cam}"`);
    const name = cam as LobuleCam;
    return { kind: 'lobule', name, shot: name === 'sinusoid' ? sinusoidShot() : lobuleShot(name) };
  }
  if (typeof cam === 'string') {
    const b = REGIONS[cam];
    if (!b) throw new CamError(`no region "${cam}"`);
    return { kind: 'body', name: cam, box: b, shot: boxToShot(b) };
  }
  if (isBox(cam)) return { kind: 'body', name: 'box', box: cam, shot: boxToShot(cam) };
  if (cam && typeof cam === 'object' && !Array.isArray(cam) && Array.isArray((cam as { on?: unknown }).on)) {
    const bad = onProblems(cam as never);
    if (bad.length) throw new CamError(`camera ${JSON.stringify(cam)}: ${bad.join('; ')}`);
    const b = boxOfOn(cam as never) as Box | null;
    return b ? { kind: 'body', name: 'on', box: b, shot: boxToShot(b) } : camPlan('fit');
  }
  if (isNames(cam)) {
    const boxes = cam.map((n) => { const b = REGIONS[n]; if (!b) throw new CamError(`no region "${n}"`); return b; });
    const b = unionBox(boxes);
    return { kind: 'body', name: cam.join('+'), box: b, shot: boxToShot(b) };
  }
  throw new CamError(`a camera is a region, a box, a list of regions, 'fit' or a lobule camera, not ${JSON.stringify(cam)}`);
}
