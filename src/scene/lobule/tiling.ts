// Where the neighbouring lobules stand: ONE place for the field's lattice, read by the field's own shader (field.ts, the tile repeated on one plane) and by the liver's
// surface (organs/liver-lobules.ts,
// the mosaic that shows the next scale before the dive gets there; Mohammad, 27 Nov 2026: "every zoom should feel like one continuous zoom"). The lobules are flat-topped
// hexagons of radius 1 (lobule
// radii, the field's vLob), the lobule in focus at (0, 0): the 2D tile's centres are (1.5 i, sqrt3 (j + half of i's odd)), the tile 6 wide and 2 sqrt3 high (two lobules each way).
import { LOBULE_R } from './sizes.ts';

const S3 = Math.sqrt(3);
/** The field tile's size in lobule radii (two lobules wide, two high); field.ts turns a lobule position into the tile's uv with them. */
export const FIELD_TILE_W = 6, FIELD_TILE_H = 2 * S3;
/** The lattice as two offset rectangles of (3, sqrt3): the lobule centres at (3 i, sqrt3 j) and the ones half a step over at (1.5 + 3 i, sqrt3 (j + 1/2)). */
const STEP_X = 3, STEP_Y = S3;
/** The hexagon's apothem (centre to the middle of an edge) in lobule radii. */
export const HEX_APOTHEM = S3 / 2;

const wrap = (v: number, s: number): number => v - s * Math.floor(v / s);
/** The centre of the lobule that holds (x, y), in lobule radii, and the offset from it (JS twin of lobuleHex in the shader below). */
export function lobuleCentre(x: number, y: number, out: { cx: number; cy: number; dx: number; dy: number } = { cx: 0, cy: 0, dx: 0, dy: 0 }): { cx: number; cy: number; dx: number; dy: number } {
  const ax = wrap(x + STEP_X / 2, STEP_X) - STEP_X / 2, ay = wrap(y + STEP_Y / 2, STEP_Y) - STEP_Y / 2;
  const bx = wrap(x, STEP_X) - STEP_X / 2, by = wrap(y, STEP_Y) - STEP_Y / 2;
  const useA = ax * ax + ay * ay < bx * bx + by * by;
  out.dx = useA ? ax : bx; out.dy = useA ? ay : by;
  out.cx = x - out.dx; out.cy = y - out.dy;
  return out;
}
/** How far (x, y) is from the nearest hexagon edge, in lobule radii: 0 on an edge, the apothem at a centre (twin of the shader's edge distance). */
export function hexEdgeDistance(dx: number, dy: number): number { const qx = Math.abs(dx), qy = Math.abs(dy); return HEX_APOTHEM - Math.max(qy, qx * HEX_APOTHEM + qy * 0.5); }

/** A lobule position (the field's vLob: the plane's x and the page's y down, over LOBULE_R) from a position in the lobule's own local units (y up). */
export const lobuleOf = (lx: number, ly: number): [number, number] => [lx / LOBULE_R, -ly / LOBULE_R];

/** GLSL: lobuleHex(lob) gives the offset from the centre of the lobule that holds lob (xy) and the distance to its nearest edge (z); the same maths as lobuleCentre and hexEdgeDistance. */
export const LOBULE_HEX_GLSL = /* glsl */ `
vec3 lobuleHex(vec2 lob) {
  vec2 st = vec2(${STEP_X.toFixed(1)}, ${STEP_Y.toFixed(16)});
  vec2 a = mod(lob + st * 0.5, st) - st * 0.5;
  vec2 b = mod(lob, st) - st * 0.5;
  vec2 d = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(d);
  return vec3(d, ${HEX_APOTHEM.toFixed(16)} - max(q.y, q.x * ${HEX_APOTHEM.toFixed(16)} + q.y * 0.5));
}`;
