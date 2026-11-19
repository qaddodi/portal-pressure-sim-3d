// What the catheter's readings do on the figure, from the state of the case to the frame: which cards stand (FHVP at the tip, WHVP ahead of it, or the
// stack the two make with the HVPG), where (cath.ts: the 2D app's own placing), and how they come and go (the 2D app's timings: a card fades in
// over a surface step with a 6 px rise and out over a small step; the result's readings travel from where their cards stood, the bracket and leaders
// follow at 650 ms and the HVPG at 750 ms with a small rise). Pure: no DOM, no three.js, no clock; the controller calls `solve` when the picture is still
// and something changed, and `step` every frame; the layer writes what `frame` holds as transform and opacity.
import type { CathState } from '../../decks/schema.ts';
import type { Box } from './geometry.ts';
import { LABEL_NAMES } from './names.copied.ts';
import { LS, type Vp } from './type.ts';
import { hvpgSev } from '../../ui/cuts.ts';
import {
  cathType, pillSize, pillGlass, placePills, swapOf, tightFor, sumLayout, placeStack, leadersOf, sumFlow, easeArrive, SUM_MS,
  type Band, type Glass, type Measure, type Pt, type Reading, type Side, type SumGeom, type CathType, type Tone,
} from './cath.ts';

const C = LS.CATH, N = LABEL_NAMES.CALLOUTS;

export type PillId = 'f' | 'w';
/** The readings as text, formatted as the cards print them. `hv` is the HVPG as a number (its band colours the card). */
export interface CathText { f: string; w: string; h: string; hv: number | null }
export interface CathIn {
  vp: Vp;
  cath: CathState | null;
  measure: Measure;
  /** The room the cards may use, canvas px (under the top bar, inside the safe areas). */
  band: Band;
  /** Cards, the strip, the key: boxes a reading never stands under. */
  blockers: readonly Box[];
  /** Canvas px of the catheter's tip and of the point ahead of it; null while the catheter is not there yet. `got`: 0 not there, 1 tip there, 2 wedged. */
  tip: Pt | null; ahead: Pt | null; got: 0 | 1 | 2;
  text: CathText;
}

/** The cards a catheter state shows (hvpg-proc.js): the free reading at the tip; the wedged reading ahead of it with the free one kept where it was taken;
 *  the stack (wedged over free, the HVPG they give) once the result is in. The route shows none: nothing is measured yet. */
export type CalloutKind = 'f' | 'w' | 's';
export function calloutsFor(cath: CathState | null): CalloutKind[] {
  switch (cath) {
    case 'free': return ['f'];
    case 'wedge': return ['f', 'w'];
    case 'result': return ['s'];
    default: return [];
  }
}

export const toneOf = (hv: number | null): Tone => (hv == null || !Number.isFinite(hv) ? 'caution' : hvpgSev(hv));
const reading = (kind: 'free' | 'wedge' | 'result', value: string, tone: Tone): Reading => ({ kicker: N[kind].kicker, value, unit: N[kind].unit, tone });

export interface PillDraw {
  id: PillId; reading: Reading;
  /** The card's corner, canvas px, and its size. */
  x: number; y: number; w: number; h: number;
  dir: 'top' | 'bottom'; glass: Glass;
  alpha: number; /** the arrival's rise, px (translateY), 6 → 0 */ rise: number;
  /** Changes whenever the shape does: the layer redraws the glass only then. */
  key: string;
}
export interface SumDraw {
  /** The box's corner, canvas px. */ x: number; y: number;
  /** The corner radius of its cards (the tight ones are smaller). */ radius: number;
  geom: SumGeom; rows: [Reading, Reading]; calc: Reading;
  leaders: { d: [string, string]; dots: [Pt, Pt] };
  /** The whole stack's fade (a camera move, a card in the way). */ alpha: number;
  /** Each row: its own opacity (a row that travels is there from the first frame; one that does not rises and fades in), the pixels still to travel, the rise. */
  row: [{ alpha: number; dx: number; dy: number; rise: number }, { alpha: number; dx: number; dy: number; rise: number }];
  lead: number; calcAlpha: number; calcRise: number;
  key: string;
}
export interface CathFrame { pills: PillDraw[]; sum: SumDraw | null }

interface PillTarget { id: PillId; reading: Reading; x: number; y: number; w: number; h: number; dir: 'top' | 'bottom'; glass: Glass; box: Box; key: string }
interface SumTarget { x: number; y: number; radius: number; geom: SumGeom; rows: [Reading, Reading]; calc: Reading; leaders: SumDraw['leaders']; box: Box; key: string }
interface PillRec { t: PillTarget; p: number }
interface SumRec { t: SumTarget; fade: number; u: number; from: [{ x: number; y: number } | null, { x: number; y: number } | null] }

