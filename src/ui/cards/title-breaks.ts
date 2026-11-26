// Where a slide's title breaks, judged once for every title on every deck and size (pure of the DOM: node judges it, tests/title-breaks.test.ts).
//
// The browser's own wrap fills each line and, with `text-wrap: pretty`, only keeps a lone word off the last line, so a title could set as
// "When HE persists, / reduce the / stent diameter": a short middle line, and a break that strands "the" at a line's end (Mohammad, 26 Nov, Mac,
// Encephalopathy 11). The root is that nothing judged the breaks. Here the lines a browser can make at each width are all tried (the title keeps
// its fewest lines, never one more), each is scored for how it reads, and the title is held to the width of the best one (`max-width`), so the
// browser's plain wrap then sets exactly those lines. No `<br>`, no markup in the words, the text stays one string.

import { ABBREVIATIONS } from '../../decks/names.ts';

/** Every abbreviation the app prints that is two or more words ("Rt HF"). */
const ABBR_WITH_SPACE: readonly string[] = Object.keys(ABBREVIATIONS).filter((a) => a.includes(' '));

/** The width in px of a run of words as set in the title's own font. */
export type Measure = (text: string) => number;

/** One run of a title the browser may break after: a word, or the part of a hyphenated or dashed word up to and including its dash ("long-" and "term"). `sp` is whether a space comes before it. */
export interface Tok { s: string; sp: boolean }

// An abbreviation of two words never breaks between them ("(Rt | HF)" stood on two lines, capture 3531bdfa 27.9):
// its space becomes a no-break space, which the title's own breaking does not see as a place to break.
export function tieAbbreviations(text: string): string {
  return ABBR_WITH_SPACE.reduce((t, a) => t.split(a).join(a.replace(/ /g, '\u00a0')), text);
}

/** The runs of a title. A browser breaks after a hyphen or a dash as readily as at a space, so the judgement must know those places too. */
export function tokensOf(text: string): Tok[] {
  const out: Tok[] = [];
  for (const [i, word] of text.trim().split(/ +/).filter(Boolean).entries()) {
    const parts = word.match(/[^\-–—]+[\-–—]*|[\-–—]+/g) ?? [word];
    // (a dash that opens a word, or follows nothing, is not a place to break: it stays with what follows)
    parts.forEach((s, j) => out.push({ s, sp: j === 0 && i > 0 }));
  }
  return out;
}
/** The text of tokens [from, to) as the browser sets it. */
export const lineText = (toks: readonly Tok[], from: number, to: number): string => toks.slice(from, to).map((t, i) => (i > 0 && t.sp ? ' ' : '') + t.s).join('');

/** The words a line must not end on: the article, preposition, conjunction or helper that belongs with what follows. */
const STRANDED = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'its', 'their', 'his', 'her', 'our', 'your', 'each', 'every', 'any', 'no',
  'of', 'in', 'on', 'at', 'by', 'for', 'to', 'from', 'with', 'without', 'into', 'onto', 'over', 'under', 'than', 'as', 'via', 'per', 'vs', 'versus',
  'and', 'or', 'but', 'nor', 'so', 'if', 'when', 'while', 'because', 'after', 'before', 'until', 'unless', 'whether', 'is', 'are', 'was', 'were', 'be', 'not', 'can', 'may', 'should', 'does', 'do',
]);
/** The words a line may happily begin on: a break before them is where a phrase ends. */
const OPENERS = new Set(['of', 'in', 'on', 'at', 'for', 'to', 'from', 'with', 'without', 'into', 'and', 'or', 'but', 'than', 'when', 'while', 'because', 'if', 'after', 'before', 'versus', 'vs']);
/** A unit that stays with the number before it ("6 | mm" never). */
const UNIT = /^(mm|mmhg|cm|ml|mg|kg|g|l|dl|mmol|mol|u|iu|h|hr|hrs|min|s|sec|d|days?|weeks?|months?|years?|yr|yrs|bpm|%|x|×|fold|times)([.,;:)]*)$/i;

const trim = (w: string): string => w.replace(/[^\p{L}\p{N}%×]+$/u, '').replace(/^[^\p{L}\p{N}%×]+/u, '').toLowerCase();

