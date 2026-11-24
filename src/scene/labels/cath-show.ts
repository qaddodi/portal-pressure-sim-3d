// What the catheter's readings do on the figure, from the state of the case to the frame: which tags stand (FHVP at the tip, WHVP ahead of it, or the
// stack the two make with the HVPG), where (cath.ts: the 2D app's own placing), and how they come and go (the 2D app's timings: a tag fades in
// over a surface step with a 6 px rise and out over a small step; the result's readings travel from where their tags stood, the bracket and leaders
// follow at 650 ms and the HVPG at 750 ms with a small rise). Pure: no DOM, no three.js, no clock; the controller calls `solve` when the picture is still
// and something changed, and `step` every frame; the layer writes what `frame` holds as transform and opacity.
import type { CathState } from '../../decks/schema.ts';
import type { Box } from './geometry.ts';
import { LABEL_NAMES } from './names.copied.ts';
import { LS, type Vp } from './type.ts';
import { hvpgSev } from '../../ui/cuts.ts';
import {
  tagType, tagSize, placePills, swapOf, tightFor, sumLayout, placeStack, planLeaders, placeClean, sumFlow, easeArrive, SUM_MS,
  type Band, type Measure, type Pt, type Reading, type Side, type SumGeom, type TagType, type Tone,
} from './cath.ts';

const C = LS.CATH, N = LABEL_NAMES.CALLOUTS;

export type PillId = 'f' | 'w';
/** The readings as text, formatted as the cards print them. `hv` is the HVPG as a number (its band colours the card). */
export interface CathText {
  f: string; w: string; h: string; hv: number | null;
  /** The words at the tip while the catheter stands against a blocked vein (BLOCKED_SAYS): they stand in the free card's place and cross over when they change. Absent: the readings' own. */
  say?: string;
}
/** What the tip says against a blocked hepatic vein (Budd-Chiari): first that the vein is occluded, then, once the pushes have failed, that there is no reading. The words of a measurement that cannot be taken stand where its reading would. */
export const BLOCKED_SAYS = { first: 'Occluded', then: 'No reading', afterMs: 2600 } as const;
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
  /** A procedure's own cards (the EUS-PPG's: PV at the portal target, HV at the hepatic one, the summary): which stand, their names and the portal card's tone. Absent: the catheter's. */
  kinds?: readonly CalloutKind[];
  kickers?: { f: string; w: string; h: string };
  tones?: { f: Tone; w: Tone };
  /** The result stack stands midway between the two points (2D `mid`: the EUS-PPG's). */
  mid?: boolean;
}

/** The cards a catheter state shows (hvpg-proc.js): the free reading at the tip; the wedged reading ahead of it with the free one kept where it was taken;
 *  the stack (wedged over free, the HVPG they give) once the result is in. The route shows none: nothing is measured yet. */
export type CalloutKind = 'f' | 'w' | 's';
export function calloutsFor(cath: CathState | null): CalloutKind[] {
  switch (cath) {
    case 'free': return ['f'];
    case 'wedge': return ['f', 'w'];
    case 'result': return ['s'];
    case 'blocked': return ['f'];   // (no number: the words of BLOCKED_SAYS at the tip)
    default: return [];
  }
}

export const toneOf = (hv: number | null): Tone => (hv == null || !Number.isFinite(hv) ? 'caution' : hvpgSev(hv));
const reading = (kind: 'free' | 'wedge' | 'result', value: string, tone: Tone, kicker?: string): Reading => ({ kicker: kicker ?? N[kind].kicker, value, unit: value ? N[kind].unit : '', tone });
/** The tag at a blocked vein's mouth: words only, in the caution ink. */
const blockedReading = (say: string): Reading => ({ kicker: say, value: '', unit: '', tone: 'caution' });

