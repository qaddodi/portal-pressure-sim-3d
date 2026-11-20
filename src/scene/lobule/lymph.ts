// The lymph channels of the lobule: tubes that HUG the blood vessels, one on each side of every sinusoid, and branch exactly as the sinusoids do (Mohammad, 20 Nov 2026: "lymph should be tubes that are hugging
// exactly the blood vessels, not running independently like bile; and split exactly like the sinusoids, one on each side of the vessel"). 2D draws a channel beside each sinusoid (lobule-zoom.js `beside`, rs0 * 0.5 thick,
// tapering toward the central vein); here it is the same tube on BOTH sides, and the rule that makes it follow every branch is the offset itself: each sinusoid's two side lines (its axis moved sideways by its wall
// and the tube's own radius) are cut wherever they would run into another vessel's wall, so at a merge the two inner lines stop where they meet the crotch (their ends touch: one tube turning round it), at a
// side branch the host's line stops at the branch's mouth and the branch's two lines begin at its corners, and the outer lines run straight on through a bend. Nothing is placed by hand: the lymph is the outline
// of the sinusoids at one gap. Pure (numbers in, numbers out).
import type { Course, P2 } from './geometry.ts';

/** The lymph channel's taper toward the central vein (2D lyTaper): a thread (0.06) inside rho 0.13, whole from 0.42 out. */
export function lyTaper(rho: number): number { const t = Math.min(1, Math.max(0, (rho - 0.13) / (0.42 - 0.13))); return 0.06 + 0.94 * t * t * (3 - 2 * t); }
/** Where the tube's centre stands from the wall, in its own radii (1: touching it; a little under 1: tucked a hair under the wall, so no daylight shows between a tube and its vessel, Mohammad 20 Nov 2026: "sit flush against the sinusoid wall, with zero visible gap"). */
export const HUG = 0.92;
/** Spacing of the offset lines before they are cut (lobule radii), and of the finished tubes' samples. */
/** How near another vessel's wall a channel may come, in its own radii: a little less than where it lies against its own (HUG), so the line is only cut where a vessel really stands in its way. */
export const CLEAR = HUG - 0.07;
export const CUT_STEP = 0.004, TUBE_STEP = 0.025;
/** How far apart two channel ends may stand and still be one channel (lobule radii): a branch's line to its sinusoid's, or the two inner lines in a merge's crotch. */
export const MEND_KIN = 0.035, MEND_CROTCH = 0.02;
/** A stretch shorter than this (a sliver left in a crotch narrower than a tube) is no channel: it would only be a blunt knob. */
export const MIN_RUN = 0.04;

export interface LymphInput {
  /** The sinusoids that carry a lymph channel on each side (generations 0 to 2), and the vessels the channels keep clear of (those and the anastomoses). */
  carry: readonly Course[];
  clear: readonly Course[];
  /** A sinusoid's healthy wall radius at distance `rho` from the centre, and the channel's radius there (2D: rs0 * 0.5 * lyTaper). */
  wall: (kind: Course['kind'], rho: number) => number;
  radius: (rho: number) => number;
  /** The central vein's radius: no channel inside it. */
  rcv: number;
  /** Where a first-generation channel joins the terminal lymphatic, or null. */
  join: (c: Course, p: P2) => P2 | null;
}
export interface LymphRun { pts: P2[]; sib: number; side: 1 | -1; lvl: number; /** a free end (not joined to anything, not on the terminal lymphatic) tapers to a thread rather than stopping blunt */ freeHead: boolean; freeTail: boolean; /** which way its two ends face (away from the sinusoid) */ nh: P2; nt: P2 }

const hyp = Math.hypot;

interface Axis { c: Course; seg: [number, number, number, number][]; }

/** A grid of the clear-of vessels' axis segments, so a point finds the few near it without looking at all. */
function gridOf(clear: readonly Course[], cell: number) {
  const g = new Map<number, { ci: number; i: number }[]>(), key = (x: number, y: number) => Math.floor(x / cell) * 4093 + Math.floor(y / cell);
  clear.forEach((c, ci) => {
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i]!, b = c.pts[i + 1]!, x0 = Math.floor((Math.min(a[0], b[0]) - cell) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + cell) / cell), y0 = Math.floor((Math.min(a[1], b[1]) - cell) / cell), y1 = Math.floor((Math.max(a[1], b[1]) + cell) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x * 4093 + y; (g.get(k) ?? g.set(k, []).get(k)!).push({ ci, i }); }
    }
  });
  return { at: (x: number, y: number) => g.get(key(x, y)) ?? [] };
}

