// The anatomy editor's organ edit (?editor, preview only): a pure function of one organ's geometry and its OrganEdit (types.ts).
// Order: liquify strokes (reference frame, smooth C2 Wendland falloff, total pull per vertex clamped to LIQUIFY_LIMIT), then the whole-organ move / rotY / scale about the
// organ's centroid, each clamped to ORGAN_LIMITS. A vertex's new place is a function of its REFERENCE place only, so vertices at one place (a welded seam) stay one place.
// Normals, and the baked smoothed normals (shadeN, hullN) when the geometry has them, are recomputed. An empty edit touches nothing (identical buffers).
import { type BufferGeometry, Float32BufferAttribute } from 'three';
import { smoothRestNormals } from '../scene/organs/normal-smooth.ts';
import { LIQUIFY_LIMIT, ORGAN_LIMITS, type OrganEdit, type V3 } from './types.ts';

const SHADE_PASSES = 6;   // (prepare.ts SHADE_PASSES; not imported: prepare.ts imports the layer, which imports the meshes, which import this)
const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The organ's centre: the middle of its bounding box (`origin` is added to the stored positions: the live path edits before the organ's depth shift). */
export function organCentroid(g: BufferGeometry, origin: V3 = [0, 0, 0]): V3 {
  const p = g.getAttribute('position').array, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]!; if (v < lo[k]!) lo[k] = v; if (v > hi[k]!) hi[k] = v; }
  return [(lo[0]! + hi[0]!) / 2 + origin[0], (lo[1]! + hi[1]!) / 2 + origin[1], (lo[2]! + hi[2]!) / 2 + origin[2]];
}

/** The edit as it will be applied: every number finite and inside its limit (a move is clamped by its length). */
export function clampEdit(e: OrganEdit): { move: V3; rotY: number; scale: number; strokes: { at: V3; radius: number; by: V3 }[] } {
  let mv: [number, number, number] = [0, 0, 0];
  if (e.move && e.move.length === 3 && e.move.every(fin)) {
    mv = [e.move[0], e.move[1], e.move[2]];
    const l = Math.hypot(...mv);
    if (l > ORGAN_LIMITS.move) mv = [mv[0] * ORGAN_LIMITS.move / l, mv[1] * ORGAN_LIMITS.move / l, mv[2] * ORGAN_LIMITS.move / l];
  }
  const strokes = (e.strokes ?? []).filter((s) => s && s.at?.length === 3 && s.by?.length === 3 && s.at.every(fin) && s.by.every(fin) && fin(s.radius) && s.radius > 1e-6)
    .map((s) => ({ at: [s.at[0], s.at[1], s.at[2]] as V3, radius: s.radius, by: [s.by[0], s.by[1], s.by[2]] as V3 }));
  return { move: mv, rotY: fin(e.rotY) ? clamp(e.rotY, -ORGAN_LIMITS.rotY, ORGAN_LIMITS.rotY) : 0, scale: fin(e.scale) ? clamp(e.scale, ORGAN_LIMITS.scaleMin, ORGAN_LIMITS.scaleMax) : 1, strokes };
}

/** Smooth C2 falloff: 1 at the stroke's centre, 0 (with zero slope and curvature) at its radius. */
export const wendland = (r: number): number => (r >= 1 ? 0 : (1 - r) ** 4 * (4 * r + 1));

/** The pull of the liquify strokes on a point of the organ's reference frame: the strokes' falloff-weighted sum, its length clamped to LIQUIFY_LIMIT (what applyOrganEdit does to each vertex). */
function strokePull(strokes: readonly { at: V3; radius: number; by: V3 }[], x: number, y: number, z: number): [number, number, number] {
  let dx = 0, dy = 0, dz = 0;
  for (const s of strokes) {
    const d = Math.hypot(x - s.at[0], y - s.at[1], z - s.at[2]);
    if (d >= s.radius) continue;
    const w = wendland(d / s.radius);
    dx += s.by[0] * w; dy += s.by[1] * w; dz += s.by[2] * w;
  }
  const dl = Math.hypot(dx, dy, dz);
  if (dl > LIQUIFY_LIMIT) { const k = LIQUIFY_LIMIT / dl; dx *= k; dy *= k; dz *= k; }
  return [dx, dy, dz];
}
/** How far an organ's liquify strokes pull a point of its reference frame (scene units): the same falloff and clamp as the mesh vertex at that place. [0, 0, 0] when the organ has no strokes. */
export function strokeDisplace(edit: OrganEdit | undefined, p: V3): V3 {
  return edit?.strokes?.length ? strokePull(clampEdit(edit).strokes, p[0], p[1], p[2]) : [0, 0, 0];
}

