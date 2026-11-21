// The stent's waist bracket in the figure (Mohammad, 21 Nov: "we used to have a bracket showing the waist of the TIPS in the 2D version"; 2D tips-figure.js and the card's picture draw it): a thin
// bracket laid flat on the screen beside the stent, from where the waist's flat floor starts to where it ends, with a short tick at each end pointing at the stent. It is DOM like the stenosis
// arrowheads (clamp-marks.ts), written by the clock's tags phase with `transform` and `opacity` only (the bar is one fixed element scaled to its length), and it fades in as the waist comes
// (the same 0.004 to 0.034 ramp the card's picture uses) and out as it goes, never popping. The placing is pure (placeBracket): the same for either stent, whatever way the camera looks at it.
import { Vector3 } from 'three';
import type { StentDevice } from '../devices/stent/stent-device.ts';
import { BAR, placeBracket } from './waist-place.ts';
export { BAR, GAP, TICK, placeBracket, waistOn } from './waist-place.ts';

interface Rec { bar: HTMLElement; ta: HTMLElement; tb: HTMLElement; tx: string[]; op: string; on: boolean }
const rnd = (n: number): number => Math.round(n * 100) / 100;

/** The brackets' DOM, one set per stent, built when it first has a waist. */
export class WaistBrackets {
  private recs = new Map<string, Rec>();
  private seen = new Set<string>();
  private a = new Vector3(); private b = new Vector3(); private m = new Vector3(); private nrm = new Vector3();
  private pa = { x: 0, y: 0 }; private pb = { x: 0, y: 0 }; private pm = { x: 0, y: 0 }; private pn = { x: 0, y: 0 };
  private readonly root: HTMLElement;
  private readonly project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number };
  constructor(root: HTMLElement, project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }) { this.root = root; this.project = project; }

  private el(cls: string): HTMLElement { const e = document.createElement('i'); e.className = `wb ${cls}`; this.root.appendChild(e); return e; }

  /** One frame. Returns true while any bracket shows. */
  paint(stents: Iterable<[string, StentDevice]>): boolean {
    this.seen.clear();
    for (const [id, s] of stents) {
      const w = s.waistMark(this.a, this.b);
      if (!w || w.shown <= 0.001) continue;
      this.m.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.nrm.set(-(this.b.y - this.a.y), this.b.x - this.a.x, 0);
      if (this.nrm.lengthSq() < 1e-12) this.nrm.set(0, 1, 0); else this.nrm.normalize();
      const pa = this.project(this.a, this.pa), pb = this.project(this.b, this.pb), pm = this.project(this.m, this.pm);
      this.m.addScaledVector(this.nrm, w.r);
      const pn = this.project(this.m, this.pn), r = Math.hypot(pn.x - pm.x, pn.y - pm.y);
      const pl = placeBracket(pa, pb, r, { x: pn.x - pm.x, y: pn.y - pm.y });
      if (!pl) continue;
      let rec = this.recs.get(id);
      if (!rec) { rec = { bar: this.el('wb-bar'), ta: this.el('wb-tick'), tb: this.el('wb-tick'), tx: ['', '', ''], op: '', on: false }; this.recs.set(id, rec); }
      this.seen.add(id);
      const t0 = `translate(${rnd(pl.x)}px,${rnd(pl.y)}px) rotate(${pl.angle.toFixed(4)}rad) scaleX(${(pl.len / BAR).toFixed(4)})`;
      const t1 = `translate(${rnd(pl.ta.x)}px,${rnd(pl.ta.y)}px) rotate(${pl.tickAngle.toFixed(4)}rad)`, t2 = `translate(${rnd(pl.tb.x)}px,${rnd(pl.tb.y)}px) rotate(${pl.tickAngle.toFixed(4)}rad)`;
      if (t0 !== rec.tx[0]) { rec.bar.style.transform = t0; rec.tx[0] = t0; }
      if (t1 !== rec.tx[1]) { rec.ta.style.transform = t1; rec.tx[1] = t1; }
      if (t2 !== rec.tx[2]) { rec.tb.style.transform = t2; rec.tx[2] = t2; }
      const op = String(Math.round(w.shown * 1000) / 1000);
      if (op !== rec.op) { rec.bar.style.opacity = op; rec.ta.style.opacity = op; rec.tb.style.opacity = op; rec.op = op; }
      if (!rec.on) { rec.on = true; for (const e of [rec.bar, rec.ta, rec.tb]) e.setAttribute('data-on', ''); }
    }
    for (const rec of this.recs.values()) {
      if (rec.on && ![...this.seen].some((id) => this.recs.get(id) === rec)) { rec.on = false; for (const e of [rec.bar, rec.ta, rec.tb]) { e.removeAttribute('data-on'); e.style.opacity = '0'; } rec.op = '0'; }
    }
    return this.seen.size > 0;
  }

  destroy(): void { for (const r of this.recs.values()) { r.bar.remove(); r.ta.remove(); r.tb.remove(); } this.recs.clear(); }
}