/** The lymph channel runs of a lobule: each carried sinusoid's two sides, cut where they meet another vessel, ordered along their sinusoid (from the portal end in). */
export function lymphRuns(inp: LymphInput): LymphRun[] {
    const { carry, clear, wall, radius, rcv } = inp, CELL = 0.05, grid = gridOf(clear, CELL), out: LymphRun[] = [];
  const kin = (a: Course, b: Course) => a.parent === b.id || b.parent === a.id;
  const clearOf = (x: number, y: number, rr: number, own: Course): boolean => {
    for (const { ci, i } of grid.at(x, y)) {
      const o = clear[ci]!;
      if (o === own) continue;
      const a = o.pts[i]!, b = o.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * bx + (y - a[1]) * by) / bb)) : 0;
      const d = hyp(x - a[0] - t * bx, y - a[1] - t * by);
      // (a branch and the vessel it runs into stand at one width where they meet: a step in the walls there is no reason to cut the channel short)
      const wo = wall(o.kind, o.rho[i]!);
      if (d < (kin(o, own) ? Math.min(wo, wall(own.kind, o.rho[i]!)) : wo) + rr * CLEAR) return false;
    }
    return true;
  };
  // each carried sinusoid's two side lines, every point kept or not (inside another vessel's wall, or inside the central vein: not)
  interface Pt { x: number; y: number; nx: number; ny: number; r: number; own: Course; side: 1 | -1; k: number; ok: boolean }
  const lines: { c: Course; side: 1 | -1; pts: Pt[] }[] = [];
  for (const c of carry) {
    const n = c.pts.length, tn: P2[] = c.pts.map((_, i) => { const a = c.pts[Math.max(0, i - 1)]!, b = c.pts[Math.min(n - 1, i + 1)]!, l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] as P2; });
    const X: P2[] = [], Nn: P2[] = [], Rho: number[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = c.pts[i]!, b = c.pts[i + 1]!, len = hyp(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(len / CUT_STEP));
      for (let k = 0; k < m; k++) {
        const t = k / m, nx = tn[i]![0] + (tn[i + 1]![0] - tn[i]![0]) * t, ny = tn[i]![1] + (tn[i + 1]![1] - tn[i]![1]) * t, l = hyp(nx, ny) || 1;
        X.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); Nn.push([nx / l, ny / l]); Rho.push(c.rho[i]! + (c.rho[i + 1]! - c.rho[i]!) * t);
      }
    }
    X.push(c.pts[n - 1]!); Nn.push(tn[n - 1]!); Rho.push(c.rho[n - 1]!);
    for (const side of [1, -1] as const) {
      const pts: Pt[] = X.map((q, k) => {
        const rr = radius(Rho[k]!), d = wall(c.kind, Rho[k]!) + HUG * rr, x = q[0] + side * Nn[k]![0] * d, y = q[1] + side * Nn[k]![1] * d;
        return { x, y, nx: side * Nn[k]![0], ny: side * Nn[k]![1], r: rr, own: c, side, k, ok: Rho[k]! >= rcv && clearOf(x, y, rr, c) };
      });
      lines.push({ c, side, pts });
    }
  }
  // two channels never overlap: where the lines of two sinusoids that are not each other's branch come within a tube's width and face each other (the two inner lines in the crotch of a merge), both stop there;
  // lines that face the same way (the outer lines of two sinusoids that run on top of each other just before they merge) are one channel, so one of them stays
  const pg = new Map<number, Pt[]>(), PC = 0.02, pk = (x: number, y: number) => Math.floor(x / PC) * 4093 + Math.floor(y / PC);
  for (const l of lines) for (const q of l.pts) if (q.ok) (pg.get(pk(q.x, q.y)) ?? pg.set(pk(q.x, q.y), []).get(pk(q.x, q.y))!).push(q);
  const dead = new Set<Pt>();
  for (const l of lines) for (const q of l.pts) {
    if (!q.ok) continue;
    for (let gx = -1; gx <= 1 && !dead.has(q); gx++) for (let gy = -1; gy <= 1; gy++) {
      for (const o of pg.get(pk(q.x + gx * PC, q.y + gy * PC)) ?? []) if (o.own !== q.own && !kin(o.own, q.own) && hyp(o.x - q.x, o.y - q.y) < (o.r + q.r) * 0.98 && (o.nx * q.nx + o.ny * q.ny <= 0 || q.own.id > o.own.id)) { dead.add(q); break; }
      if (dead.has(q)) break;
    }
  }
  for (const l of lines) {
    let run: Pt[] = [];
    const flush = () => { if (run.length >= 3) out.push({ pts: run.map((q) => [q.x, q.y] as P2), sib: l.c.id, side: l.side, lvl: l.c.kind === 's0' ? 0 : l.c.kind === 's1' ? 1 : 2, freeHead: true, freeTail: true, nh: [run[0]!.nx, run[0]!.ny], nt: [run[run.length - 1]!.nx, run[run.length - 1]!.ny] }); run = []; };
    for (const q of l.pts) { if (!q.ok || dead.has(q)) flush(); else run.push(q); }
    flush();
  }
  // a first-generation channel's two sides begin at the terminal lymphatic it drains into (2D: the channel starts on it)
  for (const run of out) {
    if (run.lvl !== 0) continue;
    const c = carry.find((q) => q.id === run.sib)!;
    const a = c.pts[0]!, f = run.pts[0]!, e = inp.join(c, f);
    if (e && hyp(f[0] - a[0], f[1] - a[1]) < 0.05) { run.pts.unshift(e); run.freeHead = false; }
  }
  // where two channels' ends stand a tube's width apart (the two inner lines in a merge's crotch, a branch's lines at its host's cut) they meet in one point: the pair turns the corner as one tube
  type End = { run: LymphRun; head: boolean; p: P2; n: P2 };
  const byId = new Map(carry.map((c) => [c.id, c]));
  const pairs = (runs: readonly LymphRun[]) => {
    const ends: End[] = runs.flatMap((run) => [{ run, head: true, p: run.pts[0]!, n: run.nh }, { run, head: false, p: run.pts[run.pts.length - 1]!, n: run.nt }]);
    const cand: { e: End; o: End; d: number }[] = [];
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      const e = ends[i]!, o = ends[j]!;
      if (o.run.sib === e.run.sib) continue;
      // a branch and its sinusoid's lines that face the same way are one channel running on (the outer lines of a merge, the two sides of a bend); lines of sinusoids that are not each other's branch face each other (the crotch)
      const same = o.n[0] * e.n[0] + o.n[1] * e.n[1] > 0.3, rel = kin(byId.get(o.run.sib)!, byId.get(e.run.sib)!), d = hyp(o.p[0] - e.p[0], o.p[1] - e.p[1]);
      if (rel === same && d < (rel ? MEND_KIN : MEND_CROTCH)) cand.push({ e, o, d });
    }
    return cand.sort((p, q) => p.d - q.d);
  };
  // a sliver shorter than MIN_RUN stays only where it joins a real channel (the last stretch before a merge); one left alone in a narrow crotch would only be a knob
  const span = (r: LymphRun) => { let a = 0; for (let k = 1; k < r.pts.length; k++) a += hyp(r.pts[k]![0] - r.pts[k - 1]![0], r.pts[k]![1] - r.pts[k - 1]![1]); return a; };
  {
    const keep = new Set<LymphRun>(out.filter((r) => span(r) >= MIN_RUN));
    for (const { e, o } of pairs(out)) { if (keep.has(e.run) && !keep.has(o.run)) keep.add(o.run); else if (keep.has(o.run) && !keep.has(e.run)) keep.add(e.run); }
    for (const r of out.filter((q) => !keep.has(q) && q.freeHead)) out.splice(out.indexOf(r), 1);
  }
  const cand = pairs(out);
  type EndT = End;
  const used = new Set<EndT>();
  for (const { e, o, d } of cand) {
    const kins = kin(byId.get(o.run.sib)!, byId.get(e.run.sib)!);
    if (kins) {
      // a branch's end runs on to its sinusoid's line (it may stand over the first stretch of its sibling's: they share that line there)
      const [c, p] = byId.get(e.run.sib)!.parent === o.run.sib ? [e, o] : [o, e];
      if (used.has(c)) continue;
      used.add(c);
      if (d > 1e-6) { if (c.head) c.run.pts.unshift(p.p); else c.run.pts.push(p.p); }
      for (const x of [c, p]) { if (x.head) x.run.freeHead = false; else x.run.freeTail = false; }
      continue;
    }
    if (used.has(e) || used.has(o)) continue;
    used.add(e); used.add(o);
    const m: P2 = [(e.p[0] + o.p[0]) / 2, (e.p[1] + o.p[1]) / 2];
    for (const x of [e, o]) { if (x.head) { x.run.pts.unshift(m); x.run.freeHead = false; } else { x.run.pts.push(m); x.run.freeTail = false; } }
  }
  return out;
}

