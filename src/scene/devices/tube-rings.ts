// A tube built from rings: centre, direction and radius at each station, in scene units. The device parts (a shaft that follows a vessel, a balloon that follows the vein it fills, a lumen-wide
// column, a stent wire) are all this one shape, so they are one builder. Attributes match what the cel shaders read: position, normal, uv (x = how far along, 0 to 1; y = round), `tang`.
// The geometry is indexed and its attribute buffers are kept: `writeRings` fills them in place (a balloon that swells every frame allocates nothing).
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * `u`: where along the whole device this ring lies (0 to 1), for a ring that is one of many paths of ONE device (a stent's wires, its graft, its band).
 * uv.x then reads the same along-the-device place on every path, so a front can sweep them together (stent-deploy.ts). Absent: the path's own 0..1.
 */
export interface Ring {
  c: Vector3; t: Vector3; r: number; u?: number;
  /** The half width in the other direction across the tube (toward the viewer, `ringSides`' second side) when the ring is an oval and not a circle:
    * a balloon the wall squeezes flatter one way than the other. Absent: a circle of radius `r`, which is every other device's ring. */
  rd?: number;
}
/** The sideways direction a ring is built on: across the tube as the figure sees it (the frame's up is toward the viewer), so a flat figure's tube always has its widest side in view. */
const Z = new Vector3(0, 0, 1), X = new Vector3(1, 0, 0);

/** Sides round a device tube (the owner's scope fix, 20 Nov 2026: 8 and 16 facets read as a polygon). A body (shaft, balloon, column, probe) is DEVICE_SIDES round; a hairline (a wire, a needle, a coil, a stent strand) never fewer than WIRE_SIDES. */
export const DEVICE_SIDES = 24, WIRE_SIDES = 12;

export const makeRings = (n: number): Ring[] => Array.from({ length: n }, () => ({ c: new Vector3(), t: new Vector3(1, 0, 0), r: 0 }));

/** (A geometry built here is marked `userData.ringTube`: a device object wears the vessels' screen-lit three tones on it, DeviceObject.) */
/** Allocates the geometry for `n` rings with `radial` vertices round each. */
export function allocTube(n: number, radial: number): BufferGeometry {
  const g = new BufferGeometry(), v = n * (radial + 1);
  g.userData.ringTube = true; g.userData.radial = radial;
  g.setAttribute('position', new BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute('tang', new BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(v * 2), 2));
  const idx = new Uint32Array((n - 1) * radial * 6);
  let k = 0;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    // (counter-clockwise seen from outside: the toon pass draws front faces and the ink hull back faces; wound the other way the far wall was drawn in colour and the near wall in ink, a hollow tube)
    idx[k++] = a; idx[k++] = a + 1; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b + 1; idx[k++] = b;
  }
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

const n1 = new Vector3(), n2 = new Vector3(), d = new Vector3(), tt = new Vector3();
/** The two unit sides a ring about direction `t` is built on (the first across the tube as the figure sees it, the second toward the viewer): the one frame `writeRings` and a ring's users share. */
export function ringSides(t: Vector3, a: Vector3, b: Vector3): void {
  tt.copy(t).normalize();
  a.crossVectors(tt, Z); if (a.lengthSq() < 1e-6) a.crossVectors(tt, X);
  a.normalize(); b.crossVectors(tt, a).normalize();
}
/** Writes the rings into the geometry allocated for them. `u0` and `u1` set uv.x along the rings (a part of a longer route keeps the route's own fractions); `us` gives it ring by ring (rings that are not evenly spaced). */
export function writeRings(g: BufferGeometry, rings: readonly Ring[], radialArg: number, u0 = 0, u1 = 1, us?: ArrayLike<number>): void {
  // (the sides a tube was allocated with are the tube's own, `userData.radial`: a caller that passes another number would fill part of each ring and leave the rest of its vertices at the origin, a hairline from the tube to the figure's
  //  centre (20 Nov 2026, the balloon's glints, allocated 8-sided and written 6): the argument is only for a geometry made elsewhere)
  const radial = (g.userData.radial as number | undefined) ?? radialArg;
  const pos = g.getAttribute('position') as BufferAttribute, nor = g.getAttribute('normal') as BufferAttribute, tan = g.getAttribute('tang') as BufferAttribute, uv = g.getAttribute('uv') as BufferAttribute;
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const ring = rings[i]!;
    ringSides(ring.t, n1, n2);
    // the radius's slope along the tube tilts the normal (a balloon's shoulders), so it shades as the swelling it is
    const a = rings[Math.max(0, i - 1)]!, b = rings[Math.min(n - 1, i + 1)]!;
    const ds = a.c.distanceTo(ring.c) + ring.c.distanceTo(b.c) || 1, slope = (b.r - a.r) / ds;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th), k = i * (radial + 1) + j;
      d.set(n1.x * ct + n2.x * st, n1.y * ct + n2.y * st, n1.z * ct + n2.z * st);
      if (ring.rd === undefined) {
        pos.setXYZ(k, ring.c.x + d.x * ring.r, ring.c.y + d.y * ring.r, ring.c.z + d.z * ring.r);
        nor.setXYZ(k, d.x - tt.x * slope, d.y - tt.y * slope, d.z - tt.z * slope);
      } else {
        // an oval ring: the half width across is r, the half width toward the viewer rd; the outward normal of an ellipse is its point over the squared half widths
        const rd = Math.max(ring.rd, 1e-9), wa = ct * ring.r, wb = st * rd, ka = ct / Math.max(ring.r, 1e-9), kb = st / rd;
        pos.setXYZ(k, ring.c.x + n1.x * wa + n2.x * wb, ring.c.y + n1.y * wa + n2.y * wb, ring.c.z + n1.z * wa + n2.z * wb);
        const qx = n1.x * ka + n2.x * kb, qy = n1.y * ka + n2.y * kb, qz = n1.z * ka + n2.z * kb, ql = Math.hypot(qx, qy, qz) || 1;
        nor.setXYZ(k, qx / ql - tt.x * slope, qy / ql - tt.y * slope, qz / ql - tt.z * slope);
      }
      const l = Math.hypot(nor.getX(k), nor.getY(k), nor.getZ(k)) || 1;
      nor.setXYZ(k, nor.getX(k) / l, nor.getY(k) / l, nor.getZ(k) / l);
      tan.setXYZ(k, tt.x, tt.y, tt.z);
      uv.setXY(k, us ? us[i]! : ring.u ?? u0 + (u1 - u0) * (i / (n - 1)), j / radial);
    }
  }
  pos.needsUpdate = nor.needsUpdate = tan.needsUpdate = uv.needsUpdate = true;
  g.computeBoundingSphere();
}

