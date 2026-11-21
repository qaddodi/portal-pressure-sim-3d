// The motion rules (the 2D app's watch/motion-rules.js, over the 3D app's recorder): each judges the recorder's last seconds of samples. A sample is
//   { t, c: [k, x, y], L: [[name, x, y, w, h, alpha, crossing]...], K: [[id, x, y, w, h, alpha]...], W: [1 | 0 per card: has words] }
// where c is the camera's mark (the hand's zoom k and where the figure's anchor lands on the stage, so a shot, an orbit or a pinch all move it). Pure: no DOM, no page.
import { DIM_ALPHA } from '../limits.ts';

export const SHOWN = 0.6, GONE = 0.3;
export const FLASH_MS = 250;
export const STUCK_MS = 1500;
export const SLIDE_PX = 12, JUMP_PX = 48, SLIDE_MIN_MS = 60;
export const POP_ALPHA = 0.5;
export const POP_GAP_MS = 50;
export const SNAP_PX = 10, SNAP_RATIO = 4;
export const SHOWN_CARD = 0.3, EMPTY_MS = 100, EMPTY_FRAMES = 3;
export const VIEW_LEAD_MS = 250, VIEW_SPAN_MS = 4000;
export const STOP_MS = 100, REST_MS = 250;

export interface Sample { t: number; c?: number[] | null; L?: number[][] | null; K?: unknown[][] | null; W?: number[] | null }
export interface History { samples: Sample[]; events?: { k: string; t: number; [x: string]: unknown }[]; traces?: unknown[]; vb?: unknown; env?: { vw?: number } | null }
export interface MFinding { rule: string; what: string; where: string; why: string; owner: string; at: string; t0: number; t1: number }

export const RULE_INFO: Record<string, { why: string; owner: string }> = {
  flash: { why: 'Nothing may blink: a card or label that is shown, gone and back within a quarter second is a glitch (17 Nov: nothing pops in or out)', owner: 'src/scene/labels/fade.ts' },
  'stuck-mid': { why: 'A card or label held part way through a fade is a fade that never finished', owner: 'src/ui/cards/CardFrame.tsx' },
  'label-slide': { why: 'Labels fade between spots, never slide or jump (18 Nov)', owner: 'src/scene/labels/solver.ts' },
  'label-dim-alpha': { why: 'A dimmed label rests at one alpha, DIM_ALPHA (scene/labels/alpha.ts), in one place', owner: 'src/scene/labels/alpha.ts' },
  'card-pop': { why: 'Nothing pops in or out: a card goes from gone to shown by a fade, never in one frame (17 Nov 22:01: appearance and disappearance of anything must never glitch)', owner: 'src/ui/cards/CardFrame.tsx' },
  'card-size-snap': { why: 'Cards size exactly to their content with a glide, never a snap (17 Nov)', owner: 'src/ui/cards/CardFrame.tsx' },
  'card-empty': { why: 'A card is never shown with nothing in it (17 Nov 22:01)', owner: 'src/ui/cards/CardLayer.tsx' },
  'camera-straight': { why: 'The camera zooms straight from any view to any view: one way, one line, no stop at the fit (18 Nov)', owner: 'src/scene/camera/rig.ts' },
};

const sec = (t: number) => `${(t / 1000).toFixed(1)} s`;
const r1 = (v: number) => Math.round(v * 10) / 10;
const finding = (rule: string, what: string, where: string, t0: number, t1 = t0): MFinding => ({ rule, what, where, why: RULE_INFO[rule]!.why, owner: RULE_INFO[rule]!.owner, at: sec(t0), t0: Math.round(t0), t1: Math.round(t1) });

interface Series { key: string; a: number[]; at: (number[] | null)[] }
/** Per key, the alpha at each sample (0 where the source was read and the key was not in it, NaN where the source was not read). */
export function alphaSeries(samples: Sample[], field: 'L' | 'K'): Map<string, Series> {
  const N = samples.length, out = new Map<string, Series>();
  samples.forEach((s, i) => {
    const list = s[field] as unknown[][] | null | undefined;
    if (!list) return;
    for (const e of list) {
      const k = String(e[0]);
      let r = out.get(k);
      if (!r) { r = { key: k, a: new Array(N).fill(NaN), at: new Array(N).fill(null) }; out.set(k, r); }
      r.a[i] = e[5] as number; r.at[i] = e as number[];
    }
  });
  for (const r of out.values()) samples.forEach((s, i) => { if (s[field] && Number.isNaN(r.a[i]!)) r.a[i] = 0; });
  return out;
}