export interface PillDraw {
  id: PillId; reading: Reading;
  /** The tag's corner, canvas px, and its size. */
  x: number; y: number; w: number; h: number;
  /** The point it names, canvas px, now (its leader and dot end here). */
  to: Pt; above: boolean;
  alpha: number; /** the arrival's rise, px (translateY), 6 → 0 */ rise: number;
  /** Changes whenever the size or side does: the layer rewrites them only then. */
  key: string;
}
export interface SumDraw {
  /** The box's corner, canvas px. */ x: number; y: number;
  geom: SumGeom; rows: [Reading, Reading]; calc: Reading;
  leaders: { d: [string, string]; dots: [Pt, Pt] };
  /** The whole stack's fade (a camera move, a card in the way). */ alpha: number;
  /** Each row: its own opacity (a row that travels is there from the first frame; one that does not rises and fades in), the pixels still to travel, the rise. */
  row: [{ alpha: number; dx: number; dy: number; rise: number }, { alpha: number; dx: number; dy: number; rise: number }];
  lead: number; calcAlpha: number; calcRise: number;
  key: string;
}
export interface CathFrame { pills: PillDraw[]; sum: SumDraw | null }

// `key` is what the layer redraws the leaders by (no place in it); `spot` is what a card IS: its side, its size. A card that stands at a new place with the same spot GLIDES
// there; only a card that changes spot (it flips to the other side, it takes another size) fades out where it stood and in again. `ax`/`ay` is the point the card was placed for: while the
// picture moves a little (a tilt, the camera following the tip) the card rides it, drawn at its solved place plus how far its point has moved since (2D stage-cath.js: a reading is pinned
// to its point in the world and "any move glides there, never jumps"; it is placed again only at rest).
interface PillTarget { id: PillId; reading: Reading; x: number; y: number; w: number; h: number; above: boolean; box: Box; key: string; spot: string; ax: number; ay: number }
interface SumTarget { x: number; y: number; geom: SumGeom; rows: [Reading, Reading]; calc: Reading; leaders: SumDraw['leaders']; box: Box; key: string; spot: string; tip: Pt; ahead: Pt }
interface PillRec { t: PillTarget; p: number; gx: number; gy: number }
interface SumRec { t: SumTarget; fade: number; u: number; from: [{ x: number; y: number } | null, { x: number; y: number } | null]; gx: number; gy: number }
/** How fast a card that was placed again glides to its new place (the time constant, ms): about a third of the small step, so it arrives within it. */
export const GLIDE_TAU_MS = C.MS.small / 3;
const GLIDE_EPS = 0.05;
/** How far (px) the two points of a stack may move apart from each other before its leaders stop reaching them and it eases out. */
export const SKEW_PX = 3;


export class CathShow {
  private want: { pills: Map<PillId, PillTarget>; sum: SumTarget | null } = { pills: new Map(), sum: null };
  private readonly pills = new Map<PillId, PillRec>();
  private sum: SumRec | null = null;
  private readonly sides = new Map<PillId, Side>();
  private swapWas = false;
  /** Where the catheter's two points stand now (canvas px), written every frame by `ride`; null while the catheter is not there. */
  private cur: { tip: Pt | null; ahead: Pt | null } = { tip: null, ahead: null };
  readonly frame: CathFrame = { pills: [], sum: null };
  /** The boxes the cards take now (a station's label keeps clear of them). */
  boxes: Box[] = [];
  /** Just the cards (no pointer's run to its point): what a card standing on another or on a screen card is judged by. */
  cards: Box[] = [];

  /** The tags' sizes need the text; `type` is the tag's type at this screen. */
  type(vp: Vp): TagType { return tagType(vp); }

