// ?audit: the pure judges. Plain numbers in, findings out (no page, no clock), so a Node test drives every one of them (tests/debug-audit.test.ts).
//   frameStats   the clock's frame gaps while a step ran -> frames a second and hitches
//   timeline     when the cards and labels started and stopped moving, from the sampler's rows
//   fadeEpisodes how long each card or label took to go from gone to shown (or back), so an instant one shows
//   layoutFindings  text or pills that spill out of their card or off the screen, and words covered by the footer, the dock or the presenter bar
// The motion rules (flash, pop, snap, slide) are the watch recorder's own (watch/motion-rules.ts); the screen rules (fit, edge, labels) are the selfcheck's. Both run in run.ts.
import type { Sample } from '../watch/motion-rules.ts';

export type Sev = 'fail' | 'warn' | 'note';
export interface AuditFinding { kind: string; sev: Sev; what: string; where: string }
export type Box = [number, number, number, number];   // left, top, right, bottom (CSS px)

/** A frame gap past this (about two 60 Hz frames) is a hitch the eye can see; past LONG_GAP_MS it is a stall. */
export const HITCH_MS = 25, LONG_GAP_MS = 50;
/** A card or label that goes from gone to shown (or back) in under this is a snap, not a fade; over SLOW it drags. The sampler steps every ~25 ms, so anything under two steps is instant to it. */
export const INSTANT_MS = 70, SLOW_FADE_MS = 1600;
/** Words may stand this far past their card before it is a spill (sub-pixel rounding and the card's own shadow are not). */
export const SPILL_PX = 2;
/** Share of a word box a bar may cover before the words count as covered. */
export const COVER_SHARE = 0.2;

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const within = (inner: Box, outer: Box, slack: number) => inner[0] >= outer[0] - slack && inner[1] >= outer[1] - slack && inner[2] <= outer[2] + slack && inner[3] <= outer[3] + slack;

// ── speed ──
export interface FrameStats { frames: number; fps: number | null; p95Gap: number; worstGap: number; hitches: number; stalls: number; workP95: number; workMax: number }
/** `gaps`: the ms between each frame the app drew and the one before it (the clock's `dt`; the first frame after the loop woke has none and is left out). The app draws only while something moves, so
 *  `fps` is how fast it ran while it was moving; null when fewer than 4 frames were drawn (nothing moved). `work`: the clock's own frame-work p95 and worst, ms. */
export function frameStats(gaps: readonly number[], work: { p95?: number; max?: number } = {}): FrameStats {
  const g = gaps.filter((x) => x > 0).sort((a, b) => a - b);
  const mean = g.length ? g.reduce((s, x) => s + x, 0) / g.length : 0;
  return {
    frames: g.length, fps: g.length >= 4 && mean > 0 ? r1(1000 / mean) : null,
    p95Gap: g.length ? r1(g[Math.min(g.length - 1, Math.floor(g.length * 0.95))]!) : 0, worstGap: g.length ? r1(g[g.length - 1]!) : 0,
    hitches: g.filter((x) => x > HITCH_MS).length, stalls: g.filter((x) => x > LONG_GAP_MS).length,
    workP95: r1(work.p95 ?? 0), workMax: r1(work.max ?? 0),
  };
}

// ── timing ──
export interface Timeline { cardStartMs: number | null; cardEndMs: number | null; labelEndMs: number | null; settledMs: number | null }
type Row = (string | number)[];
const rowsOf = (s: Sample, f: 'K' | 'L'): Row[] => ((s[f] as Row[] | null | undefined) ?? []);
const keyOf = (r: Row) => String(r[0]);
/** Did this card or label move or change alpha between two reads? (more than half a pixel, or one in a hundred of alpha) */
const changed = (a: Row, b: Row) => Math.abs(+a[1]! - +b[1]!) > 0.5 || Math.abs(+a[2]! - +b[2]!) > 0.5 || Math.abs(+a[3]! - +b[3]!) > 0.5 || Math.abs(+a[4]! - +b[4]!) > 0.5 || Math.abs(+a[5]! - +b[5]!) > 0.01;

/** From rows taken from the moment a step began (`t` = ms since then): when the first card began to change, when the last card stopped, when the last label stopped, and when anything last moved. */
export function timeline(samples: readonly Sample[]): Timeline {
  let cs: number | null = null, ce: number | null = null, le: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    for (const f of ['K', 'L'] as const) {
      const prev = new Map(rowsOf(samples[i - 1]!, f).map((r) => [keyOf(r), r]));
      const now = rowsOf(samples[i]!, f);
      let moved = now.length !== prev.size;
      for (const r of now) { const p = prev.get(keyOf(r)); if (!p || changed(p, r)) moved = true; }
      if (!moved) continue;
      const t = samples[i]!.t;
      if (f === 'K') { cs ??= samples[i - 1]!.t; ce = t; } else le = t;
    }
  }
  const all = [ce, le].filter((x): x is number => x != null);
  return { cardStartMs: cs, cardEndMs: ce, labelEndMs: le, settledMs: all.length ? Math.max(...all) : null };
}

