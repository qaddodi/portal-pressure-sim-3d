// A slide's camera, in the 3D scene: the 2D slide's `cam` (a region of the anatomy plate, a list of regions, a raw box, a by-name box, 'fit', a lobule camera) carried
// to a Shot by the one map between the 2D figure and the scene (scene/frame2d.ts). The 2D app's own boxes are the source (regions.generated.ts), so a slide frames
// the same part of the figure in both apps; the room solver (camera/room.ts) then fits it into whatever room the cards leave. Pure: a test reads every slide.
import { x3, y3 } from '../../scene/frame2d.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import { lobuleShot } from '../../scene/lobule/index.ts';
import { NODE_POS_2D, EDGE_PATH_2D } from '../../scene/anatomy/source.ts';
import { REGIONS_2D, CIRC_REGIONS_2D, box2Of, centreOf, type Box3 } from '../../scene/anatomy/source.ts';
import { box3Of, placedFitBox, wholeShot } from '../rw/cams.ts';
import type { CopiedSlide } from './types.ts';

export type Box = readonly [number, number, number, number];
/** The lobule's cameras (scene/lobule/shots.ts owns what each one frames). */
export type LobuleCamName = 'lobule' | 'lobule:fit' | 'lobule:triad' | 'lobule:sinusoid' | 'lobule:central' | 'sinusoid';

export type ShotSpec =
  /** The anatomy: the 2D box (world units) and the Shot that frames it. */
  | { kind: 'body'; name: string; box: Box; shot: Shot }
  /** The lobule or sinusoid view, by the lobule batch's camera. */
  | { kind: 'lobule'; name: string; cam: LobuleCamName }
  /** The Circuit view (batch B7) with the region (circuit units) the slide frames. */
  | { kind: 'circuit'; name: string; box: Box };

/** The whole figure: the plate the 2D app fits ("fit"). */
export const FIT_BOX: Box = [300, -40, 1120, 1020];
/** Slides look at the figure face-on (yaw 0, pitch 0, as the rest shots do); the HVPG slice's own catheter shots keep their small turns. */
export const BODY_YAW = 0;
export const BODY_PITCH = 0;
/** The nearest the camera sits on a box; the room solver pulls back when the free room is too small for it. */
export const BODY_MIN_R = 2.4;

const LOBULE_CAMS = new Set<string>(['lobule', 'lobule:fit', 'lobule:triad', 'lobule:sinusoid', 'lobule:central', 'sinusoid']);
export const isLobuleCam = (c: unknown): c is LobuleCamName => typeof c === 'string' && LOBULE_CAMS.has(c);

const isBox = (c: unknown): c is Box => Array.isArray(c) && c.length === 4 && c.every((n) => typeof n === 'number' && Number.isFinite(n));
const isNames = (c: unknown): c is string[] => Array.isArray(c) && c.length > 0 && c.every((n) => typeof n === 'string' && n);
const union = (boxes: readonly Box[]): Box => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];

/** The box a region form names (2D units): a region name, a raw box or a list of region names (their union). Null where it names nothing. */
export function regionBox(cam: unknown, regions: Readonly<Record<string, Box>> = REGIONS_2D): Box | null {
  if (isBox(cam)) return cam;
  if (typeof cam === 'string') return regions[cam] ?? null;
  if (isNames(cam)) { const found = cam.map((n) => regions[n]).filter((b): b is Box => !!b); return found.length ? union(found) : null; }
  return null;
}

/** What a by-name camera's names point at, as 2D boxes: a vessel's course (EDGE_PATH_2D), a station (NODE_POS_2D), or a region's name (an organ's own region). */
export function namedBoxes(names: readonly string[]): { boxes: Box[]; unknown: string[] } {
  const boxes: Box[] = [], unknown: string[] = [];
  for (const n of names) {
    const path = EDGE_PATH_2D[n];
    if (path?.length) { const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]); boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); continue; }
    const at = NODE_POS_2D[n];
    if (at) { boxes.push([at[0], at[1], at[0], at[1]]); continue; }
    const reg = REGIONS_2D[n];
    if (reg) { boxes.push(reg); continue; }
    unknown.push(n);
  }
  return { boxes, unknown };
}

/** `box` grown to take in `f`, with room for its outline's glow (8 % of f's larger side, at least `floor` units), as the 2D camera grows it (cam-frame.js growBox). */
export function growBox(box: Box | null, f: Box | null, floor = 0): Box | null {
  if (!f) return box;
  const m = Math.max(0.08 * Math.max(f[2] - f[0], f[3] - f[1]), floor);
  const grown: Box = [f[0] - m, f[1] - m, f[2] + m, f[3] + m];
  return box ? union([box, grown]) : grown;
}

