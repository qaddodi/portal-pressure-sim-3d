// A copied 2D deck as the deck the 3D app plays (the schema of src/decks/schema.ts): words as copied, the slide's own camera, view and lens from the plan,
// the data card (tiles) from the slide's fields, and `numbers: 'states'`, so every number a slide prints comes from that slide's own state in the engine.
// Nothing here is typed per slide; a slide that asks for something the 3D figure cannot do yet keeps its words and its shot and is listed by hooks.ts.
import { ownKeys } from '../../ui/deck/from2d/card-tiles.js';
import { TERM_STATIONS } from '../../scene/labels/stations.ts';
import { CATHS, type CathState, type Deck, type EqPart, type Slide, type SlideScene, type SlideTiles, type TableSpec } from '../schema.ts';
import { planSlide } from './plan.ts';
import { controlsOf } from '../controls.ts';
import { playsLapse } from './lapse.ts';
import { instrumentOf } from '../../ui/talk/slide-instrument.generated.js';
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

/** The 2D summary table (`visual: 'table'`: cols, of, vs, asc, rowHead, foot, note, calm, focusRow, wave, waveMax) as the table card's spec. */
export function tableOf(s: CopiedSlide): TableSpec | undefined {
  if (s.visual !== 'table' || !Array.isArray(s.of)) return undefined;
  const pick = ['cols', 'of', 'vs', 'asc', 'rowHead', 'foot', 'note', 'calm', 'focusRow', 'wave', 'waveMax'] as const;
  return Object.fromEntries(pick.filter((k) => s[k] != null).map((k) => [k, s[k]])) as unknown as TableSpec;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
/** A 2D `cite` is a string or a list of them (one line each); the card prints them joined. */
const citeOf = (v: unknown): string | undefined => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' · ') || undefined : str(v));

/** A 2D `sides` list: the two guidelines' names and words, as the card sets them. */
const sidesOf = (v: unknown): { who: string; text: string }[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const two = v.filter((x): x is { who: string; text: string } => !!x && typeof x.who === 'string' && !!x.who.trim() && typeof x.text === 'string' && !!x.text.trim()).map((x) => ({ who: x.who, text: x.text }));
  return two.length ? two : undefined;
};
const strList = (v: unknown): string[] | undefined => (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined);

/** The figure's views after the slide's own, one per Next (2D slide-beats.js beatView: each beat builds on the one before, and changes only the figure). */
function beatScenes(deckId: string, s: CopiedSlide, i: number): SlideScene[] | undefined {
  if (!Array.isArray(s.beats) || !s.beats.length || s.visual) return undefined;
  let v: CopiedSlide = s;
  return (s.beats as Record<string, unknown>[]).map((b) => {
    v = { ...v, ...b } as CopiedSlide;
    const sc = planSlide(deckId, v, i).scene;
    return { ...sc, terms: sc.terms.filter((t) => t in TERM_STATIONS) };
  });
}