/** The part of a tube between ring `i0` and ring `i1` (draw range over its index buffer): a column that fills part of a route without rebuilding. */
export function showRings(g: BufferGeometry, i0: number, i1: number, radialArg: number): void {
  const radial = (g.userData.radial as number | undefined) ?? radialArg;
  const a = Math.max(0, Math.floor(i0)), b = Math.max(a, Math.floor(i1));
  g.setDrawRange(a * radial * 6, Math.max(0, (b - a) * radial * 6));
}

/** One geometry from several tubes (the stent's wires: dozens of rings, one draw). Each path is a list of rings; every path gets `radial` vertices round. Attributes as `allocTube`'s. */
export function mergeTubes(paths: readonly (readonly Ring[])[], radial: number): BufferGeometry {
  const live = paths.filter((p) => p.length >= 2);
  const parts = live.map((p) => { const g = allocTube(p.length, radial); writeRings(g, p, radial); return g; });
  if (!parts.length) { const g = allocTube(2, radial); writeRings(g, makeRings(2), radial); g.setDrawRange(0, 0); return g; }
  let vTotal = 0, iTotal = 0;
  for (const g of parts) { vTotal += g.getAttribute('position').count; iTotal += g.index!.count; }
  const out = new BufferGeometry();
  out.userData.ringTube = true; out.userData.radial = radial;
  const attr = (name: string, size: number) => { const a = new Float32Array(vTotal * size); out.setAttribute(name, new BufferAttribute(a, size)); return a; };
  const P = attr('position', 3), N = attr('normal', 3), T = attr('tang', 3), U = attr('uv', 2), I = new Uint32Array(iTotal);
  let vo = 0, io = 0;
  for (const g of parts) {
    P.set(g.getAttribute('position').array as Float32Array, vo * 3); N.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    T.set(g.getAttribute('tang').array as Float32Array, vo * 3); U.set(g.getAttribute('uv').array as Float32Array, vo * 2);
    const ix = g.index!.array as ArrayLike<number>;
    for (let k = 0; k < ix.length; k++) I[io + k] = ix[k]! + vo;
    vo += g.getAttribute('position').count; io += ix.length;
    g.dispose();
  }
  out.setIndex(new BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}