  /** Where the two points stand now. Called every frame, before `step`: the cards ride them (a little move of the picture never hides a card). */
  ride(tip: Pt | null, ahead: Pt | null): void { this.cur.tip = tip; this.cur.ahead = ahead; }
  /** How far a point has moved since a card was placed for it. */
  private away(at: Pt | null, ax: number, ay: number): [number, number] { return at ? [at[0] - ax, at[1] - ay] : [0, 0]; }
  /** The stack's leaders are drawn once, in the box's own frame, to the points as they stood when it was placed, and the box rides the AVERAGE of the two points' moves. While the camera turns or zooms the two
   *  points move by different amounts, so the leaders end where the points were (they "hang in place"). The stack eases out then and comes back, placed again, once the picture is still. */
  private skewed(s: SumRec): boolean {
    const t = s.t, a = this.away(this.cur.tip, t.tip[0], t.tip[1]), b = this.away(this.cur.ahead, t.ahead[0], t.ahead[1]);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > SKEW_PX;
  }
  private pillAt(rec: PillRec): [number, number] {
    const t = rec.t, [dx, dy] = this.away(t.id === 'f' ? this.cur.tip : this.cur.ahead, t.ax, t.ay);
    return [t.x + dx + rec.gx, t.y + dy + rec.gy];
  }
  private sumAt(s: SumRec): [number, number] {
    const t = s.t, a = this.away(this.cur.tip, t.tip[0], t.tip[1]), b = this.away(this.cur.ahead, t.ahead[0], t.ahead[1]);
    return [t.x + (a[0] + b[0]) / 2 + s.gx, t.y + (a[1] + b[1]) / 2 + s.gy];
  }