/** How far from a free end the tube takes to reach full width (lobule radii), and the thread it narrows to. */
export const END_TAPER = 0.03, END_THREAD = 0.1;
const arcs = new WeakMap<object, number[]>();
/** The share of its width a channel keeps at sample `i`: whole, but narrowing to a thread over the last END_TAPER of an end that joins nothing (no blunt stubs: it either runs on into another channel, or on the lymphatic, or fades out). */
export function endTaper(c: { pts: readonly P2[]; free?: readonly [boolean, boolean] }, i: number): number {
  if (!c.free || (!c.free[0] && !c.free[1])) return 1;
  let a = arcs.get(c);
  if (!a) { a = [0]; for (let k = 1; k < c.pts.length; k++) a.push(a[k - 1]! + hyp(c.pts[k]![0] - c.pts[k - 1]![0], c.pts[k]![1] - c.pts[k - 1]![1])); arcs.set(c, a); }
  const L = a[a.length - 1]!, d = Math.min(c.free[0] ? a[i]! : Infinity, c.free[1] ? L - a[i]! : Infinity), t = Math.min(1, Math.max(0, d / END_TAPER));
  return END_THREAD + (1 - END_THREAD) * t * t * (3 - 2 * t);
}

/** A run resampled to about `step` apart (at least 3 points), evenly by length, so a tube is as dense as it needs to be and no more; its first `fineHead` of length at `fineStep`, where the channel dives under a blood vessel and the depth must ease. */
export function resampleRun(pts: readonly P2[], step = TUBE_STEP, fineHead = 0, fineStep = 0.006): { pts: P2[]; len: number } {
  const arc = [0]; for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1]! + hyp(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const len = arc[arc.length - 1]!, S: number[] = [0], head = Math.min(fineHead, len * 0.5);
  if (head > 0) { const m = Math.max(1, Math.ceil(head / fineStep)); for (let k = 1; k <= m; k++) S.push((head * k) / m); }
  const rest = len - head, m = Math.max(head > 0 ? 1 : 2, Math.ceil(rest / step));
  for (let k = 1; k <= m; k++) S.push(head + (rest * k) / m);
  const res: P2[] = [];
  let j = 0;
  for (const s of S) {
    while (j < arc.length - 2 && arc[j + 1]! < s) j++;
    const t = arc[j + 1]! > arc[j]! ? (s - arc[j]!) / (arc[j + 1]! - arc[j]!) : 0;
    res.push([pts[j]![0] + (pts[j + 1]![0] - pts[j]![0]) * t, pts[j]![1] + (pts[j + 1]![1] - pts[j]![1]) * t]);
  }
  return { pts: res, len };
}

