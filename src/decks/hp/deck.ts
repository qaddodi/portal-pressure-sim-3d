// A copied 2D deck as the deck the 3D app plays (the schema of src/decks/schema.ts): words as copied, the slide's own camera, view and lens from the plan,
// the data card (tiles) from the slide's fields, and `numbers: 'states'`, so every number a slide prints comes from that slide's own state in the engine.
// Nothing here is typed per slide; a slide that asks for something the 3D figure cannot do yet keeps its words and its shot and is listed by hooks.ts.
import { TERM_STATIONS } from '../../scene/labels/stations.ts';
import { CATHS, type CathState, type Deck, type EqPart, type Slide, type SlideTiles } from '../schema.ts';
import { planSlide } from './plan.ts';
import type { CopiedDeck, CopiedSlide } from './types.ts';

const TAG = /<(mi|mo|msub)\b([^>]*)>(.*?)<\/\1>/g;

/** The 2D equation (HTML-ish strings: `<mi>`, `<mo>`, `<msub><mi>P</mi><mtext>portal vein</mtext></msub>`) as the card's parts. */
export function eqParts(html: string): EqPart[] {
  const out: EqPart[] = [];
  for (const m of html.matchAll(TAG)) {
    const [, tag, attrs, inner] = m;
    const cls = /class="([^"]*)"/.exec(attrs!)?.[1] ?? '';
    const tone = /\beq-wedge\b/.test(cls) ? 'wedge' as const : /\beq-hv\b/.test(cls) ? 'free' as const : undefined;
    if (tag === 'msub') {
      const base = /<mi>(.*?)<\/mi>/.exec(inner!)?.[1], sub = /<mtext>(.*?)<\/mtext>/.exec(inner!)?.[1];
      if (!base || !sub) throw new Error(`equation part "${m[0]}" is not <mi> and <mtext>`);
      out.push({ tag: 'mi', text: base, sub, ...(tone ? { tone } : {}) });
    } else out.push({ tag: tag as 'mi' | 'mo', text: inner!, ...(tone ? { tone } : {}) });
  }
  if (!out.length) throw new Error(`equation "${html}" has no parts`);
  return out;
}

/** The words of the slide that point at a figure part, keeping only those the 3D labels can place (the others have a hook, hooks.ts missingTerms). */
const knownTerms = (t: CopiedSlide['terms']): Record<string, string> | undefined => {
  if (!t || Array.isArray(t)) return undefined;
  const out = Object.fromEntries(Object.entries(t).filter(([, term]) => term in TERM_STATIONS));
  return Object.keys(out).length ? out : undefined;
};

export function slideOf(deckId: string, s: CopiedSlide, i: number, prevCath: CathState | undefined): Slide {
  const plan = planSlide(deckId, s, i);
  const cath = (CATHS as readonly string[]).includes(s.cath ?? '') ? (s.cath as CathState) : s.cathKeep ? prevCath : undefined;   // ('blocked' is a hook of batch B5)
  const tiles: SlideTiles | undefined = s.data === 'tiles' && s.tiles?.length
    ? { deck: deckId, slide: s.id, keys: s.tiles, key: s.key ?? [], delta: s.delta ?? null } : undefined;
  const eq = s.eq ? eqParts(s.eq[0]!) : undefined;
  const terms = knownTerms(s.terms);
  const scene = { ...plan.scene, terms: plan.scene.terms.filter((t) => t in TERM_STATIONS) };
  return {
    id: s.id, kicker: s.kicker, title: s.title, line: s.line, notes: s.notes,
    ...(s.vignette ? { vignette: s.vignette } : {}),
    ...(terms ? { terms } : {}),
    ...(eq ? { eq } : {}),
    ...(s.eq?.[1] ? { eqLegend: s.eq[1] } : {}),
    ...(s.ask ? { ask: s.ask } : {}),
    ...(cath ? { cath } : {}),
    ...(tiles ? { tiles } : {}),
    scene,
  };
}

/** The copied deck a played deck came from (its slides' model steps are what the states are computed from). */
const COPIED = new Map<string, CopiedDeck>();
export const copiedOf = (id: string): CopiedDeck | undefined => COPIED.get(id);

export function toDeck(c: CopiedDeck): Deck {
  COPIED.set(c.id, c);
  let cath: CathState | undefined;
  const slides = c.slides.map((s, i) => { const x = slideOf(c.id, s, i, cath); if (x.cath) cath = x.cath; else if (!s.cathKeep) cath = undefined; return x; });
  return {
    id: c.id, title: c.title, level: c.level, minutes: c.minutes, summary: c.summary, objectives: c.objectives, head: c.head,
    ...(c.sections ? { sections: c.sections } : {}),
    slides, checks: c.checks, numbers: 'states',
  };
}
