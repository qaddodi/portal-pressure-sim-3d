// THE OESOPHAGUS'S WALL ON THE PLACED ANATOMY (`?anatomy=new`), for the vessels that lie on it: the oesophageal varices (Mohammad, 24 Nov: "varices should be surrounding the esophagus"). The varices are the
// submucosal and para-oesophageal veins of the lower oesophagus: they run up its wall all round it, from the cardia, where the coronary vein brings them portal blood, to where they drain on to the azygos side. The
// vessels are built at load, before the organ file is in, so the tube's axis and half-widths are a table: measured from the placed stomach mesh (organs/meshes.ts ORGAN_MESHES.stomach, the oesophagus is part of it)
// in slices across y, its middle (x, z) and half-widths (x, z) per slice; tests/anatomy-varices-wrap.test.ts checks the table against the mesh, so a re-placed organ cannot leave the varices off its wall.
// Pure data, scene units.

/** [y, centre x, centre z, half-width x, half-width z] of the oesophagus, from the cardia (y 1.10, where the tube stands clear of the stomach) to the plate's top. */
export const ESO_ROWS: readonly (readonly [number, number, number, number, number])[] = [
  [1.10, 0.306, -0.067, 0.030, 0.028], [1.16, 0.302, -0.079, 0.029, 0.030], [1.22, 0.299, -0.095, 0.028, 0.033], [1.28, 0.296, -0.111, 0.028, 0.034],
  [1.34, 0.293, -0.127, 0.028, 0.035], [1.40, 0.290, -0.142, 0.027, 0.035], [1.46, 0.287, -0.153, 0.028, 0.035], [1.52, 0.285, -0.159, 0.028, 0.035],
  [1.58, 0.282, -0.160, 0.028, 0.035], [1.70, 0.278, -0.160, 0.029, 0.036], [1.82, 0.273, -0.160, 0.030, 0.038],
];
/** How far out from the wall a varix's centreline lies (scene units): the widest strand's radius (the column, beaded: shape.ts VARIX_THICK, bead floor), so the strands lie ON the wall, touching it, never in it. */
export const ESO_VARIX_GAP = 0.012;

export interface EsoSlice { cx: number; cz: number; rx: number; rz: number }
/** The oesophagus's slice at height `y` (held at the table's ends). */
export function esoAt(y: number): EsoSlice {
  const R = ESO_ROWS;
  if (y <= R[0]![0]) { const r = R[0]!; return { cx: r[1], cz: r[2], rx: r[3], rz: r[4] }; }
  for (let i = 1; i < R.length; i++) {
    const a = R[i - 1]!, b = R[i]!;
    if (y <= b[0]) { const t = (y - a[0]) / (b[0] - a[0]), l = (j: number): number => a[j]! + (b[j]! - a[j]!) * t; return { cx: l(1), cz: l(2), rx: l(3), rz: l(4) }; }
  }
  const r = R[R.length - 1]!; return { cx: r[1], cz: r[2], rx: r[3], rz: r[4] };
}
/** The wall's distance from the axis in the direction `th` round it (radians; 0 is +x, a quarter turn +z, toward the viewer). */
export const wallR = (s: EsoSlice, th: number): number => 1 / Math.hypot(Math.cos(th) / s.rx, Math.sin(th) / s.rz);
/** A point's angle round the axis and its distance out from the wall there. */
export function aroundEso(p: readonly number[]): { th: number; out: number; s: EsoSlice } {
  const s = esoAt(p[1]!), dx = p[0]! - s.cx, dz = p[2]! - s.cz, th = Math.atan2(dz, dx);
  return { th, out: Math.hypot(dx, dz) - wallR(s, th), s };
}
/** The point at height `y`, angle `th` round the axis and `out` beyond the wall. */
export function onEso(y: number, th: number, out: number): [number, number, number] {
  const s = esoAt(y), r = wallR(s, th) + out;
  return [s.cx + r * Math.cos(th), y, s.cz + r * Math.sin(th)];
}