/** A vessel the lymph may have to pass under: its axis, its radius at each point, and how far (in tube radii) beyond its wall the channel starts to dive. */
export interface Cover { pts: readonly P2[]; rad: readonly number[]; band: number }
/** How far UNDER the blood each sample of a channel must lie, 0 (beside it, at its own level) to 1 (inside the vessel's footprint: wholly beneath it), easing in between (Mohammad, 20 Nov 2026: "make sure they pass UNDER the
 *  sinusoid's blood vessel, not through it, to connect to their interportal vessels"). A channel that hugs a sinusoid stands 1.05 radii off its wall, so a sinusoid's band is under that (it never dips); the inlet venule and
 *  the terminal lymphatic, which nothing hugs, have a wide one, so the dive is gentle. Pure. */
export function lymphCover(pts: readonly P2[], radius: (i: number) => number, covers: readonly Cover[]): number[] {
  const boxes = covers.map((c) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of c.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } const m = Math.max(...c.rad) + c.band * radius(0); return [x0 - m, y0 - m, x1 + m, y1 + m] as const; });
  return pts.map((q, k) => {
    let best = 0;
    covers.forEach((c, ci) => {
      const b = boxes[ci]!;
      if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) return;
      const band = c.band * radius(k);
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i]!, e = c.pts[i + 1]!, bx = e[0] - a[0], by = e[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0] - a[0]) * bx + (q[1] - a[1]) * by) / bb)) : 0;
        const over = hyp(q[0] - a[0] - t * bx, q[1] - a[1] - t * by) - (c.rad[i]! + (c.rad[i + 1]! - c.rad[i]!) * t);
        if (over >= band) continue;
        const u = Math.min(1, Math.max(0, 1 - over / band));
        best = Math.max(best, u * u * (3 - 2 * u));
      }
    });
    return best;
  });
}
