// The Tests devices keep clear of the cards the way the 2D app's do, and 2D does it in screen pixels (the stage's own): the Doppler probe's search (dop-probe.js fitPose), the FibroScan probe's turn
// (stage-scan.js scanTurn) and its labels all work on the screen, whatever the figure's zoom is. This is the bridge: where a scene point is on the screen (`project`), how the figure's plane maps to
// it there (a 2 by 2 basis, so a direction on the screen is a direction on the plate, and a length in px a length in scene units), and the boxes the devices keep off. Pure arithmetic over the
// scene's own projection: node judges it with a stand-in camera.
import { Vector3 } from 'three';

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Pt { x: number; y: number }

/** What the scene gives the devices: the screen map and the boxes to keep off. The layer is built without it in tests (the devices then keep the 2D numbers at figure scale 1). */
export interface ScreenEnv {
  /** Where a scene point is on the stage now, CSS px (the figure's own transform included). */
  project(p: Vector3, out: Pt): Pt;
  /** The stage's size, CSS px. */
  size(): { w: number; h: number };
  /** The pieces that cover the figure: the slide's cards, the Tests card, the bars (blockers.js BLOCKER_SEL, padded as the 2D probe pads them). */
  cards(): readonly Box[];
  /** The labels and callouts showing, which the probe's line of sight keeps off where a side allows. */
  avoid?(): readonly Box[];
  /** Reduce Motion: the probe fades where it stands and never swings (2D dprShape). */
  reduceMotion?(): boolean;
  /** The camera is in a glide (a shot, a card's room): a probe not yet shown waits for it to land. */
  moving?(): boolean;
}

/** The figure's plane at a scene point: screen = origin + [a b; c d] * (x, y) per scene unit. `sc` is the mean scale (px per scene unit), `inv` the inverse map. */
export interface Basis {
  ox: number; oy: number;
  a: number; b: number; c: number; d: number;
  sc: number;
  ia: number; ib: number; ic: number; id: number;
}
export const newBasis = (): Basis => ({ ox: 0, oy: 0, a: 1, b: 0, c: 0, d: -1, sc: 1, ia: 1, ib: 0, ic: 0, id: -1 });

const EPS = 0.05;
const P0: Pt = { x: 0, y: 0 }, PX: Pt = { x: 0, y: 0 }, PY: Pt = { x: 0, y: 0 };
const V = new Vector3();

/** The map at `at` (a scene point), written into `out`: three projections, one step along each axis of the plate. */
export function basisAt(env: ScreenEnv, at: Vector3, out: Basis = newBasis()): Basis {
  env.project(at, P0);
  env.project(V.copy(at).setX(at.x + EPS), PX);
  env.project(V.copy(at).setY(at.y + EPS), PY);
  out.ox = P0.x; out.oy = P0.y;
  out.a = (PX.x - P0.x) / EPS; out.c = (PX.y - P0.y) / EPS;
  out.b = (PY.x - P0.x) / EPS; out.d = (PY.y - P0.y) / EPS;
  const det = out.a * out.d - out.b * out.c;
  out.sc = Math.sqrt(Math.abs(det)) || 1;
  const k = Math.abs(det) > 1e-9 ? 1 / det : 0;
  out.ia = out.d * k; out.ib = -out.b * k; out.ic = -out.c * k; out.id = out.a * k;
  return out;
}

/** A screen offset (px) as the scene offset on the plate (units), written into `out` (z untouched). */
export function toPlate(B: Basis, dx: number, dy: number, out: Vector3): Vector3 {
  out.x = B.ia * dx + B.ib * dy; out.y = B.ic * dx + B.id * dy; return out;
}
/** A scene offset on the plate as the screen offset (px). */
export function toScreen(B: Basis, x: number, y: number, out: Pt): Pt {
  out.x = B.a * x + B.b * y; out.y = B.c * x + B.d * y; return out;
}

/** Whether two boxes overlap. */
export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** A box grown by m on every side, into `out`. */
export const growBox = (b: Box, m: number, out: Box): Box => { out.x0 = b.x0 - m; out.y0 = b.y0 - m; out.x1 = b.x1 + m; out.y1 = b.y1 + m; return out; };