export interface Fade { kind: 'card' | 'label'; key: string; dir: 'in' | 'out'; ms: number }
/** Every complete fade in the rows: alpha from at most 0.1 to at least 0.9 (in), or back (out); `ms` is the time between the last row at the one end and the first at the other, so it can be one sampler step long at least. */
export function fadeEpisodes(samples: readonly Sample[]): Fade[] {
  const out: Fade[] = [];
  for (const [f, kind] of [['K', 'card'], ['L', 'label']] as const) {
    const keys = new Set<string>();
    for (const s of samples) for (const r of rowsOf(s, f)) keys.add(keyOf(r));
    for (const key of keys) {
      // (a key missing from a row it could be in is alpha 0: a card taken out of the page at once is a fade of zero length)
      const a = samples.map((s) => { const r = rowsOf(s, f).find((x) => keyOf(x) === key); return r ? +r[5]! : 0; });
      let lo = -1, hi = -1;
      for (let i = 0; i < a.length; i++) {
        if (a[i]! <= 0.1) { if (hi >= 0 && lo < hi) { out.push({ kind, key, dir: 'out', ms: samples[i]!.t - samples[hi]!.t }); } lo = i; if (hi >= 0) hi = -1; }
        else if (a[i]! >= 0.9) { if (lo >= 0 && hi < lo) { out.push({ kind, key, dir: 'in', ms: samples[i]!.t - samples[lo]!.t }); } hi = i; if (lo >= 0) lo = -1; }
      }
    }
  }
  return out;
}

/** The fades that are not eased: instant ones (a snap) and ones that drag. */
export function fadeFindings(fades: readonly Fade[]): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const f of fades) {
    if (f.ms < INSTANT_MS) out.push({ kind: 'fade-instant', sev: 'fail', what: `${f.kind} "${f.key}" ${f.dir === 'in' ? 'appeared' : 'vanished'} in ${r0(f.ms)} ms: it snaps instead of easing`, where: `${f.kind} ${f.key}` });
    else if (f.ms > SLOW_FADE_MS) out.push({ kind: 'fade-slow', sev: 'warn', what: `${f.kind} "${f.key}" took ${r0(f.ms)} ms to ${f.dir === 'in' ? 'come in' : 'go'}`, where: `${f.kind} ${f.key}` });
  }
  return out;
}

// ── layout ──
export interface LayoutRead {
  vw: number; vh: number;
  /** cards standing whole (phase in, opaque), with the boxes of every run of words and pill inside */
  cards: { id: string; /** the card's heading, to name it in a finding */ title?: string; box: Box;
    /** `clip`: the box the nearest clipping ancestors leave visible (overflow hidden, auto, scroll or clip), when there is one */
    kids: { what: string; box: Box; clip?: Box | null }[];
    /** a chart or plot (an svg or a canvas of some size), with the visible box its clipping ancestors leave it */
    charts?: { what: string; box: Box; clip: Box | null }[] }[];
  /** the footer, the dock, the presenter bar, the top bar: whatever floats over the stage */
  bars: { id: string; box: Box }[];
  labels: { name: string; box: Box; alpha: number }[];
}

/** Text or a pill past its card's edge, past the screen, or under a bar. Cards, labels and bars are read from the page; the rules that judge the card as a whole (fit-off, edge-cutoff, label-overlap…) are the selfcheck's. */
export function layoutFindings(r: LayoutRead): AuditFinding[] {
  const out: AuditFinding[] = [];
  const screen: Box = [0, 0, r.vw, r.vh];
  for (const c of r.cards) {
    const name = c.title ? `"${c.title}"` : c.id;
    // a chart whose picture runs past the edge of whatever clips it: the axis, the lines and the last point are cut off (the plot taller than the card's room)
    for (const ch of c.charts ?? []) {
      const clip = ch.clip ?? c.box;
      if (area(ch.box) < 4 || within(ch.box, clip, SPILL_PX)) continue;
      const cut = { bottom: ch.box[3] - clip[3], right: ch.box[2] - clip[2], top: clip[1] - ch.box[1], left: clip[0] - ch.box[0] };
      const parts = (Object.entries(cut) as [string, number][]).filter(([, v]) => v > SPILL_PX).map(([k, v]) => `${r0(v)} px at the ${k}`);
      out.push({ kind: 'chart-clipped', sev: 'fail', what: `${ch.what} in card ${name} is cut off by its card: ${parts.join(', ')} hidden`, where: `card ${c.id}, ${ch.what}` });
    }
    for (const k of c.kids) {
      if (area(k.box) < 4) continue;
      if (k.clip && !within(k.box, k.clip, SPILL_PX)) {
        const by = Math.max(k.box[2] - k.clip[2], k.box[3] - k.clip[3], k.clip[0] - k.box[0], k.clip[1] - k.box[1]);
        out.push({ kind: 'clipped', sev: 'fail', what: `"${k.what}" in card ${name} is cut off by its container: ${r0(by)} px hidden`, where: `card ${c.id}, ${k.what}` });
      } else if (!within(k.box, c.box, SPILL_PX)) {
        const by = Math.max(k.box[2] - c.box[2], k.box[3] - c.box[3], c.box[0] - k.box[0], c.box[1] - k.box[1]);
        out.push({ kind: 'spill', sev: 'fail', what: `"${k.what}" in card ${name} runs ${r0(by)} px past the card's edge`, where: `card ${c.id}, ${k.what}` });
      } else if (!within(k.box, screen, 1)) {
        out.push({ kind: 'off-screen', sev: 'fail', what: `"${k.what}" in card ${c.id} stands off the screen`, where: `card ${c.id}, ${k.what}` });
      }
      for (const b of r.bars) {
        const s = overlap(k.box, b.box) / area(k.box);
        if (s > COVER_SHARE) out.push({ kind: 'covered', sev: 'fail', what: `"${k.what}" in card ${c.id} is ${r0(s * 100)}% under the ${b.id}`, where: `card ${c.id}, ${k.what}, ${b.id}` });
      }
    }
  }
  for (const l of r.labels) {
    if (l.alpha < 0.5) continue;
    for (const b of r.bars) {
      const s = area(l.box) ? overlap(l.box, b.box) / area(l.box) : 0;
      if (s > 0.35) out.push({ kind: 'covered', sev: 'warn', what: `label "${l.name}" is ${r0(s * 100)}% under the ${b.id}`, where: `label ${l.name}, ${b.id}` });
    }
  }
  return out;
}