/** The camera's move between two samples, in px-equivalents (pan, plus 400 per unit of log zoom). */
export function camMoved(a: Sample | undefined, b: Sample | undefined): number {
  const p = a?.c, q = b?.c;
  if (!p || !q) return 0;
  return Math.hypot(q[1]! - p[1]!, q[2]! - p[2]!) + Math.abs(Math.log(q[0]! / p[0]!)) * 400;
}

const KINDS: ['L' | 'K', string][] = [['L', 'label'], ['K', 'card']];

export function flash(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples;
  for (const [field, kind] of KINDS) {
    for (const r of alphaSeries(S, field).values()) {
      const a = r.a;
      for (let i = 1; i < a.length - 1; i++) {
        if (!(a[i - 1]! >= SHOWN) || !(a[i]! <= GONE)) continue;
        let j = i; while (j < a.length && a[j]! <= GONE) j++;
        if (j < a.length && a[j]! >= SHOWN && S[j]!.t - S[i]!.t <= FLASH_MS) out.push(finding('flash', `${kind} "${r.key}"`, `${r1(a[i - 1]!)} to ${r1(a[i]!)} for ${Math.round(S[j]!.t - S[i]!.t)} ms, then back to ${r1(a[j]!)}`, S[i]!.t, S[j]!.t));
        i = j;
      }
    }
  }
  return out;
}

export function stuckMid(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples, N = S.length;
  if (N < 3) return out;
  for (const [field, kind] of KINDS) {
    for (const r of alphaSeries(S, field).values()) {
      const end = r.a[N - 1]!;
      if (!(end > 0.05 && end < 0.95)) continue;
      if (kind === 'label' && Math.abs(end - DIM_ALPHA) <= 0.03) continue;
      let i = N - 1; while (i > 0 && Math.abs(r.a[i - 1]! - end) < 0.01) i--;
      if (S[N - 1]!.t - S[i]!.t >= STUCK_MS) out.push(finding('stuck-mid', `${kind} "${r.key}"`, `held at alpha ${Math.round(end * 100) / 100} for ${Math.round((S[N - 1]!.t - S[i]!.t) / 100) / 10} s, part way through a fade`, S[i]!.t, S[N - 1]!.t));
    }
  }
  return out;
}

export function labelDimAlpha(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples, N = S.length;
  if (N < 3) return out;
  for (const r of alphaSeries(S, 'L').values()) {
    const end = r.a[N - 1]!;
    if (!(end > 0.4 && end < 0.9) || Math.abs(end - DIM_ALPHA) <= 0.03) continue;
    let i = N - 1; while (i > 0 && Math.abs(r.a[i - 1]! - end) < 0.01) i--;
    if (S[N - 1]!.t - S[i]!.t >= STUCK_MS) out.push(finding('label-dim-alpha', `label "${r.key}"`, `rests at alpha ${Math.round(end * 100) / 100}, not ${DIM_ALPHA}`, S[i]!.t, S[N - 1]!.t));
  }
  return out;
}

/** label-slide: a shown label moves SLIDE_PX over a run of SLIDE_MIN_MS or more while the camera is still: it slid instead of fading; one step of JUMP_PX is a jump. */
export function labelSlide(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples;
  for (const r of alphaSeries(S, 'L').values()) {
    let run: { i0: number; i1: number; d: number; a: number; quiet: number } | null = null;
    const flush = () => { if (run && run.d >= SLIDE_PX && S[run.i1]!.t - S[run.i0]!.t >= SLIDE_MIN_MS) out.push(finding('label-slide', `label "${r.key}"`, `slid ${Math.round(run.d)} px over ${Math.round(S[run.i1]!.t - S[run.i0]!.t)} ms at alpha ${r1(run.a)}, instead of fading`, S[run.i0]!.t, S[run.i1]!.t)); run = null; };
    for (let i = 1; i < S.length; i++) {
      const p = r.at[i - 1], q = r.at[i];
      if (!p || !q || !(p[5]! >= GONE) || !(q[5]! >= GONE)) { flush(); continue; }
      if (camMoved(S[i - 1], S[i]) > 0.05) { flush(); continue; }   // (the camera moves it: there is no telling)
      if (p[6] || q[6]) { flush(); continue; }   // (a crossing: the label is changing place by a cross-fade, which is what it should do)
      const d = Math.hypot(q[1]! - p[1]!, q[2]! - p[2]!);
      if (d >= JUMP_PX) { flush(); out.push(finding('label-slide', `label "${r.key}"`, `jumped ${Math.round(d)} px in one frame at alpha ${r1(q[5]!)}, instead of fading`, S[i - 1]!.t, S[i]!.t)); continue; }
      if (d > 0.2) { if (run) { run.d += d; run.i1 = i; run.a = Math.min(run.a, q[5]!); run.quiet = 0; } else run = { i0: i - 1, i1: i, d, a: q[5]!, quiet: 0 }; }
      else if (run && ++run.quiet >= 2) flush();
    }
    flush();
  }
  return out;
}

