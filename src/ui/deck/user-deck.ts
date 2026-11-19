// A talk of your own as a 3D deck: a script (a patient and its settings per step) or an imported deck file (the 2D deck format), read as data and never run.
// The 2D fields the 3D app has no card for yet (tools, visuals, procedures) are left out; the words, the patient, the equation, the question and the quick check stay.
import type { Deck, Slide, EqPart } from '../../decks/schema.ts';
import { parseLine } from '../text/line.ts';
import { cleanEq } from './from2d/import-safety.js';
import type { Script, ScriptStep } from './script-library.ts';

type Obj = Record<string, unknown>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

/** A line the card can set: markup the card does not know ({anything}) prints as its own words, never throws. */
export function safeLine(line: string): string {
  try { parseLine(line); return line; } catch { return line.replace(/\{([^}]*)\}/g, '$1'); }
}

/** An equation the 2D deck writes as MathML, as the card's parts: names and numbers as <mi>, signs as <mo> (a fraction or a subscript prints its pieces in order). */
export function eqParts(eq: unknown): EqPart[] | undefined {
  const clean = cleanEq(eq) as [string, string] | null;
  if (!clean) return undefined;
  const out: EqPart[] = [];
  for (const m of clean[0].matchAll(/<(mi|mn|mtext|mo)(?:\s+class="([^"]*)")?>([^<]*)<\/\1>/g)) {
    const part: EqPart = { tag: m[1] === 'mo' ? 'mo' : 'mi', text: m[3].replace(/&[a-z]+;|&#\d+;/gi, (e) => ({ '&minus;': '−', '&plus;': '+', '&times;': '×', '&middot;': '·', '&gt;': '>', '&lt;': '<' } as Record<string, string>)[e] ?? e) };
    if (/eq-wedge/.test(m[2] || '')) part.tone = 'wedge'; else if (/eq-hv/.test(m[2] || '')) part.tone = 'free';
    out.push(part);
  }
  return out.length ? out : undefined;
}

const slideOf = (s: Obj, i: number, deckTitle: string): Slide => {
  const ask = Array.isArray(s.ask) ? s.ask : null;
  const model = str(s.preset) ? { preset: str(s.preset), ...(isObj(s.params) ? { params: s.params } : {}), ...(typeof s.presetDays === 'number' ? { days: s.presetDays } : {}) } : undefined;
  return {
    id: str(s.id) || `s${i + 1}`,
    kicker: str(s.kicker, deckTitle), title: str(s.title, 'Slide'), line: safeLine(str(s.line)),
    ...(str(s.vignette) ? { vignette: str(s.vignette) } : {}),
    ...(isObj(s.terms) ? { terms: Object.fromEntries(Object.entries(s.terms).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
    ...(s.eq ? { eq: eqParts(s.eq) } : {}),
    ...(model ? { model } : {}),
    notes: str(s.notes) || str(s.tell),
    ...(ask && typeof ask[0] === 'string' ? { ask: [ask[0], typeof ask[1] === 'string' ? ask[1] : ''] as [string, string] } : {}),
    shot: 'title',
  };
};

const stepSlide = (st: ScriptStep, i: number, title: string): Slide => slideOf({ ...st, id: `step${i + 1}`, kicker: st.kicker || title, title: st.title || 'Step', line: st.line || '', notes: st.notes || (st as Obj).tell || '' }, i, title);

/** The deck a script or an imported deck plays as. The id and title are the script's; its level is "yours". */
export function userDeck(s: Script): Deck {
  const base = { id: s.id, title: s.title, level: 'yours', mine: true as const, minutes: 0 };
  if (s.deck) {
    const d = s.deck;
    const slides = (Array.isArray(d.slides) ? d.slides : []).filter(isObj).map((x, i) => slideOf(x, i, s.title));
    const checks = (Array.isArray(d.checks) ? d.checks : []).filter((c): c is [string, string] => Array.isArray(c) && typeof c[0] === 'string' && typeof c[1] === 'string').map((c) => [c[0], c[1]] as [string, string]);
    return {
      ...base, minutes: typeof d.minutes === 'number' ? d.minutes : 0, summary: str(d.summary, s.summary ?? ''),
      objectives: (Array.isArray(d.objectives) ? d.objectives : []).filter((o): o is string => typeof o === 'string'),
      checks, slides,
      ...(Array.isArray(d.sections) ? { sections: (d.sections as unknown[]).filter((x): x is [string, string[]] => Array.isArray(x) && typeof x[0] === 'string' && Array.isArray(x[1])) } : {}),
      ...(typeof d.head === 'string' ? { head: d.head } : {}),
    };
  }
  return { ...base, summary: s.summary ?? '', objectives: [], checks: [], slides: (s.steps ?? []).map((st, i) => stepSlide(st, i, s.title)) };
}
