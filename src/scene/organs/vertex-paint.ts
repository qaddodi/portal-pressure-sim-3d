// Colour that varies over an organ's surface, as 2D paints it over the organ: the pale septa between the liver's nodules, the spleen's infarcted lower part after a partial
// embolization (a dead area and the line along its edge). (The pool of blood in the stomach is per pixel in the organ shader: pool-level.ts.) Each organ has an `ink` vertex attribute (the cel shader's own, VERTEX_INK);
// this file works out, once per mesh, how much of each effect every vertex has (from its place in the 2D figure), and later fills the attribute from the organ's colours.
// Pure arithmetic on typed arrays: the layer calls `fill*` only when the organ's colours or the disease change.
import { BufferAttribute, type BufferGeometry, Float32BufferAttribute } from 'three';
import { SPLEEN_PSE_EDGE } from '../disease/copied/anatomy-b4.ts';
import { outlinePolygon } from '../disease/ascites.ts';
import { x2d, y2d } from '../frame2d.ts';
import { PSE_EDGE_A, type RGB } from './organ-look.ts';

/** The organs that carry per-vertex colour. */
export const PAINTED = new Set(['liver', 'spleen']);

const smooth = (e0: number, e1: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

/** The spleen's infarct edge as a function of x: the y (2D, down) of the stroke along the dead part's upper edge. */
const EDGE = outlinePolygon(SPLEEN_PSE_EDGE);
export function infarctEdgeY(x: number): number | null {
  if (x < EDGE[0]![0] || x > EDGE[EDGE.length - 1]![0]) return null;
  for (let i = 1; i < EDGE.length; i++) {
    const a = EDGE[i - 1]!, b = EDGE[i]!;
    if (x >= a[0] && x <= b[0]) return b[0] === a[0] ? a[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return null;
}
/** The infarct at a point of the 2D plane: `dead` 1 below the edge (a 1.5-unit soft rim), `line` 1 on the edge's stroke (about 1.2 units either side). */
export function infarctAt(x: number, y: number): { dead: number; line: number } {
  const ey = infarctEdgeY(x);
  if (ey === null || y > 480) return { dead: 0, line: 0 };
  return { dead: smooth(-1, 1.5, y - ey), line: 1 - smooth(0.6, 2.2, Math.abs(y - ey)) };
}

/** Where the plate's stroke lies along the spleen that stands now: the stroke (x 990 to 1120 on 2D's plate) was drawn across 2D's own spleen, and the approved placement's spleen is narrower and further left (2D x 934 to 1018), so a stroke
 *  laid on the plate's x left the spleen's left two thirds with no edge and a straight upright cut where the stroke began (capture f23a4c59, Gastric varices 11, Embolized). The stroke is stretched across the spleen's own
 *  width (`x0` to `x1`, its leftmost and rightmost vertex), so it runs from one side of the organ to the other whatever the organ is; its height is the plate's. */
export const infarctX = (x0: number, x1: number, x: number): number => EDGE[0]![0] + ((x - x0) / Math.max(1e-6, x1 - x0)) * (EDGE[EDGE.length - 1]![0] - EDGE[0]![0]);

export class VertexPaint {
  readonly attr: BufferAttribute;
  /** the vertices' places in the 2D figure at rest */
  private readonly xs: Float32Array; private readonly ys: Float32Array;
  private readonly dead: Float32Array | null; private readonly line: Float32Array | null;
  readonly count: number;
  /** Adds the `ink` attribute to `g` (it must be there before the CelObject is made: the shader reads it only then) and works out each vertex's share of the organ's effect. */
  constructor(g: BufferGeometry, id: 'liver' | 'spleen') {
    const pos = g.getAttribute('position');
    const n = this.count = pos.count;
    this.xs = new Float32Array(n); this.ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.xs[i] = x2d(pos.getX(i)); this.ys[i] = y2d(pos.getY(i)); }
    if (id === 'spleen') {
      this.dead = new Float32Array(n); this.line = new Float32Array(n);
      let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < n; i++) { x0 = Math.min(x0, this.xs[i]!); x1 = Math.max(x1, this.xs[i]!); }
      for (let i = 0; i < n; i++) { const q = infarctAt(infarctX(x0, x1, this.xs[i]!), this.ys[i]!); this.dead[i] = q.dead; this.line[i] = q.line; }
    } else { this.dead = null; this.line = null; }
    this.attr = new Float32BufferAttribute(new Float32Array(n * 3), 3);
    g.setAttribute('ink', this.attr);
  }
  private put(i: number, c: RGB): void { const a = this.attr.array as Float32Array; a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }

  /** Liver: every vertex the nodule colour; the septum and the dome's light are drawn per pixel by the organ shader (liver-texture.ts). */
  fillLiver(inside: RGB): void {
    for (let i = 0; i < this.count; i++) this.put(i, inside);
    this.attr.needsUpdate = true;
  }
  /** Spleen: the live part `c`, the dead part `dead`, and the line along the edge in `edge` (at PSE_EDGE_A); `amount` 0..1 is how far the infarct has come in. */
  fillSpleen(c: RGB, dead: RGB, edge: RGB, amount: number): void {
    const d = this.dead!, l = this.line!;
    for (let i = 0; i < this.count; i++) {
      const t = d[i]! * amount, u = l[i]! * amount * PSE_EDGE_A;
      const r = c[0] + (dead[0] - c[0]) * t, g = c[1] + (dead[1] - c[1]) * t, b = c[2] + (dead[2] - c[2]) * t;
      this.put(i, [r + (edge[0] - r) * u, g + (edge[1] - g) * u, b + (edge[2] - b) * u]);
    }
    this.attr.needsUpdate = true;
  }
}