export function slideOf(deckId: string, s: CopiedSlide, i: number, prevCath: CathState | undefined): Slide {
  const plan = planSlide(deckId, s, i);
  const cath = (CATHS as readonly string[]).includes(s.cath ?? '') ? (s.cath as CathState) : s.cathKeep ? prevCath : undefined;
  const tiles: SlideTiles | undefined = s.data === 'tiles' && s.tiles?.length
    ? { deck: deckId, slide: s.id, keys: s.tiles, key: s.key ?? [], delta: s.delta ?? null, own: { wide: ownKeys(s, false), phone: ownKeys(s, true) },
      ...(typeof s.hvpgResp === 'string' && s.hvpgResp ? { resp: s.hvpgResp } : s.hvpgResp === true ? { resp: true as const } : {}) } : undefined;
  const eq = s.eq ? eqParts(s.eq[0]!) : undefined;
  const terms = knownTerms(s.terms);
  const scene = { ...plan.scene, terms: plan.scene.terms.filter((t) => t in TERM_STATIONS) };
  const table = tableOf(s);
  const controls = controlsOf(s);
  const tool = s.tool && typeof (s.tool as { kind?: unknown }).kind === 'string' ? { kind: (s.tool as { kind: string }).kind } : undefined;
  const lp = s.lapse as { from?: string; to?: string } | null | undefined;
  const lapse = lp && typeof s.days === 'number' && s.days > 0 ? { days: s.days, ...(lp.from ? { from: lp.from } : {}), ...(lp.to ? { to: lp.to } : {}), plays: playsLapse(s, i) } : undefined;
  const sides = sidesOf(s.sides), causes = strList(s.causes), beats = beatScenes(deckId, s, i);
  return {
    id: s.id, kicker: s.kicker ?? '', title: s.title ?? '', line: s.line ?? '', notes: s.notes ?? '',
    ...(s.vignette ? { vignette: s.vignette } : {}),
    ...(str(s.question) && !s.vignette && !s.preset && !s.procedure ? { question: str(s.question) } : {}),
    ...(str(s.caseQ) ? { caseQ: str(s.caseQ) } : {}),
    ...(str(s.caveat) ? { caveat: str(s.caveat) } : {}),
    ...(citeOf(s.cite) ? { cite: citeOf(s.cite) } : {}),
    ...(s.visual ? { visual: s.visual } : {}),
    ...(table ? { table } : {}),
    ...(controls ? { controls } : {}),
    ...(tool ? { tool } : {}),
    ...(lapse ? { lapse } : {}),
    ...(terms ? { terms } : {}),
    ...(s.terms && (Array.isArray(s.terms) ? s.terms.length : Object.keys(s.terms).length) ? { lineTerms: s.terms as Record<string, string> | string[] } : {}),
    ...(strList(s.key) ? { lineKey: strList(s.key) } : {}),
    ...(strList((s as { bold?: unknown }).bold) ? { lineBold: strList((s as { bold?: unknown }).bold) } : {}),
    ...(eq ? { eq } : {}),
    ...(s.eq?.[1] ? { eqLegend: s.eq[1] } : {}),
    ...(str(s.site) ? { site: str(s.site) } : {}),
    ...(s.rail ? { rail: s.rail === 'all' ? 'all' as const : true as const } : {}),
    ...(sides ? { sides } : {}),
    ...(s.pill === false ? { pill: false as const } : {}),
    ...(causes ? { causes } : {}),
    ...(str(s.causesHead) ? { causesHead: str(s.causesHead) } : {}),
    ...(beats ? { beats } : {}),
    ...(Array.isArray(s.ask) && s.ask[0] ? { ask: s.ask } : {}),
    ...(cath ? { cath } : {}),
    ...(tiles ? { tiles } : {}),
    scene,
  };
}

/** The copied deck a played deck came from (its slides' model steps are what the states are computed from). */
const COPIED = new Map<string, CopiedDeck>();
export const copiedOf = (id: string): CopiedDeck | undefined => COPIED.get(id);

/** Every slide through 2D's own slide-instrument.js, as the presenter does once a deck is loaded: a time-lapse slide that names no instrument gets the flow-time chart of its two tiles, a procedure slide its event graph. */
const withInstruments = (c: CopiedDeck): CopiedDeck => ({ ...c, slides: c.slides.map((s) => (instrumentOf(s) ?? s) as CopiedSlide) });

export function toDeck(c0: CopiedDeck): Deck {
  const c = withInstruments(c0);
  COPIED.set(c.id, c);
  let cath: CathState | undefined;
  const slides = c.slides.map((s, i) => { const x = slideOf(c.id, s, i, cath); if (x.cath) cath = x.cath; else if (!s.cathKeep) cath = undefined; return x; });
  return {
    id: c.id, title: c.title, level: c.level, minutes: c.minutes, summary: c.summary, objectives: c.objectives, head: c.head,
    ...(c.sections ? { sections: c.sections } : {}),
    slides, checks: c.checks, numbers: 'states',
  };
}
