// An organ's long axis, read from the organ's own placed mesh: the two poles a length caliper (the spleen's "16.8 cm") stands on. Pure three.js arithmetic, no scene, no DOM.
// Root cause of the spleen caliper beside its organ and running past its lower tip (27 Nov): the caliper's ends were 2D's two hand-read points of the plate, laid on the 3D plate by
// the plain 2D-to-scene map at the front plane (z 0.26), as if the spleen had not moved. The approved placement moves the spleen (X = 0.84 x - 0.072, placed-map.ts), puts it far
// behind that plane (its mid-depth is -0.22), and the camera turns the 0.48 gap in depth into a shift on the canvas: a line 30 px to the side that ended below the pole. A caliper stands
// on the mesh's own poles in 3D, carried by the same move the organ's group wears, so no map or depth can leave it off its organ.
import { type BufferGeometry, type Group, Vector3 } from 'three';

/** The two poles of an organ's long axis in the front view (the principal axis of its vertices in x and y), as two vertices of the surface itself, in no fixed order (the caller draws
 *  a line between them). Each is a point of the organ's mesh, in the mesh's own frame (scene units). */
export function poleEnds(g: BufferGeometry, a = new Vector3(), b = new Vector3()): [Vector3, Vector3] {
  const pos = g.getAttribute('position'), n = pos.count;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += pos.getX(i); my += pos.getY(i); }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const x = pos.getX(i) - mx, y = pos.getY(i) - my; sxx += x * x; sxy += x * y; syy += y * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);
  let lo = Infinity, hi = -Infinity, il = 0, ih = 0;
  for (let i = 0; i < n; i++) {
    const t = (pos.getX(i) - mx) * ax + (pos.getY(i) - my) * ay;
    if (t < lo) { lo = t; il = i; }
    if (t > hi) { hi = t; ih = i; }
  }
  a.fromBufferAttribute(pos, il); b.fromBufferAttribute(pos, ih);
  return [a, b];
}

/** Scales an organ's group by `s` about a point of the plate (the pivot, scene units, z 0): the one place that move is written, for the layer that draws it and for whatever reads where a point of
 *  the organ went (a caliper's pole). */
export function scaleAbout(group: Group, pivot: Vector3, s: number): void {
  group.scale.setScalar(s);
  group.position.set(pivot.x * (1 - s), pivot.y * (1 - s), 0);
  group.updateMatrix();
}

/** A mesh point where the organ's group draws it now, into `out` (scene units). */
export function placedPoint(group: Group, p: Vector3, out: Vector3): Vector3 {
  return out.copy(p).applyMatrix4(group.matrix);
}
