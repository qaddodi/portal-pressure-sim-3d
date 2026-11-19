// How the profile moves between states (2D: tool-profile.js tick / aim / paintNow, display-state.js follow2): the shown numbers follow the goal on a two-stage filter
// (the same curve at 60 or 120 Hz), the red blocks, the brackets (held back on a question slide), the pills and the lines' names fade or glide over FADE_MS.
// Pure: the card gives it times (ms on the page's clock) and reads the view it should draw at that time.
import { blocksOf, FADE_MS, NS, whole0, type Box, type Goal, type LineName, type ProfilePlan, type Prof } from './model.ts';

/** The shown value's filter time (display-state.js SHOWN_TAU, s). */
export const SHOWN_TAU = 0.2;
const EPS = 0.005, NEAR_V = 0.02, NEAR_TOP = 0.05;

/** One step of the two-stage follower (display-state.js follow2): v the shown value, w the first stage, T the target. */
export function follow2(v: number, w: number, T: number, dt: number, tau: number, eps: number): { v: number; w: number } {
  const u = Math.max(0, dt) / tau, a = Math.exp(-u), e1 = w - T, e2 = v - T;
  w = T + e1 * a; v = T + (e2 + e1 * u) * a;
  if (Math.abs(T - w) < eps && Math.abs(w - v) < eps) w = v = T;
  return { v, w };
}

interface Fade { a: number; from: number; t0: number }
/** The cosine ease of a fade begun at t0, 0 to 1 over FADE_MS. */
const ease = (t0: number, now: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (now - t0) / FADE_MS)));
/** A fade's opacity now (2D blkOp). */
export const fadeAt = (b: Fade, now: number) => b.from + (b.a - b.from) * ease(b.t0, now);
interface Glide { x: number; y: number; fx: number; fy: number; t0: number }
const glideX = (a: Glide, now: number) => a.fx + (a.x - a.fx) * ease(a.t0, now);
const glideY = (a: Glide, now: number) => a.fy + (a.y - a.fy) * ease(a.t0, now);

/** What one moment of the chart shows. */
export interface View {
  shown: Goal;
  /** each station's red block, 0 to 1 */
  blk: number[];
  /** the brackets' strength: 1, or 0 where the slide holds the answer back */
  brk: number;
  /** where each pill stands now (x, y: its top left) and how strongly the pills show */
  pills: { x: number; y: number }[] | null; pillA: number; pillBoxes: Box[] | null;
  names: LineName[];
}

const blank = (): Goal => ({ v: new Array(NS).fill(0), hvpg: 0, eus: 0, ppg: 0, top: 15 });
const copyGoal = (to: Goal, from: Goal) => { for (let i = 0; i < NS; i++) to.v[i] = from.v[i]!; to.hvpg = from.hvpg; to.eus = from.eus; to.ppg = from.ppg; to.top = from.top; };

export class ProfileMotion {
  reduce = false;
  goal: Goal | null = null;
  shown: Goal | null = null;
  private w = blank();
  private tickAt = 0;
  private plan: ProfilePlan | null = null;
  private blk: (Fade & { live: boolean })[] = Array.from({ length: NS }, () => ({ a: 0, from: 0, t0: 0, live: false }));
  private heldK: Fade = { a: 1, from: 1, t0: 0 };
  private held = false;
  private pillAt: (Glide | null)[] = [null, null, null];
  private pillK: Fade & { boxes: Box[] | null } = { a: 0, from: 0, t0: 0, boxes: null };
  private nameAt: Record<string, Glide> = {};
  private lastSpans = 0;

  /** The chart aimed at a goal: its plan (made for this size), whether the box is the one it already stands in (then it glides) and the time. */
  aim(goal: Goal, plan: ProfilePlan, now: number, o: { held?: boolean } = {}) {
    const old = this.plan && this.plan.size === plan.size ? this.plan : null;
    this.held = !!o.held;
    // brackets after none (the raw ladder, then the gradients named), or a changed set, ease in; a held slide keeps them out
    if (this.plan && (this.lastSpans !== plan.spans.length) && !this.held && !this.reduce) this.heldK = { a: 1, from: 0, t0: now };
    else if (!this.plan) this.heldK = { a: this.held ? 0 : 1, from: this.held ? 0 : 1, t0: 0 };
    this.lastSpans = plan.spans.length;
    this.plan = plan;
    this.goal = goal;
    if (!this.shown) { this.shown = blank(); copyGoal(this.shown, goal); copyGoal(this.w, goal); this.tickAt = 0; }
    // red blocks: the stations that stand over a fall, each fading in and out
    const want = new Set(this.held ? [] : blocksOf(goal, plan.hl));
    for (let i = 0; i < NS; i++) {
      const a = want.has(i) ? 1 : 0, b = this.blk[i]!.live ? this.blk[i]! : null;
      if (!b || b.a !== a) { this.blk[i]!.from = this.reduce ? a : b ? fadeAt(b, now) : 0; this.blk[i]!.a = a; this.blk[i]!.t0 = now; this.blk[i]!.live = true; }
    }
    // pills and line names glide to where this state puts them
    const pl = plan.pills, had = this.pillK.a;
    if (pl) {
      pl.forEach(([px, , py], k) => {
        const cur = this.pillAt[k];
        if (!cur || !old || this.reduce || !had) { this.pillAt[k] = { x: px, y: py, fx: px, fy: py, t0: 0 }; return; }
        if (Math.abs(cur.x - px) < 0.01 && Math.abs(cur.y - py) < 0.01) return;
        this.pillAt[k] = { x: px, y: py, fx: glideX(cur, now), fy: glideY(cur, now), t0: now };
      });
      this.pillK.boxes = pl;
    }
    if (had !== (pl ? 1 : 0)) Object.assign(this.pillK, { from: !old || this.reduce ? (pl ? 1 : 0) : fadeAt(this.pillK, now), a: pl ? 1 : 0, t0: now });
    else if (!old) Object.assign(this.pillK, { from: this.pillK.a, t0: 0 });
    for (const n of plan.names) {
      const cur = this.nameAt[n.c];
      if (!cur || !old || this.reduce) { this.nameAt[n.c] = { x: n.x, y: n.y, fx: n.x, fy: n.y, t0: 0 }; continue; }
      if (Math.abs(cur.x - n.x) < 0.01 && Math.abs(cur.y - n.y) < 0.01) continue;
      this.nameAt[n.c] = { x: n.x, y: n.y, fx: glideX(cur, now), fy: glideY(cur, now), t0: now };
    }
  }