  /** Where the cards stand, worked out for the picture as it is now (the camera still): called when something changed. */
  solve(inp: CathIn): void {
    const kinds = inp.kinds ?? calloutsFor(inp.cath), t = tagType(inp.vp);
    this.ride(inp.tip, inp.ahead);
    const pills = new Map<PillId, PillTarget>();
    let sum: SumTarget | null = null;
    const blocked = !inp.kinds && inp.cath === 'blocked';
    const rf = blocked ? blockedReading(inp.text.say ?? BLOCKED_SAYS.first) : reading('free', inp.text.f, inp.tones?.f ?? 'free', inp.kickers?.f), rw = reading('wedge', inp.text.w, inp.tones?.w ?? 'wedge', inp.kickers?.w), rh = reading('result', inp.text.h, toneOf(inp.text.hv), inp.kickers?.h);
    const ids = kinds.filter((k): k is PillId => k !== 's').filter((id) => inp.got >= (id === 'f' ? 1 : 2));
    if (ids.length && inp.tip && inp.ahead) {
      const items = ids.map((id) => {
        const r = id === 'f' ? rf : rw, p = id === 'f' ? inp.tip! : inp.ahead!, sz = tagSize(t, blocked ? { ...r, kicker: BLOCKED_SAYS.then } : r, inp.measure);   // (a blocked vein's tag is sized for its longer words, so the one crosses over to the other in place)
        return { id, x: p[0], y: p[1], w: sz.w, h: sz.h, prefer: id === 'f', was: this.sides.get(id) ?? null };
      });
      const out = placePills(items, inp.band, inp.blockers);
      for (const o of out) {
        const it = items.find((i) => i.id === o.id)!, id = o.id as PillId, r = id === 'f' ? rf : rw;
        this.sides.set(id, o.side);
        pills.set(id, { id, reading: r, x: o.x0, y: o.y0, w: it.w, h: it.h, above: o.above, box: o.box, key: `${o.above ? 1 : 0}|${it.w}|${it.h}`, spot: `${o.above ? 1 : 0}|${it.w}|${it.h}`, ax: id === 'f' ? inp.tip![0] : inp.ahead![0], ay: id === 'f' ? inp.tip![1] : inp.ahead![1] });
      }
    } else for (const id of ['f', 'w'] as const) this.sides.delete(id);
    if (kinds.includes('s') && inp.tip && inp.ahead && inp.got >= 2) {
      const tight = tightFor(inp.band);
      const swap = swapOf(inp.tip[1], inp.ahead[1], this.swapWas);
      let geom = sumLayout(t, [rw, rf], rh, inp.measure, tight, swap);
      const at0 = placeStack(inp.tip, inp.ahead, geom.w, geom.h, inp.band, inp.blockers, !!inp.mid);
      // the order of the rows and the leaders are planned together once the place is known (nothing crosses a leader or any text; a place where a leader cannot reach its point is moved)
      const { plan, ...at } = placeClean(at0, geom, [inp.ahead, inp.tip], swap, inp.band, inp.blockers);
      if (plan.swap !== swap) geom = sumLayout(t, [rw, rf], rh, inp.measure, tight, plan.swap);
      this.swapWas = plan.swap;
      const leaders = { d: plan.d, dots: plan.dots };
      const box = { x0: at.x, y0: at.y, x1: at.x + geom.w, y1: at.y + geom.h };
      sum = { x: at.x, y: at.y, geom, rows: [rw, rf], calc: rh, leaders, box, key: `${geom.swap ? 1 : 0}${geom.tight ? 1 : 0}|${geom.w}|${geom.h}|${leaders.d.join('')}`, spot: `${geom.swap ? 1 : 0}${geom.tight ? 1 : 0}|${geom.w}|${geom.h}`, tip: [inp.tip[0], inp.tip[1]], ahead: [inp.ahead[0], inp.ahead[1]] };
    }
    this.want = { pills, sum };
    this.boxes = [...[...pills.values()].map((p) => p.box), ...(sum ? [sum.box] : [])];
    this.cards = [...[...pills.values()].map((p) => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h })), ...(sum ? [sum.box] : [])];
    // A card on show that is placed again with the same spot (the same side and size) takes its new place at once and glides there from where it is drawn now (its glide offset keeps the
    // picture continuous); a ticking number is no new spot either. Only a card that changes spot fades out and in (step).
    for (const [id, rec] of this.pills) {
      const w = pills.get(id);
      if (!w || w.spot !== rec.t.spot) continue;
      const [ox, oy] = this.pillAt(rec);
      rec.t = w; rec.gx = 0; rec.gy = 0;
      const [nx, ny] = this.pillAt(rec);
      rec.gx = ox - nx; rec.gy = oy - ny;
    }
    if (this.sum && sum && sum.spot === this.sum.t.spot) {
      const [ox, oy] = this.sumAt(this.sum);
      this.sum.t = sum; this.sum.gx = 0; this.sum.gy = 0;
      const [nx, ny] = this.sumAt(this.sum);
      this.sum.gx = ox - nx; this.sum.gy = oy - ny;
    }
  }

  /** The numbers on show change without a new place (a reading counting up keeps its box): written into what stands. */
  setText(t: CathText, hold = false): void {
    const val = (r: Reading, v: string, tone = r.tone): Reading => (r.value === v && r.tone === tone ? r : { ...r, value: v, tone });
    const tf = (p: PillTarget) => {
      if (t.say !== undefined && p.id === 'f') { if (p.reading.kicker !== t.say) p.reading = { ...p.reading, kicker: t.say }; return; }
      const v = p.id === 'f' ? t.f : t.w; if (p.reading.value !== v) p.reading = val(p.reading, v);
    };
    const ts = (u: SumTarget) => { u.rows = [val(u.rows[0], t.w), val(u.rows[1], t.f)]; u.calc = val(u.calc, t.h, toneOf(t.hv)); };
    // A card that is leaving (the picture moves, the slide went, its stack took over) keeps the numbers it had: they belong to the patient it was measured on, not the one loading now.
    // `want` is only dropped once the picture is still, so while it holds nothing is written. A card whose target was replaced is not the wanted object, so it is never written either.
    if (hold) return;
    for (const p of this.want.pills.values()) tf(p);
    if (this.want.sum) ts(this.want.sum);
  }

  /** Advance by `dt` ms. `hold`: the picture is moving or has not settled, so every card fades out where it stands. Returns true while anything is still moving. */
  step(dt: number, hold: boolean): boolean {
    let busy = false;
    const inn = dt / C.MS.surface, out = dt / C.MS.small;
    const sameSpot = (a: PillTarget, b: PillTarget) => a.spot === b.spot;
    // a card that was placed again glides to its place (and a card that is riding a little move needs frames for as long as the picture does)
    const glide = 1 - Math.exp(-dt / GLIDE_TAU_MS);
    const settle = (r: { gx: number; gy: number }): boolean => {
      if (r.gx === 0 && r.gy === 0) return false;
      r.gx *= 1 - glide; r.gy *= 1 - glide;
      if (Math.abs(r.gx) < GLIDE_EPS && Math.abs(r.gy) < GLIDE_EPS) { r.gx = 0; r.gy = 0; return false; }
      return true;
    };
    // the result's stack takes over the cards: its rows start where the cards stood (a card not yet drawn leaves its row to rise in)
    const sumWanted = this.want.sum;
    if (sumWanted && !this.sum && !hold) {
      const from: SumRec['from'] = [null, null];
      // row 0 is the wedged reading, row 1 the free one
      const f = this.pills.get('w'), g = this.pills.get('f');
      if (f && f.p > 0.2) { const [x, y] = this.pillAt(f); from[0] = { x, y }; }
      if (g && g.p > 0.2) { const [x, y] = this.pillAt(g); from[1] = { x, y }; }
      this.sum = { t: sumWanted, fade: 0, u: 0, from, gx: 0, gy: 0 };
      this.pills.clear();
    }
    for (const id of ['f', 'w'] as const) {
      const w = this.want.pills.get(id);
      const rec = this.pills.get(id);
      if (!rec) { if (w && !hold && !this.sum) { this.pills.set(id, { t: w, p: 0, gx: 0, gy: 0 }); busy = true; } continue; }
      if (settle(rec)) busy = true;
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
      if (settle(s)) busy = true;
      let target = 1;
      if (hold || !sumWanted) target = 0;
      else if (s.t.spot !== sumWanted.spot) target = 0;
      else if (this.skewed(s)) target = 0;
      if (s.fade < target) { s.fade = Math.min(target, s.fade + (s.u < SUM_MS.travel ? 1 : inn)); busy = true; }
      else if (s.fade > target) { s.fade = Math.max(target, s.fade - out); busy = true; }
      if (s.fade <= 0) {
        if (!sumWanted) { this.sum = null; }
        else if (!hold && s.t.spot !== sumWanted.spot) { s.t = sumWanted; s.from = [null, null]; s.u = SUM_MS.total; s.gx = 0; s.gy = 0; busy = true; }
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
      const a = easeArrive(rec.p), t = rec.t, [px, py] = this.pillAt(rec);
      const to: Pt = (t.id === 'f' ? this.cur.tip : this.cur.ahead) ?? [t.ax, t.ay];
      f.pills.push({ id: t.id, reading: t.reading, x: px, y: py, w: t.w, h: t.h, to, above: t.above, alpha: a, rise: C.RISE * (1 - a), key: t.key });
    }
    const s = this.sum;
    if (!s || s.fade <= 0) { f.sum = null; return; }
    const t = s.t, [sx, sy] = this.sumAt(s);
    const rowAt = (j: 0 | 1) => {
      const from = s.from[j], flow = sumFlow(s.u, !!from);
      const R = t.geom.rows[j], rx = sx + R.x, ry = sy + R.y;
      return { alpha: from ? 1 : 1 - flow.rise / C.RISE, dx: from ? (from.x - rx) * flow.flip || 0 : 0, dy: from ? (from.y - ry) * flow.flip || 0 : 0, rise: from ? 0 : flow.rise };
    };
    const a = rowAt(0), b = rowAt(1), flow = sumFlow(s.u, !!(s.from[0] || s.from[1]));
    f.sum = {
      x: sx, y: sy, geom: t.geom, rows: t.rows, calc: t.calc, leaders: t.leaders, alpha: s.fade,
      row: [a, b],
      lead: flow.lead, calcAlpha: flow.calc, calcRise: flow.calcRise, key: t.key,
    };
  }
}