const gapOk = (S: Sample[], i: number) => S[i]!.t - S[i - 1]!.t <= POP_GAP_MS;

export function cardPop(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples;
  for (const r of alphaSeries(S, 'K').values()) {
    for (let i = 1; i < S.length; i++) {
      if (!gapOk(S, i) || !(r.a[i]! >= 0) || !(r.a[i - 1]! >= 0)) continue;
      const d = r.a[i]! - r.a[i - 1]!;
      if (Math.abs(d) >= POP_ALPHA) out.push(finding('card-pop', `card "${r.key}"`, `${d > 0 ? 'appeared' : 'vanished'} in one frame (alpha ${r1(r.a[i - 1]!)} to ${r1(r.a[i]!)} in ${Math.round(S[i]!.t - S[i - 1]!.t)} ms), not a fade`, S[i - 1]!.t, S[i]!.t));
    }
  }
  return out;
}

export function cardSizeSnap(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples, N = S.length;
  const byKey = new Map<string, (number[] | null)[]>();
  S.forEach((s, i) => { if (s.K) for (const e of s.K as number[][]) { const k = String(e[0]); let m = byKey.get(k); if (!m) byKey.set(k, (m = new Array(N).fill(null))); m[i] = e; } });
  for (const [key, at] of byKey) {
    for (const [idx, what] of [[4, 'height'], [3, 'width']] as [number, string][]) {
      const step = (i: number) => (i >= 1 && i < N && at[i] && at[i - 1] && gapOk(S, i) && at[i]![5]! > 0.05 && at[i - 1]![5]! > 0.05 ? Math.abs(at[i]![idx]! - at[i - 1]![idx]!) : 0);
      for (let i = 2; i < N - 1; i++) {
        const d = step(i);
        if (d >= SNAP_PX && d >= SNAP_RATIO * Math.max(step(i - 1), step(i + 1), 1)) out.push(finding('card-size-snap', `card "${key}"`, `${what} ${Math.round(at[i - 1]![idx]!)} to ${Math.round(at[i]![idx]!)} px in one frame (${Math.round(S[i]!.t - S[i - 1]!.t)} ms), not a glide`, S[i - 1]!.t, S[i]!.t));
      }
    }
  }
  return out;
}

/** card-empty: a card is shown (alpha at least SHOWN_CARD) with no words in it for EMPTY_MS and EMPTY_FRAMES running. */
export function cardEmpty(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples;
  const ids = new Set<string>();
  for (const s of S) for (const e of (s.K ?? []) as unknown[][]) ids.add(String(e[0]));
  for (const id of ids) {
    const bad = (s: Sample) => { const j = (s.K ?? []).findIndex((e) => e[0] === id); return j >= 0 && s.W != null && s.W[j] === 0 && (s.K![j]![5] as number) >= SHOWN_CARD; };
    let i = 0;
    while (i < S.length) {
      if (!bad(S[i]!)) { i++; continue; }
      let j = i; while (j + 1 < S.length && bad(S[j + 1]!)) j++;
      if (j - i + 1 >= EMPTY_FRAMES && S[j]!.t - S[i]!.t >= EMPTY_MS) out.push(finding('card-empty', `card "${id}"`, `shown for ${Math.round(S[j]!.t - S[i]!.t)} ms with nothing in it`, S[i]!.t, S[j]!.t));
      i = j + 1;
    }
  }
  return out;
}

