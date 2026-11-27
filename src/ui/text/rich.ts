// A slide's plain words, typeset the way the 2D presenter does (presenter-words.js `rich`): a disease name in its quiet pill, a word the slide's
// terms point at (or that names a station of the figure) in that station's colour, the slide's own key words in bold, the first mention of a
// term students meet for the first time in bold (three at most a line), and the view a line names ("colored by origin") in that view's colour.
// Pure: the card (cards/Line.tsx) turns the nodes into elements; tests/line-rich.test.ts judges them here. The tables are copied from 2D
// (scripts/copy-line-words.mjs, scene/labels/figure2d.copied.ts), never retyped.
import { TARGETS_FIG, VAL_TONE_2D } from '../../scene/labels/figure2d.copied.ts';
import { labelTone } from './series-tone.ts';
import { TERMS_2D, KEYWORDS_2D, AUTO_TERMS_2D, BY_RATE_2D, LENS_WORDS_2D, LENS_TONE_2D, DISEASES_2D } from './words2d.copied.ts';

export type Node =
  | { t: 'text'; s: string }
  | { t: 'term'; s: string; term: string; tone: string; stop?: string }
  | { t: 'bold'; s: string }
  | { t: 'disease'; s: string }
  | { t: 'lens'; by: string; s: string; tone: string };

/** What a slide's line needs besides its words: the 2D `terms` (a list of station ids, or { word: id }), `key` (its highlighted tiles) and `bold` words. */
export interface RichSlide { terms?: Record<string, string> | readonly string[] | null; key?: readonly string[] | null; bold?: readonly string[] | null }

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ci = (w: string) => w.replace(/^([a-z])/, (c) => `[${c}${c.toUpperCase()}]`);

// Node ids name their target too ([portal vein](CONF) is [portal vein](pv)): 2D presenter-words.js, after TARGETS.
const TARGET: Record<string, { tone: string; organ?: string; words?: string }> = { ...TARGETS_FIG };
for (const t of Object.values(TARGETS_FIG)) if (t.node && !TARGET[t.node]) TARGET[t.node] = t;
export const targetOf = (k: string) => TARGET[k] ?? null;

/** A station's colour token as a CSS value (2D toneVar). */
export const toneVar = (t: string): string => (t === 'accent' ? 'var(--accent)' : t.startsWith('--') ? `var(${t})` : `var(--tr-${t})`);

export const DISEASE_SRC = DISEASES_2D.map(ci).join('|');
const TERM_SRC = TERMS_2D.join('|');
const LENS_RE = String.raw`\b([Cc]olou?red by )(${Object.keys(LENS_WORDS_2D).sort((a, b) => b.length - a.length).join('|')})\b`;

/** A slide's terms as [words, target] pairs (2D termList): each id's own words, or the words the deck wrote; the cavernoma always. */
export function termList(s: RichSlide): [string, string][] {
  const t = s.terms ?? [];
  const own: [string | undefined, string][] = Array.isArray(t) ? (t as string[]).map((k) => [TARGET[k]?.words, k]) : Object.entries(t as Record<string, string>).map(([w, k]) => [esc(w), k]);
  const have = new Set(own.map(([, k]) => k));
  return [...own, ...AUTO_TERMS_2D.filter((k) => !have.has(k)).map((k): [string | undefined, string] => [TARGET[k]?.words, k])].filter((p): p is [string, string] => !!p[0] && !!TARGET[p[1]]);
}

/** The line's typesetter: call it with each plain stretch of the line in order; it remembers what it has set (a term pills once, three bold words at most). `spleenTone`: the spleen's word takes its status colour. */
export function typesetter(s: RichSlide, spleenTone?: () => string | null) {
  const keys = [...(s.key ?? []).map((k) => KEYWORDS_2D[k]).filter(Boolean) as string[], ...(s.bold ?? []).map(esc)];
  const tl = termList(s);
  const tw = tl.map(([w]) => w.replace(/(^|\|)([a-z])/g, (_, p: string, c: string) => `${p}[${c}${c.toUpperCase()}]`));
  const re = new RegExp(String.raw`\b(${DISEASE_SRC})\b` + (tw.length ? `|\\b(${tw.join('|')})\\b` : '|((?!))') + (keys.length ? `|\\b(${keys.join('|')})\\b` : '|((?!))') + `|\\b(${TERM_SRC})\\b|${LENS_RE}`, 'g');
  const seen = new Set<string>(), seenT = new Set<string>();
  let bold = 0;
  const toneOf = (k: string): string => (TARGET[k]!.organ === 'spleen' ? spleenTone?.() ?? '--text-2' : labelTone(k, TARGET[k]!.tone));
  return {
    /** A figure term the deck marked by hand ([label](id)): its pill, once styled in its station's colour. */
    term(label: string, k: string): Node { return TARGET[k] ? { t: 'term', s: label, term: k, tone: toneOf(k) } : { t: 'text', s: label }; },
    /** One plain stretch of the line as nodes. */
    set(text: string): Node[] {
      const out: Node[] = [];
      let at = 0, m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        const [all, dz, tword, key, term, lensBy, lensW] = m;
        const w = (key || term)?.toLowerCase().replace(/(?:s|ces)$/, '');
        if (term && (seen.has(w!) || bold >= 3)) continue;
        if (key && seen.has(w!)) continue;
        const tk = tword ? tl.find(([x]) => new RegExp(`^(?:${x})$`, 'i').test(tword))?.[1] : null;
        if (tword && (!tk || seenT.has(tk))) continue;
        if (m.index > at) out.push({ t: 'text', s: text.slice(at, m.index) });
        if (lensW) out.push({ t: 'text', s: lensBy!.replace(/ $/, ' ') }, { t: 'lens', by: lensBy!, s: lensW, tone: LENS_TONE_2D[LENS_WORDS_2D[lensW]!]! });
        else if (tword) { seenT.add(tk!); out.push({ t: 'term', s: tword, term: tk!, tone: toneOf(tk!) }); }
        else if (dz) out.push({ t: 'disease', s: dz });
        else { seen.add(w!); bold++; out.push({ t: 'bold', s: (key || term)! }); }
        at = m.index + all.length;
        // (a term pill keeps the stop or bracket after it on its line)
        const last = out[out.length - 1]!;
        const st = last.t === 'term' ? /^[),.;:]+/.exec(text.slice(at))?.[0] : null;
        if (last.t === 'term' && st) { last.stop = st; at += st.length; }
      }
      if (at < text.length) out.push({ t: 'text', s: text.slice(at) });
      return out;
    },
  };
}

/** A reading's pill colour when its tile does not rate it: the station it is read at (2D VAL_TONE), none for a size (spleen, varices). */
export const stationTone = (k: string): string | null => (BY_RATE_2D.includes(k) ? null : VAL_TONE_2D[k] ?? null);

/** What the typesetter needs of a deck slide (its terms as 2D wrote them, its key tiles and bold words). */
export const richOf = (s: { lineTerms?: RichSlide['terms']; lineKey?: readonly string[]; lineBold?: readonly string[] }): RichSlide => ({ terms: s.lineTerms ?? null, key: s.lineKey ?? null, bold: s.lineBold ?? null });