/** The Shot that frames a 2D box: the box's middle as the target, its half extents (scene units) as what must stay in the free room. */
export function shotOfBox(box: Box): Shot {
  const half: [number, number] = [Math.abs(x3(box[2]) - x3(box[0])) / 2, Math.abs(y3(box[3]) - y3(box[1])) / 2];
  return { yaw: BODY_YAW, pitch: BODY_PITCH, r: BODY_MIN_R, target: [x3((box[0] + box[2]) / 2), y3((box[1] + box[3]) / 2), 0], half };
}

/** The Shot that frames a placed box (anatomy/source.ts, the approved placement): `shotOfBox`'s pose and nearest distance, the box's middle at its own depth. */
export function shotOfBox3(b: Box3): Shot {
  const c = centreOf(b);
  return { yaw: BODY_YAW, pitch: BODY_PITCH, r: BODY_MIN_R, target: [c[0], c[1], c[2]], half: [(b[3] - b[0]) / 2, (b[4] - b[1]) / 2] };
}
const placedSpec = (name: string, b: Box3): ShotSpec => ({ kind: 'body', name, box: box2Of(b), shot: shotOfBox3(b) });

/** A slide's camera as a ShotSpec. Never null: a slide with no camera shows the whole figure, as in 2D (`cam: st.cam || 'fit'`). */
export function shotOfCam(cam: unknown, view?: string, zone?: string): ShotSpec {
  if (view === 'circuit') {
    const box = regionBox(cam, CIRC_REGIONS_2D) ?? regionBox(zone, CIRC_REGIONS_2D) ?? ([30, 30, 1360, 730] as Box);   // (circuit world: x 30 to 1360, y 30 to 730)
    return { kind: 'circuit', name: typeof cam === 'string' ? cam : typeof zone === 'string' ? zone : 'fit', box };
  }
  if (isLobuleCam(cam)) return { kind: 'lobule', name: cam, cam };
  if (cam == null || cam === 'fit') { const b = placedFitBox(); return { kind: 'body', name: 'fit', box: box2Of(b), shot: wholeShot(shotOfBox3(b)) }; }
  if (typeof cam === 'object' && !Array.isArray(cam) && Array.isArray((cam as { on?: unknown }).on)) return placedSpec('on', box3Of(cam) ?? placedFitBox());
  const box = regionBox(cam);
  if (!box) throw new Error(`the camera ${JSON.stringify(cam)} names no region of the 2D figure`);
  const name = typeof cam === 'string' ? cam : isBox(cam) ? 'box' : (cam as string[]).join('+');
  const b3 = box3Of(cam); if (b3) return placedSpec(name, b3);
  return { kind: 'body', name, box, shot: shotOfBox(box) };
}

/** Every camera a slide uses: its own, a time-lapse's push (`lapse.cam`), and the other scales of a scale switch. */
export function slideShots(s: CopiedSlide): { main: ShotSpec; lapse?: ShotSpec; scales?: Record<string, ShotSpec> } {
  const main = shotOfCam(s.cam, s.view, s.zone);
  const out: { main: ShotSpec; lapse?: ShotSpec; scales?: Record<string, ShotSpec> } = { main };
  if (s.lapse?.cam != null) out.lapse = shotOfCam(s.lapse.cam, s.view, s.zone);
  if (s.scales) {
    out.scales = {};
    for (const [k, v] of Object.entries(s.scales)) {
      const c = (v as { cam?: unknown } | null)?.cam;
      out.scales[k] = k === 'lobule' ? { kind: 'lobule', name: 'lobule', cam: isLobuleCam(c) ? c : 'lobule' } : k === 'sinusoid' ? { kind: 'lobule', name: 'sinusoid', cam: 'sinusoid' } : shotOfCam(c, undefined, undefined);
    }
  }
  return out;
}

/** The scene's Shot for a spec, ready for `sceneApi.goTo(shot, room)`: the anatomy's box shot, or the lobule batch's own camera. A Circuit spec has none yet (batch B7 owns that view): null. */
export function sceneShot(spec: ShotSpec): Shot | null {
  if (spec.kind === 'body') return spec.shot;
  if (spec.kind === 'lobule') return lobuleShot(spec.cam);
  return null;
}