  /** A question slide's hold (the answer held back): the brackets ease out, the blocks fade away; released they ease in. */
  setHold(on: boolean, now: number, instant = false) {
    on = !!on;
    const a = on ? 0 : 1, cur = instant || this.reduce ? a : fadeAt(this.heldK, now);
    if (on === this.held && this.heldK.a === a) return;
    this.held = on;
    this.heldK = { a, from: cur, t0: instant ? 0 : now };
    if (this.goal && this.plan) this.aim(this.goal, this.plan, now, { held: on });
  }

  /** One step of the shown numbers towards the goal at time `now` (ms). → whether anything is still moving. */
  tick(now: number): boolean {
    const goal = this.goal, shown = this.shown;
    if (!goal || !shown) return false;
    const dt = this.tickAt ? Math.min(0.1, Math.max(0, (now - this.tickAt) / 1000)) : 0;
    this.tickAt = now;
    let done = true;
    if (this.reduce) { copyGoal(shown, goal); copyGoal(this.w, goal); }
    else {
      for (let i = 0; i < NS; i++) {
        const r = follow2(shown.v[i]!, this.w.v[i]!, goal.v[i]!, dt, SHOWN_TAU, EPS);
        shown.v[i] = r.v; this.w.v[i] = r.w;
        if (!(Math.abs(shown.v[i]! - goal.v[i]!) < NEAR_V && Math.abs(this.w.v[i]! - goal.v[i]!) < NEAR_V)) done = false;
      }
      for (const k of ['hvpg', 'eus', 'ppg', 'top'] as const) { const r = follow2(shown[k], this.w[k], goal[k], dt, SHOWN_TAU, EPS); shown[k] = r.v; this.w[k] = r.w; }
      if (!(Math.abs(shown.top - goal.top) < NEAR_TOP && Math.abs(this.w.top - goal.top) < NEAR_TOP)) done = false;
    }
    if (done) { copyGoal(shown, goal); copyGoal(this.w, goal); this.tickAt = 0; }
    return !done || this.fading(now);
  }

  /** Whether a fade or a glide is still running. */
  fading(now: number): boolean {
    const f = (t0: number) => now - t0 < FADE_MS;
    if (f(this.pillK.t0) || f(this.heldK.t0)) return true;
    for (const k of Object.keys(this.nameAt)) if (f(this.nameAt[k]!.t0)) return true;
    for (const p of this.pillAt) if (p && f(p.t0)) return true;
    return this.blk.some((b) => b.live && f(b.t0));
  }

  /** What to draw at time `now`. */
  view(now: number): View | null {
    const plan = this.plan, shown = this.shown;
    if (!plan || !shown) return null;
    const blk = this.blk.map((b) => (b.live ? Math.min(1, fadeAt(b, now)) : 0));
    const boxes = this.pillK.boxes;
    const pills = boxes ? boxes.map((b, k) => { const at = this.pillAt[k]; return at ? { x: glideX(at, now), y: glideY(at, now) } : { x: b[0], y: b[2] }; }) : null;
    const names = plan.names.map((n) => { const a = this.nameAt[n.c]; return a ? { ...n, x: glideX(a, now), y: glideY(a, now) } : n; });
    return { shown: { ...shown, v: [...shown.v] }, blk, brk: fadeAt(this.heldK, now), pills, pillA: boxes ? fadeAt(this.pillK, now) : 0, pillBoxes: boxes, names };
  }
}

/** The chart at rest on a goal: every fade and glide done (a still picture: a specimen, a test, a handout). */
export function restView(plan: ProfilePlan, held = false): View {
  const goal = plan.goal, on = new Set(held ? [] : blocksOf(goal, plan.hl));
  return {
    shown: { ...goal, v: [...goal.v] }, blk: Array.from({ length: NS }, (_, i) => (on.has(i) ? 1 : 0)), brk: held ? 0 : 1,
    pills: plan.pills ? plan.pills.map((b) => ({ x: b[0], y: b[2] })) : null, pillA: plan.pills ? 1 : 0, pillBoxes: plan.pills, names: plan.names,
  };
}

/** Where a goal's readings stand as whole mmHg (the words a still frame prints). */
export const readings = (p: Prof) => p.v.map(whole0);
