// Flat cut-out shapes for the sinusoid view: the 2D figure is a textbook cut along one sinusoid (cells, lining, stellate and Kupffer cells drawn flat, with a fine membrane
// line), so the 3D view is built the same way, as thin extruded pieces in layers a hair apart, each cel-shaded with its ink line.
import { ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { Batch } from '../lobule/batch.ts';

const geoCache = new Map<string, ExtrudeGeometry>();

/** A polygon (x, y in local units) smoothed at its corners: `iter` rounds of cutting each corner at a quarter and three quarters. */
export function rounded(pts: readonly [number, number][], iter = 2): [number, number][] {
  let p = pts.slice() as [number, number][];
  for (let k = 0; k < iter; k++) {
    const q: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!, b = p[(i + 1) % p.length]!;
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** A rounded rectangle centred on the origin, `w` wide and `h` high, corner radius `r`. */
export function rrect(w: number, h: number, r: number): Shape {
  const x = w / 2, y = h / 2, c = Math.min(r, x, y), s = new Shape();
  s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.quadraticCurveTo(x, -y, x, -y + c); s.lineTo(x, y - c); s.quadraticCurveTo(x, y, x - c, y);
  s.lineTo(-x + c, y); s.quadraticCurveTo(-x, y, -x, y - c); s.lineTo(-x, -y + c); s.quadraticCurveTo(-x, -y, -x + c, -y);
  return s;
}
export function ellipse(rx: number, ry: number, n = 20): Shape {
  const s = new Shape();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
  return s;
}
export function polygon(pts: readonly [number, number][]): Shape {
  const s = new Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
/** A tapering strip along a centre line (a process of a cell): width w0 at the start and w1 at the end. */
export function taper(centre: readonly [number, number][], w0: number, w1: number): Shape {
  const L: [number, number][] = [], R: [number, number][] = [];
  centre.forEach((p, i) => {
    const a = centre[Math.max(0, i - 1)]!, b = centre[Math.min(centre.length - 1, i + 1)]!, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (centre.length - 1))) / 2, nx = -dy / l, ny = dx / l;
    L.push([p[0] + nx * w, p[1] + ny * w]); R.push([p[0] - nx * w, p[1] - ny * w]);
  });
  return polygon([...L, ...R.reverse()]);
}

const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), zAxis = new Vector3(0, 0, 1);
/** Adds a shape to a batch as a thin slab: z the slab's back face, `depth` its thickness, placed at (x, y) turned by `rot`. */
export function slab(b: Batch, shape: Shape, depth: number, x: number, y: number, z: number, rot = 0, sx = 1, sy = 1): void {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  q.setFromAxisAngle(zAxis, rot); pos.set(x, y, z); sc.set(sx, sy, 1); m.compose(pos, q, sc);
  b.shape(g, m);
  g.dispose();
}
void geoCache;