/**
 * Edits `g` in place (and returns it). `origin` is the shift between the stored positions and the frame the edit is written in (the live path edits before the organ's depth shift).
 * `centroid` (that frame) overrides the organ's own centre, so two meshes of one organ (the finished stomach and the raw one) turn about the same point.
 */
export function applyOrganEdit(g: BufferGeometry, edit: OrganEdit | undefined, opts: { origin?: V3; centroid?: V3 } = {}): BufferGeometry {
  if (!edit) return g;
  const e = clampEdit(edit);
  const plain = e.move[0] === 0 && e.move[1] === 0 && e.move[2] === 0 && e.rotY === 0 && e.scale === 1;
  if (plain && !e.strokes.length) return g;
  const o = opts.origin ?? [0, 0, 0], c = opts.centroid ?? organCentroid(g, o);
  const pos = g.getAttribute('position'), a = pos.array as Float32Array, n = pos.count;
  const cs = Math.cos(e.rotY), sn = Math.sin(e.rotY);
  for (let i = 0; i < n; i++) {
    let x = a[3 * i]! + o[0], y = a[3 * i + 1]! + o[1], z = a[3 * i + 2]! + o[2];
    const [dx, dy, dz] = strokePull(e.strokes, x, y, z);
    x += dx; y += dy; z += dz;
    // about the centroid: scale, then turn about the vertical axis, then move
    const rx = (x - c[0]) * e.scale, ry = (y - c[1]) * e.scale, rz = (z - c[2]) * e.scale;
    a[3 * i] = c[0] + rx * cs + rz * sn + e.move[0] - o[0];
    a[3 * i + 1] = c[1] + ry + e.move[1] - o[1];
    a[3 * i + 2] = c[2] - rx * sn + rz * cs + e.move[2] - o[2];
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal').array, idx = g.index ? g.index.array : [];
  if (g.getAttribute('shadeN')) g.setAttribute('shadeN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx, SHADE_PASSES), 3));
  if (g.getAttribute('hullN')) g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx), 3));
  g.computeBoundingBox(); g.boundingSphere = null;
  return g;
}

/** An organ's edit as a point map, for anchors that hang on the organ (a caption, a scope's way, a bleed, the ascites wall): the point of the reference frame goes where the mesh vertex at that place goes
 *  (liquify strokes first, then scale about `centroid`, the turn about the vertical axis and the move: the arithmetic of applyOrganEdit). Null when the edit moves nothing. */
export function organPointMap(edit: OrganEdit | undefined, centroid: V3): ((p: V3) => V3) | null {
  if (!edit) return null;
  const e = clampEdit(edit);
  if (e.move[0] === 0 && e.move[1] === 0 && e.move[2] === 0 && e.rotY === 0 && e.scale === 1 && !e.strokes.length) return null;
  const cs = Math.cos(e.rotY), sn = Math.sin(e.rotY), c = centroid;
  return (p) => {
    const [dx, dy, dz] = strokePull(e.strokes, p[0], p[1], p[2]);
    const rx = (p[0] + dx - c[0]) * e.scale, ry = (p[1] + dy - c[1]) * e.scale, rz = (p[2] + dz - c[2]) * e.scale;
    return [c[0] + rx * cs + rz * sn + e.move[0], c[1] + ry + e.move[1], c[2] - rx * sn + rz * cs + e.move[2]];
  };
}

/** Each organ's reference centre (scene units, before any edit), noted by the places that make the organs; the UI lists them (meshes.ts editableOrgans). */
export const organCentroids: Record<string, V3> = {};