/** camera-straight: after a view change the camera's one move goes one way on one line and does not stop part way (the fit is no waypoint) or turn back. */
export function cameraStraight(h: History): MFinding[] {
  const out: MFinding[] = [], S = h.samples, views = (h.events ?? []).filter((e) => e.k === 'view');
  for (let v = 0; v < views.length; v++) {
    const te = views[v]!.t, next = views[v + 1] ? views[v + 1]!.t : Infinity, lim = Math.min(te + VIEW_SPAN_MS, next);
    let i0 = -1;
    for (let i = 1; i < S.length; i++) {
      if (S[i]!.t < te - 50) continue;
      if (S[i]!.t > te + VIEW_LEAD_MS) break;
      if (S[i]!.c && S[i - 1]!.c && camMoved(S[i - 1], S[i]) > 0.3) { i0 = i - 1; break; }
    }
    if (i0 < 0) continue;
    let i1 = i0 + 1, lastMove = i0 + 1, rest = false;
    for (let i = i0 + 1; i < S.length && S[i]!.t <= lim; i++) {
      i1 = i;
      if (camMoved(S[i - 1], S[i]) >= 0.05) lastMove = i; else if (S[i]!.t - S[lastMove]!.t >= REST_MS) { rest = true; break; }
    }
    i1 = lastMove;
    if (i1 - i0 < 6 || !rest || S[i1]!.t >= next || (h.events ?? []).some((e) => e.k === 'hand' && e.t >= te - 100 && e.t <= S[i1]!.t)) continue;
    const rows = S.slice(i0, i1 + 1).map((s) => [s.t - S[i0]!.t, ...s.c!] as number[]);
    const f = rows[0]!, l = rows[rows.length - 1]!, to = String(views[v]!.to ?? 'a view');
    const dist = (a: number[], b: number[]) => Math.hypot(b[2]! - a[2]!, b[3]! - a[3]!) + Math.abs(Math.log(b[1]! / a[1]!)) * 400;
    const total = dist(f, l);
    if (total <= 20) continue;
    let run = 0, from = 0, turned = false;
    for (let i = 1; i < rows.length; i++) {
      const d = dist(rows[i - 1]!, rows[i]!), done = dist(f, rows[i]!) / total;
      if (d < 0.05 && done > 0.1 && done < 0.9) { if (!run) from = rows[i - 1]![0]!; run += rows[i]![0]! - rows[i - 1]![0]!; if (run >= STOP_MS) { out.push(finding('camera-straight', `the camera on the change to ${to}`, `stops part way (${Math.round(run)} ms at ${Math.round(done * 100)}% of the move)`, S[i0]!.t + from, S[i0]!.t + from + run)); break; } } else run = 0;
      if (i > 1 && !turned) {
        // a step against the way the move is going (more than a pixel): it turned back
        const gx = l[2]! - f[2]!, gy = l[3]! - f[3]!, sx = rows[i]![2]! - rows[i - 1]![2]!, sy = rows[i]![3]! - rows[i - 1]![3]!;
        if ((gx * sx + gy * sy) / Math.max(1, Math.hypot(gx, gy)) < -1.5) { turned = true; out.push(finding('camera-straight', `the camera on the change to ${to}`, `turns back at ${Math.round((rows[i]![0]!))} ms`, S[i0]!.t + rows[i]![0]!)); }
      }
    }
  }
  return out;
}

export const MOTION_RULES = [
  { id: 'flash', judge: flash }, { id: 'stuck-mid', judge: stuckMid }, { id: 'label-slide', judge: labelSlide }, { id: 'label-dim-alpha', judge: labelDimAlpha },
  { id: 'card-pop', judge: cardPop }, { id: 'card-size-snap', judge: cardSizeSnap }, { id: 'card-empty', judge: cardEmpty }, { id: 'camera-straight', judge: cameraStraight },
].map((r) => ({ ...r, kind: 'series' as const, ...RULE_INFO[r.id]! }));

/** Every rule over one history: the findings, in time order. A rule that throws is reported as a finding of its own, never swallowed. */
export function judgeMotion(h: History, rules = MOTION_RULES): MFinding[] {
  const out: MFinding[] = [];
  for (const r of rules) {
    try { out.push(...r.judge(h)); } catch (e) { out.push({ rule: r.id, what: 'the rule itself', where: `threw: ${(e as Error)?.message ?? e}`, why: r.why, owner: 'src/ui/debug/watch/motion-rules.ts', at: '0.0 s', t0: 0, t1: 0 }); }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.rule.localeCompare(b.rule));
}
