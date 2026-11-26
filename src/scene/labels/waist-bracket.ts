// The stent's waist bracket in the figure (Mohammad, 21 Nov: "we used to have a bracket showing the waist of the TIPS in the 2D version"; 2D tips-figure.js and the card's picture draw it): a quiet
// bracket beside the stent, from where the waist's flat floor starts to where it ends, with a short tick at each end pointing at the stent. It FOLLOWS THE STENT'S CURVE (Mohammad, 26 Nov: it was a
// straight bar between the two ends and cut across the wall on a bend): one SVG path through points on the stent's own axis, each offset one wall plus a gap along the axis's local normal (placeCurve, pure).
// It is DOM like the stenosis arrowheads (clamp-marks.ts), written by the clock's tags phase (the path's text only when it moved by a tenth of a pixel, and `opacity`), and it fades in as the waist
// comes (the same 0.004 to 0.034 ramp the card's picture uses) and out as it goes, never popping. The same for either stent, whatever way the camera looks at it.
import { Vector3 } from 'three';
import type { StentDevice } from '../devices/stent/stent-device.ts';
import { CURVE_PTS, bracketPath, placeCurve } from './waist-place.ts';
export { CURVE_PTS, GAP, TICK, bracketPath, placeCurve, waistOn } from './waist-place.ts';

interface Rec { svg: SVGSVGElement; path: SVGPathElement; d: string; op: string; on: boolean }
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The brackets' DOM, one set per stent, built when it first has a waist. */
export class WaistBrackets {
  private recs = new Map<string, Rec>();
  private seen = new Set<string>();
  private a = new Vector3(); private b = new Vector3(); private m = new Vector3(); private nrm = new Vector3();
  private axis3: Vector3[] = Array.from({ length: CURVE_PTS }, () => new Vector3());
  private axis2: { x: number; y: number }[] = Array.from({ length: CURVE_PTS }, () => ({ x: 0, y: 0 }));
  private pm = { x: 0, y: 0 }; private pn = { x: 0, y: 0 };
  private readonly root: HTMLElement;
  private readonly project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number };
  constructor(root: HTMLElement, project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }) { this.root = root; this.project = project; }

  private make(): Rec {
    const svg = document.createElementNS(SVG_NS, 'svg'), path = document.createElementNS(SVG_NS, 'path');
    svg.setAttribute('class', 'wb wb-curve'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('class', 'wb-path');
    svg.appendChild(path); this.root.appendChild(svg);
    return { svg, path, d: '', op: '', on: false };
  }

  /** One frame. Returns true while any bracket shows. */
  paint(stents: Iterable<[string, StentDevice]>): boolean {
    this.seen.clear();
    for (const [id, s] of stents) {
      const w = s.waistMark(this.a, this.b);
      if (!w || w.shown <= 0.001 || !s.waistAxis(this.axis3)) continue;
      for (let i = 0; i < this.axis3.length; i++) this.project(this.axis3[i]!, this.axis2[i]!);
      // the stent's radius on the screen, and the screen normal at the middle (the chord's, turned a quarter)
      this.m.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.nrm.set(-(this.b.y - this.a.y), this.b.x - this.a.x, 0);
      if (this.nrm.lengthSq() < 1e-12) this.nrm.set(0, 1, 0); else this.nrm.normalize();
      const pm = this.project(this.m, this.pm);
      this.m.addScaledVector(this.nrm, w.r);
      const pn = this.project(this.m, this.pn), r = Math.hypot(pn.x - pm.x, pn.y - pm.y);
      const pl = placeCurve(this.axis2, r, { x: pn.x - pm.x, y: pn.y - pm.y });
      if (!pl) continue;
      let rec = this.recs.get(id);
      if (!rec) { rec = this.make(); this.recs.set(id, rec); }
      this.seen.add(id);
      const d = bracketPath(pl);
      if (d !== rec.d) { rec.path.setAttribute('d', d); rec.d = d; }
      const op = String(Math.round(w.shown * 1000) / 1000);
      if (op !== rec.op) { rec.svg.style.opacity = op; rec.op = op; }
      if (!rec.on) { rec.on = true; rec.svg.setAttribute('data-on', ''); }
    }
    for (const rec of this.recs.values()) {
      if (rec.on && ![...this.seen].some((id) => this.recs.get(id) === rec)) { rec.on = false; rec.svg.removeAttribute('data-on'); rec.svg.style.opacity = '0'; rec.op = '0'; }
    }
    return this.seen.size > 0;
  }

  destroy(): void { for (const r of this.recs.values()) r.svg.remove(); this.recs.clear(); }
}