/** What breaking the title after word `i` costs: nothing at a comma or a colon (a phrase's own end), a lot where it strands a function word or parts a number from its unit. */
export function breakCost(toks: readonly Tok[], i: number): number {
  const last = toks[i]!.s, next = toks[i + 1]!.s;
  // (inside a hyphenated word: "dose- / reduced" reads as two words torn apart)
  if (!toks[i + 1]!.sp) return 0.9;
  let c = 0;
  if (/[,;:–—)?!.]$/.test(last)) c -= 0.15;
  else {
    if (STRANDED.has(trim(last))) c += 1;
    if (/\d$/.test(last) && UNIT.test(next)) c += 1.5;
    if (/^[(\[]?\d/.test(next) && /^(of|to|by|than|vs|versus)$/.test(trim(last))) c += 0.3;
    if (OPENERS.has(trim(next))) c -= 0.15;
  }
  return c;
}

export interface Line { from: number; to: number; w: number }

/** The lines a browser sets at width `w` (a line takes words while they fit; a word wider than the line stands alone). */
export function wrapAt(toks: readonly Tok[], measure: Measure, w: number): Line[] {
  const out: Line[] = [];
  let from = 0;
  while (from < toks.length) {
    let to = from + 1, lw = measure(lineText(toks, from, to));
    while (to < toks.length) {
      const next = measure(lineText(toks, from, to + 1));
      if (next > w + 0.01) break;
      lw = next; to++;
    }
    out.push({ from, to, w: lw });
    from = to;
  }
  return out;
}

/** How a set of lines reads, lower is better: raggedness of every line but the last, a last line short beside the rest, a lone word on it, and each break's own cost. */
export function scoreLines(toks: readonly Tok[], lines: readonly Line[]): number {
  const n = lines.length;
  if (n < 2) return 0;
  const widest = Math.max(...lines.map((l) => l.w));
  let c = 0;
  for (let i = 0; i < n - 1; i++) {
    const r = (widest - lines[i]!.w) / widest;
    c += r * r;
    // a middle line well short of the rest is the shape that reads worst: it costs more than its raggedness
    if (i > 0 && lines[i]!.w < 0.7 * widest) c += (0.7 - lines[i]!.w / widest) * 3;
    c += breakCost(toks, lines[i]!.to - 1);
  }
  const rl = lines[n - 1]!.w / widest;
  c += 0.5 * (1 - rl) * (1 - rl);
  if (rl < 0.3) c += (0.3 - rl) * 3;
  if (lines[n - 1]!.to - lines[n - 1]!.from === 1 && rl < 0.5) c += 0.3;
  // the first line shorter than a later one reads as a step up: a little extra
  if (n > 2 && lines[0]!.w < 0.8 * widest) c += (0.8 - lines[0]!.w / widest) * 1.5;
  return c;
}

export interface TitlePlan {
  /** the `max-width` to hold the title to, in px: the browser's greedy wrap at it sets `lines` */
  width: number;
  lines: string[];
  cost: number;
}

/** The slack above a line's measured width that the held width carries, so a measure a hair off never wraps the widest line. */
export const SLACK = 1.5;

/** The best way to break `text` into the fewest lines it needs at `avail` px, or null when it sets on one line (or a word is wider than the line: nothing to judge). */
export function planTitle(text: string, measure: Measure, avail: number): TitlePlan | null {
  const toks = tokensOf(text);
  if (toks.length < 2 || !(avail > 0)) return null;
  const first = wrapAt(toks, measure, avail);
  const n = first.length;
  if (n < 2 || Math.max(...first.map((l) => l.w)) > avail + 0.01) return null;
  let best: TitlePlan | null = null;
  let lines = first, guard = 0;
  while (lines.length === n && guard++ < 64) {
    const need = Math.max(...lines.map((l) => l.w));
    // (the lines are those the browser sets at the held width itself: a hair of slack can take in a word the tighter width had not)
    const width = Math.min(avail, need + SLACK), held = wrapAt(toks, measure, width);
    if (held.length === n) {
      const cost = scoreLines(toks, held);
      // (on a tie the wider hold wins: the first one tried, so a title keeps as much of the card's width as it can)
      if (!best || cost < best.cost - 1e-9) best = { width, lines: held.map((l) => lineText(toks, l.from, l.to)), cost };
    }
    const w = need - 0.5;
    if (toks.some((x) => measure(x.s) > w)) break;
    lines = wrapAt(toks, measure, w);
  }
  return best;
}
