// The stenosis's arrowheads, drawn flat on the screen (Mohammad, 20 Nov: "the arrows that show the stenosis should be more elegant, and should be 2D not 3D laid on"). A narrowed vessel
// (disease/clamps.ts marks()) gets one pair, one each side of its waist, pointing at the narrowest place from just off the pinched wall (2D stage-clamps.js: tip at half the narrowed
// width + a small gap). They are DOM like the label callouts: the blood chevron's own filled head (Mohammad, 20 Nov: "a chevron similar to the blood ones; and not that big of an outline;
// just use the same as labels") in the label ink with the labels' own thin outline, laid in the clock's tags phase with `transform` and `opacity` only.
// The placing is pure (placeMarks): the same for every stenosable vessel, whatever way the camera looks at it.
import { Vector3 } from 'three';
import type { ClampMark } from '../disease/clamps.ts';
import { chevPolygon } from '../blood/chevron-glsl.ts';

/** The mark at scale 1, in CSS px: the half width of the head (the head is the blood chevron's own shape, chevron-glsl.ts chevPolygon) and the gap between the pinched wall and its point. */
export const MARK = { hw: 5.5, gap: 5 } as const;
/** The mark grows with the vessel it points at (its drawn radius on the screen), within limits: never a speck, never a banner. (Kept near 1 so the label outline round it, which scales with it, stays the labels' own.) */
export const markScale = (radiusPx: number): number => Math.min(1.25, Math.max(0.95, radiusPx / 8));
/** The head as an SVG path in the mark's own frame: the blood chevron's shape, its point at the origin and its back running along +x (the tail), so it points at the waist. Static: built once. */
export const MARK_PATH = `M${chevPolygon(MARK.hw).map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join('L')}Z`;
/** The head's length, point to back. */
export const MARK_LEN = chevPolygon(MARK.hw)[1]![0];

export interface Placed { x: number; y: number; angle: number; scale: number }

/** Both arrowheads of a mark. `axis` is the waist's middle on the screen and `side` where one full radius along the vessel's normal lands (both CSS px). The tip stands at the pinched
 *  wall (the radius on the screen times what is left of it) plus the gap, on its own side of the axis, and the mark's own +x points away from the vessel (its tail), so the head points at the waist. */
export function placeMarks(axis: { x: number; y: number }, side: { x: number; y: number }, cur: number): [Placed, Placed] | null {
  const dx = side.x - axis.x, dy = side.y - axis.y, r = Math.hypot(dx, dy);
  if (!(r > 1e-3) || !Number.isFinite(r)) return null;
  const s = markScale(r), ux = dx / r, uy = dy / r, d = r * (1 - Math.min(0.97, Math.max(0, cur))) + MARK.gap * s;
  return [1, -1].map((g) => ({ x: axis.x + g * ux * d, y: axis.y + g * uy * d, angle: Math.atan2(g * uy, g * ux), scale: s })) as [Placed, Placed];
}

interface Rec { a: HTMLElement; b: HTMLElement; txA: string; txB: string; op: string; on: boolean }

/** The arrowheads' DOM, built once per vessel as it is first narrowed and written by the clock's tags phase. */
export class ClampMarks {
  private recs = new Map<string, Rec>();
  private seen = new Set<string>();
  private p = { x: 0, y: 0 }; private q = { x: 0, y: 0 };
  private v = new Vector3();
  private readonly root: HTMLElement;
  private readonly project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number };
  constructor(root: HTMLElement, project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }) { this.root = root; this.project = project; }

  private head(): HTMLElement {
    const e = document.createElement('i'); e.className = 'cm';
    // (one path: filled in the label ink, outlined by the labels' own halo drawn under the fill, as their letters are; built once)
    const pad = 8, h = MARK.hw + pad;
    e.innerHTML = `<svg style="left:${-pad}px;top:${-h}px" width="${MARK_LEN + 2 * pad}" height="${2 * h}" viewBox="${-pad} ${-h} ${MARK_LEN + 2 * pad} ${2 * h}" aria-hidden="true"><path d="${MARK_PATH}"/></svg>`;
    this.root.appendChild(e); return e;
  }

  /** One frame: where every mark stands now. Returns true while any shows (the scene asks for its own frames while a narrowing eases or the camera moves). */
  paint(marks: readonly ClampMark[]): boolean {
    this.seen.clear();
    for (const m of marks) {
      this.v.set(m.at.x, m.at.y, m.at.z);
      const axis = this.project(this.v, this.p), ax = axis.x, ay = axis.y;
      this.v.set(m.at.x + m.nx * m.radius, m.at.y + m.ny * m.radius, m.at.z);
      const side = this.project(this.v, this.q), pl = placeMarks({ x: ax, y: ay }, side, m.cur);
      if (!pl) continue;
      let r = this.recs.get(m.id);
      if (!r) { r = { a: this.head(), b: this.head(), txA: '', txB: '', op: '', on: false }; this.recs.set(m.id, r); }
      this.seen.add(m.id);
      const f = (p: Placed) => `translate(${rnd(p.x)}px,${rnd(p.y)}px) rotate(${p.angle.toFixed(4)}rad) scale(${p.scale.toFixed(3)})`;
      const ta = f(pl[0]), tb = f(pl[1]), op = String(Math.round(m.shown * 1000) / 1000);
      if (ta !== r.txA) { r.a.style.transform = ta; r.txA = ta; }
      if (tb !== r.txB) { r.b.style.transform = tb; r.txB = tb; }
      if (op !== r.op) { r.a.style.opacity = op; r.b.style.opacity = op; r.op = op; }
      if (!r.on) { r.on = true; r.a.setAttribute('data-on', ''); r.b.setAttribute('data-on', ''); }
    }
    for (const [id, r] of this.recs) if (!this.seen.has(id) && r.on) { r.on = false; r.a.removeAttribute('data-on'); r.b.removeAttribute('data-on'); r.a.style.opacity = '0'; r.b.style.opacity = '0'; r.op = '0'; }
    return this.seen.size > 0;
  }

  destroy(): void { for (const r of this.recs.values()) { r.a.remove(); r.b.remove(); } this.recs.clear(); }
}

const rnd = (n: number): number => Math.round(n * 100) / 100;
