// The ascites cavity for the PLACED anatomy (`?anatomy=new`; docs/approved/ascites-surface.md, "Round belly"): the water's wall fitted to the new gut, picked by Mohammad on 24 Nov (mock B of
// /mnt/project-files/ascites-new-anatomy-24nov/ascites-options-A-B-C.png: "B"). Why a new wall: today's cavity (ABDOMEN_OUTLINES, 2D's outline, ascites-pool.ts) is a fixed 336..1088 tub drawn for the OLD organs; the placed
// gut is narrower (the colon spans x 453 to 1038, bowel 503 to 962 in the 2D frame) and its rectum reaches y 1098, below the old floor (1041), so the tub was 117 units wider than the gut each side and the rectum stuck out under it.
//
// Each side of the wall is the gut's own edge (colon and small bowel front silhouettes, PLACED_ORGAN_RINGS, per 2D y) plus a margin that grows with the volume (36 empty to 58 full), smoothed (a Gaussian of SIGMA), limited so the
// wall never closes in faster than LEAN going down, and less and less toward the join (the low-fill flare toward the colon, docs/approved/ascites-surface.md "Low-fill contour": a pool standing low has upright sides, never a wedge), bowed outward by BOW
// at its middle (a belly, not a tub) and joined at JOIN_Y to a rounded floor that passes FLOOR_PAD under the rectum. Above y 620 the wall holds the gut's x at 620 (the colon's flexures start there).
// Pure: `placedCavity(step, rings)` takes the rings, so the tests need no anatomy switch; polyOf (ascites-pool.ts) picks it when PLACED.
export const CAVITY = {
  /** The wall's top (2D y): the polygon's top corners, as 2D's outline has them. */
  TOP: 440, DY: 4,
  /** Margin from the gut's edge: empty belly and full belly (2D units). */
  M0: 36, M1: 58,
  /** The Gaussian that smooths the gut's edge (2D units): wide enough that the wall is a belly, not the colon's bumps. */
  SIGMA: 70,
  /** The most the wall may close in going down (dx per dy): about 8 degrees from vertical. */
  LEAN: 0.3,
  /** From this y the allowed closing-in eases from LEAN to nothing at JOIN_Y (a quarter cosine: a wall that is a curve and stands upright where it meets the floor). */
  LEAN_FROM: 600,
  /** The wall flares out a little toward the top (the costal margin), by this much at the top corners, easing to nothing at GUT_FROM: the wall has curvature from its first row. */
  TOP_FLARE: 14,
  /** The outward bow at mid height (2D units, a half sine from TOP to JOIN_Y). */
  BOW: 56, BOW_TO: 980,
  /** Where the wall hands over to the rounded floor, and how far under the gut's lowest point (the rectum, y 1098) the floor passes. */
  JOIN_Y: 980, FLOOR_PAD: 12,
  /** The gut is read from this y down; above it the wall holds the value at it. */
  GUT_FROM: 620, GUT_BOTTOM: 1100,
  /** The floor's axis: the rectum's x (the lowest point of the figure) pulled this share of the way from the wall's middle. */
  FLOOR_AXIS: 775, FLOOR_PULL: 0.6,
  /** The floor's two Bezier handles as shares of the drop under the wall and of the way across (0.55 is an ellipse's quarter). */
  FLOOR_DOWN: 0.55, FLOOR_ACROSS: 0.55,
} as const;

type Ring = readonly (readonly [number, number])[];
export interface GutRings { colon: Ring; bowel: Ring }

/** The left and right x where a closed ring crosses the horizontal at y, or null. */
function span(ring: Ring, y: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [xa, ya] = ring[i]!, [xb, yb] = ring[(i + 1) % ring.length]!;
    if ((ya <= y && y < yb) || (yb <= y && y < ya)) { const x = xa + ((y - ya) / (yb - ya)) * (xb - xa); lo = Math.min(lo, x); hi = Math.max(hi, x); }
  }
  return hi < lo ? null : [lo, hi];
}

const bez = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) { const u = k / n, v = 1 - u; out.push([v * v * v * a[0]! + 3 * v * v * u * b[0]! + 3 * v * u * u * c[0]! + u * u * u * d[0]!, v * v * v * a[1]! + 3 * v * v * u * b[1]! + 3 * v * u * u * c[1]! + u * u * u * d[1]!]); }
  return out;
};

