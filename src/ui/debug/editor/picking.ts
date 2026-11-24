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
/** How far from a handle a press still grabs it (CSS px): a finger needs more than a mouse, and neither under 22. */
export const hitRadius = (touch: boolean): number => (touch ? 30 : 22);
/** The size of a handle dot (CSS px): larger where the pointer is a finger. */
export const dotSize = (base: number, touch: boolean): number => (touch ? Math.round(base * 1.7) : base);
