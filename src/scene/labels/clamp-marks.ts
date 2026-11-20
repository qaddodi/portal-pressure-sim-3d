// The stenosis's arrowheads, drawn flat on the screen (Mohammad, 20 Nov: "the arrows that show the stenosis should be more elegant, and should be 2D not 3D laid on"). A narrowed vessel
// (disease/clamps.ts marks()) gets one pair, one each side of its waist, pointing at the narrowest place from just off the pinched wall (2D stage-clamps.js: tip at half the narrowed
// width + a small gap). They are DOM like the label callouts: a bold chevron (no stem; Mohammad, 20 Nov: "i like it as a chevron only and it should be more prominent, like the labels style
// with outline") in the label ink with the labels' own halo round it, laid in the clock's tags phase with `transform` and `opacity` only.
// The placing is pure (placeMarks): the same for every stenosable vessel, whatever way the camera looks at it.
import { Vector3 } from 'three';
import type { ClampMark } from '../disease/clamps.ts';

/** The mark at scale 1, in CSS px: the chevron's length (tip to the arms' ends) and its width across, the ink's stroke, and the gap between the pinched wall and the tip. The halo is the labels' own (--lb-halo-w). */
export const MARK = { len: 11, span: 16, stroke: 3.4, gap: 5 } as const;
/** The mark grows with the vessel it points at (its drawn radius on the screen), within limits: never a speck, never a banner. */
export const markScale = (radiusPx: number): number => Math.min(1.5, Math.max(0.95, radiusPx / 7));
/** The chevron as an SVG path in the mark's own frame: the tip at the origin, the arms running back along +x (the tail), so the chevron points at the waist. Static: it is built once and never rewritten. */
export const MARK_PATH = `M${MARK.len} ${-MARK.span / 2}L0 0L${MARK.len} ${MARK.span / 2}`;

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
    // (the halo under the ink, as the labels' letters have: one path drawn twice, wide in the halo's colour, then in the ink; built once)
    e.innerHTML = `<svg style="left:-6px;top:${-MARK.span / 2 - 6}px" width="${MARK.len + 12}" height="${MARK.span + 12}" viewBox="${-6} ${-MARK.span / 2 - 6} ${MARK.len + 12} ${MARK.span + 12}" aria-hidden="true"><path class="cm-halo" d="${MARK_PATH}"/><path class="cm-ink" d="${MARK_PATH}"/></svg>`;
    e.style.setProperty('--cm-stroke', `${MARK.stroke}px`);
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