/** The gut's smoothed left and right edge at every row (2D y = TOP + i * DY), from the rings. Cached by the caller. */
export function gutEdges(rings: GutRings): { left: number[]; right: number[] } {
  const { TOP, DY, GUT_FROM, GUT_BOTTOM, SIGMA } = CAVITY, n = Math.floor((GUT_BOTTOM - TOP) / DY) + 1;
  const gl: number[] = [], gr: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = TOP + i * DY; let l = Infinity, r = -Infinity;
    for (const ring of [rings.colon, rings.bowel]) { const s = span(ring, y); if (s) { l = Math.min(l, s[0]); r = Math.max(r, s[1]); } }
    gl.push(l); gr.push(r);
  }
  const f0 = Math.round((GUT_FROM - TOP) / DY);
  for (let i = 0; i < f0; i++) { gl[i] = gl[f0]!; gr[i] = gr[f0]!; }
  const smooth = (a: readonly number[]): number[] => a.map((_, i) => {
    let w = 0, t = 0;
    for (let j = 0; j < n; j++) { if (!Number.isFinite(a[j]!)) continue; const d = (j - i) * DY, k = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)); w += k; t += k * a[j]!; }
    return t / w;
  });
  return { left: smooth(gl), right: smooth(gr) };
}

/** The cavity's outline for a bulge step (0..68) as a polygon in 2D units: top left corner, down the left wall, the floor, up the right wall, top right corner (the same order as 2D's outline: landmarks.ts drops the two corners for the flank line). */
const ease = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return 1 - Math.cos((Math.PI / 2) * c); };

export function placedCavity(step: number, edges: { left: number[]; right: number[] }): [number, number][] {
  const { TOP, DY, M0, M1, LEAN, LEAN_FROM, TOP_FLARE, GUT_FROM, BOW, BOW_TO, JOIN_Y, FLOOR_PAD, GUT_BOTTOM, FLOOR_AXIS, FLOOR_PULL, FLOOR_DOWN, FLOOR_ACROSS } = CAVITY;
  const u = Math.min(1, Math.max(0, step / 68)), m = M0 + (M1 - M0) * u;
  const side = (g: readonly number[], sgn: -1 | 1): [number, number][] => {
    const out: [number, number][] = []; let prev = NaN;
    for (let i = 0; i < g.length; i++) {
      const y = TOP + i * DY; if (y > JOIN_Y) break;
      let x = g[i]! + sgn * (m + TOP_FLARE * (1 - Math.min(1, (y - TOP) / (GUT_FROM - TOP))) ** 2 + BOW * Math.sin(Math.PI * Math.min(1, (y - TOP) / (BOW_TO - TOP))));
      if (!Number.isNaN(prev)) { const k = LEAN * (1 - ease((y - LEAN_FROM) / (JOIN_Y - LEAN_FROM))) * DY; x = sgn < 0 ? Math.min(x, prev + k) : Math.max(x, prev - k); }   // never closes in faster than LEAN going down, and less and less toward the join, so the flank is a curve that stands upright where it meets the floor, not a straight line
      out.push([x, y]); prev = x;
    }
    return out;
  };
  const L = side(edges.left, -1), R = side(edges.right, 1);
  const a = L[L.length - 1]!, b = R[R.length - 1]!, yb = GUT_BOTTOM + FLOOR_PAD;
  const xc = (a[0] + b[0]) / 2 + (FLOOR_AXIS - (a[0] + b[0]) / 2) * FLOOR_PULL;
  const slopeA = (a[0] - L[L.length - 6]![0]) / (a[1] - L[L.length - 6]![1]), slopeB = (b[0] - R[R.length - 6]![0]) / (b[1] - R[R.length - 6]![1]);
  const dy = yb - a[1];
  const fl = bez(a, [a[0] + slopeA * dy * 0.25, a[1] + dy * FLOOR_DOWN], [xc - (xc - a[0]) * FLOOR_ACROSS, yb], [xc, yb], 18);
  const fr = bez([xc, yb], [xc + (b[0] - xc) * FLOOR_ACROSS, yb], [b[0] + slopeB * dy * 0.25, b[1] + dy * FLOOR_DOWN], b, 18);
  return [...L, ...fl.slice(1), ...fr.slice(1), ...R.slice().reverse()];
}