const k4 = (b: Box) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;

export class CathShow {
  private want: { pills: Map<PillId, PillTarget>; sum: SumTarget | null } = { pills: new Map(), sum: null };
  private readonly pills = new Map<PillId, PillRec>();
  private sum: SumRec | null = null;
  private readonly sides = new Map<PillId, Side>();
  private swapWas = false;
  readonly frame: CathFrame = { pills: [], sum: null };
  /** The boxes the cards take now (a station's label keeps clear of them). */
  boxes: Box[] = [];
  /** Just the cards (no pointer's run to its point): what a card standing on another or on a screen card is judged by. */
  cards: Box[] = [];

  /** The cards' sizes need the text; `type` is the card's type at this screen. */
  type(vp: Vp): CathType { return cathType(vp); }

  /** Where the cards stand, worked out for the picture as it is now (the camera still): called when something changed. */
  solve(inp: CathIn): void {
    const kinds = calloutsFor(inp.cath), t = cathType(inp.vp);
    const pills = new Map<PillId, PillTarget>();
    let sum: SumTarget | null = null;
    const rf = reading('free', inp.text.f, 'free'), rw = reading('wedge', inp.text.w, 'wedge'), rh = reading('result', inp.text.h, toneOf(inp.text.hv));
    const ids = kinds.filter((k): k is PillId => k !== 's').filter((id) => inp.got >= (id === 'f' ? 1 : 2));
    if (ids.length && inp.tip && inp.ahead) {
      const items = ids.map((id) => {
        const r = id === 'f' ? rf : rw, p = id === 'f' ? inp.tip! : inp.ahead!, sz = pillSize(t, r, inp.measure, false);
        return { id, x: p[0], y: p[1], w: sz.w, h: sz.h, prefer: id === 'f', was: this.sides.get(id) ?? null };
      });
      const out = placePills(items, inp.band, inp.blockers);
      for (const o of out) {
        const it = items.find((i) => i.id === o.id)!, id = o.id as PillId, r = id === 'f' ? rf : rw;
        this.sides.set(id, o.side);
        const ax = (id === 'f' ? inp.tip![0] : inp.ahead![0]) - (o.x0 + it.w / 2);
        const glass = pillGlass(it.w, it.h, Math.min(t.radius, it.h / 2), o.dir, ax);
        pills.set(id, { id, reading: r, x: o.x0, y: o.y0, w: it.w, h: it.h, dir: o.dir, glass, box: o.box, key: `${k4(o.box)}|${o.dir}|${Math.round(glass.px)}|${it.w}|${it.h}` });
      }
    } else for (const id of ['f', 'w'] as const) this.sides.delete(id);
    if (kinds.includes('s') && inp.tip && inp.ahead && inp.got >= 2) {
      const tight = tightFor(inp.band);
      const swap = swapOf(inp.tip[1], inp.ahead[1], this.swapWas);
      this.swapWas = swap;
      const geom = sumLayout(t, [rw, rf], rh, inp.measure, tight, swap);
      const at = placeStack(inp.tip, inp.ahead, geom.w, geom.h, inp.band, inp.blockers);
      const leaders = leadersOf([at.x, at.y], geom, [inp.ahead, inp.tip], inp.tip, inp.ahead);
      const box = { x0: at.x, y0: at.y, x1: at.x + geom.w, y1: at.y + geom.h };
      sum = { x: at.x, y: at.y, radius: tight ? C.STACK.tightRow.radius : t.radius, geom, rows: [rw, rf], calc: rh, leaders, box, key: `${k4(box)}|${geom.swap ? 1 : 0}${geom.tight ? 1 : 0}|${leaders.d.join('')}` };
    }
    this.want = { pills, sum };
    this.boxes = [...[...pills.values()].map((p) => p.box), ...(sum ? [sum.box] : [])];
    this.cards = [...[...pills.values()].map((p) => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h })), ...(sum ? [sum.box] : [])];
    // the text of a card on show follows at once (a number ticking is no new spot)
    for (const [id, rec] of this.pills) { const w = pills.get(id); if (w && w.key === rec.t.key) rec.t = w; }
    if (this.sum && sum && sum.key === this.sum.t.key) this.sum.t = sum;
  }

  /** The numbers on show change without a new place (a reading counting up keeps its box): written into what stands. */
  setText(t: CathText): void {
    const val = (r: Reading, v: string, tone = r.tone): Reading => (r.value === v && r.tone === tone ? r : { ...r, value: v, tone });
    const tf = (p: PillTarget) => { const v = p.id === 'f' ? t.f : t.w; if (p.reading.value !== v) p.reading = val(p.reading, v); };
    for (const p of this.want.pills.values()) tf(p);
    for (const r of this.pills.values()) tf(r.t);
    const ts = (u: SumTarget) => { u.rows = [val(u.rows[0], t.w), val(u.rows[1], t.f)]; u.calc = val(u.calc, t.h, toneOf(t.hv)); };
    if (this.want.sum) ts(this.want.sum);
    if (this.sum) ts(this.sum.t);
  }

  /** Advance by `dt` ms. `hold`: the picture is moving or has not settled, so every card fades out where it stands. Returns true while anything is still moving. */
  step(dt: number, hold: boolean): boolean {
    let busy = false;
    const inn = dt / C.MS.surface, out = dt / C.MS.small;
    const sameSpot = (a: PillTarget, b: PillTarget) => a.key === b.key;
    // the result's stack takes over the cards: its rows start where the cards stood (a card not yet drawn leaves its row to rise in)
    const sumWanted = this.want.sum;
    if (sumWanted && !this.sum && !hold) {
      const from: SumRec['from'] = [null, null];
      // row 0 is the wedged reading, row 1 the free one
      const f = this.pills.get('w'), g = this.pills.get('f');
      if (f && f.p > 0.2) from[0] = { x: f.t.x, y: f.t.y };
      if (g && g.p > 0.2) from[1] = { x: g.t.x, y: g.t.y };
      this.sum = { t: sumWanted, fade: 0, u: 0, from };
      this.pills.clear();
    }
    for (const id of ['f', 'w'] as const) {
      const w = this.want.pills.get(id);
      const rec = this.pills.get(id);
      if (!rec) { if (w && !hold && !this.sum) { this.pills.set(id, { t: w, p: 0 }); busy = true; } continue; }
      let target = 1;
      if (hold || !w || this.sum) target = 0;
      else if (!sameSpot(rec.t, w)) target = 0;
      if (rec.p < target) { rec.p = Math.min(target, rec.p + inn); if (rec.p !== target) busy = true; }
      else if (rec.p > target) { rec.p = Math.max(target, rec.p - out); if (rec.p !== target) busy = true; }
      if (rec.p <= 0) {
        if (!w || this.sum) this.pills.delete(id);
        else if (!hold && !sameSpot(rec.t, w)) { rec.t = w; busy = true; }
        else if (!hold) busy = true;
      }
    }
    const s = this.sum;
    if (s) {
      s.u += dt;
      let target = 1;
      if (hold || !sumWanted) target = 0;
      else if (s.t.key !== sumWanted.key) target = 0;
      if (s.fade < target) { s.fade = Math.min(target, s.fade + (s.u < SUM_MS.travel ? 1 : inn)); busy = true; }
      else if (s.fade > target) { s.fade = Math.max(target, s.fade - out); busy = true; }
      if (s.fade <= 0) {
        if (!sumWanted) { this.sum = null; }
        else if (!hold && s.t.key !== sumWanted.key) { s.t = sumWanted; s.from = [null, null]; s.u = SUM_MS.total; busy = true; }
        else if (!hold) busy = true;
      }
      if (this.sum && this.sum.u < SUM_MS.total) busy = true;
    }
    this.draw();
    return busy;
  }

  private draw(): void {
    const f = this.frame;
    f.pills.length = 0;
    for (const rec of this.pills.values()) {
      if (rec.p <= 0) continue;
      const a = easeArrive(rec.p), t = rec.t;
      f.pills.push({ id: t.id, reading: t.reading, x: t.x, y: t.y, w: t.w, h: t.h, dir: t.dir, glass: t.glass, alpha: a, rise: C.RISE * (1 - a), key: t.key });
    }
    const s = this.sum;
    if (!s || s.fade <= 0) { f.sum = null; return; }
    const t = s.t;
    const rowAt = (j: 0 | 1) => {
      const from = s.from[j], flow = sumFlow(s.u, !!from);
      const R = t.geom.rows[j], rx = t.x + R.x, ry = t.y + R.y;
      return { alpha: from ? 1 : 1 - flow.rise / C.RISE, dx: from ? (from.x - rx) * flow.flip : 0, dy: from ? (from.y - ry) * flow.flip : 0, rise: from ? 0 : flow.rise };
    };
    const a = rowAt(0), b = rowAt(1), flow = sumFlow(s.u, !!(s.from[0] || s.from[1]));
    f.sum = {
      x: t.x, y: t.y, radius: t.radius, geom: t.geom, rows: t.rows, calc: t.calc, leaders: t.leaders, alpha: s.fade,
      row: [a, b],
      lead: flow.lead, calcAlpha: flow.calc, calcRise: flow.calcRise, key: t.key,
    };
  }
}
