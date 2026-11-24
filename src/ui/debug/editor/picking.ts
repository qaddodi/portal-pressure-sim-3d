// Picking and dragging maths of the editor (pure: a camera and numbers in, numbers out; no DOM).
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';

/** Pointer (CSS px in a stage of w x h) to normalised device coordinates. */
export const ndcOf = (x: number, y: number, w: number, h: number, out = new Vector2()): Vector2 => out.set((x / w) * 2 - 1, -(y / h) * 2 + 1);

/** Where the pointer's ray meets the plane through `through` that faces the camera (null when it never does). */
export function onFacingPlane(camera: Camera, ndc: Vector2, through: Vector3, out = new Vector3()): Vector3 | null {
  const dir = camera.getWorldDirection(new Vector3());
  const ray = new Raycaster(); ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(dir, through), out);
}
/** The world movement of a handle at `through` as the pointer goes from ndc `a` to ndc `b` (zero when a ray misses). */
export function dragDelta(camera: Camera, through: Vector3, a: Vector2, b: Vector2): Vector3 {
  const p = onFacingPlane(camera, a, through), q = onFacingPlane(camera, b, through);
  return p && q ? q.sub(p) : new Vector3();
}
/** The index of the screen point nearest (x, y) within `radius` px, or -1. */
export function nearest(points: readonly (readonly [number, number] | null)[], x: number, y: number, radius: number): number {
  let best = -1, bd = radius * radius;
  points.forEach((p, i) => { if (!p) return; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d <= bd) { bd = d; best = i; } });
  return best;
}
/** The index of the polyline (of screen points) whose nearest point is within `radius` px of (x, y), or -1. */
export function nearestLine(lines: readonly (readonly (readonly [number, number])[])[], x: number, y: number, radius: number): number {
  let best = -1, bd = radius * radius;
  lines.forEach((l, i) => {
    for (let k = 1; k < l.length; k++) {
      const [ax, ay] = l[k - 1]!, [bx, by] = l[k]!, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
      const d = (x - (ax + dx * t)) ** 2 + (y - (ay + dy * t)) ** 2;
      if (d <= bd) { bd = d; best = i; }
    }
  });
  return best;
}
/** Where along the polyline (of screen points) the nearest point to (x, y) lies, as a fractional vertex index (segment i + t), or null when it is farther than `radius`. */
export function nearestParam(line: readonly (readonly [number, number])[], x: number, y: number, radius: number): number | null {
  let best: number | null = null, bd = radius * radius;
  for (let k = 1; k < line.length; k++) {
    const [ax, ay] = line[k - 1]!, [bx, by] = line[k]!, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L)) : 0, d = (x - (ax + dx * t)) ** 2 + (y - (ay + dy * t)) ** 2;
    if (d <= bd) { bd = d; best = k - 1 + t; }
  }
  return best;
}
export interface HandView { k: number; x: number; y: number }
export const ZOOM_MIN = 1, ZOOM_MAX = 8;
const clampK = (k: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
/** The hand's view after a zoom by `factor` (about the screen's centre, which the camera's zoom is about) and a pan of (dx, dy) px: pan is the picture's shift. At the fit the pan is zero. */
export function zoomPan(v: HandView, factor: number, dx = 0, dy = 0): HandView {
  const k = clampK(v.k * factor), s = k / v.k;
  return k <= ZOOM_MIN ? { k, x: 0, y: 0 } : { k, x: v.x * s + dx, y: v.y * s + dy };
}
/** Two fingers moved from (a0, b0) to (a1, b1): the zoom is their spread's ratio, the pan the middle's move. */
export function pinchView(v: HandView, a0: readonly [number, number], b0: readonly [number, number], a1: readonly [number, number], b1: readonly [number, number]): HandView {
  const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]), d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]);
  return zoomPan(v, d0 > 1 ? d1 / d0 : 1, (a1[0] + b1[0]) / 2 - (a0[0] + b0[0]) / 2, (a1[1] + b1[1]) / 2 - (a0[1] + b0[1]) / 2);
}
/** How far from a handle a press still grabs it (CSS px): a finger needs more than a mouse, and neither under 22. */
export const hitRadius = (touch: boolean): number => (touch ? 30 : 22);
/** The size of a handle dot (CSS px): larger where the pointer is a finger. */
export const dotSize = (base: number, touch: boolean): number => (touch ? Math.round(base * 1.7) : base);
