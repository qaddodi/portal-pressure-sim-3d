// A deck you write yourself (a script of live states, an imported deck file) goes through the SAME path as a built-in deck: it is made into a copied-deck shape here, checked field by field,
// and then played by `toDeck` like every other. There is no second, smaller deck format: the fields are the ones the 2D deck format has (decks/hp/fields.ts FIELD_HOME), plus the 3D
// overlay's (decks/overlay.ts). What cannot be played is NOT dropped quietly: each left-out field, and each value that would have broken a slide (an unknown camera, lens, preset or tool),
// comes back in `notices` in plain words, and the slide keeps everything else it asked for.
import { FIELD_HOME } from './hp/fields.ts';
import { planSlide } from './hp/plan.ts';
import { eqParts } from './hp/deck.ts';
import { CHART_TOOLS, INSTRUMENT_TOOLS } from './charts.ts';
import { CATHS } from './schema.ts';
import { OVERLAY_FIELDS } from './overlay.ts';
import { isSource } from './source.ts';
import { expandTemplate } from './templates.ts';
import { interactProblems } from './interact.ts';
import { PROCEDURE_PLAYS } from '../scene/procedures/plays.ts';
import { PRESETS } from '../engine/hales/portal/scenario.js';
import { cleanEq, unsafeIn } from '../ui/deck/from2d/import-safety.js';
import { parseLine } from '../ui/text/line.ts';
import type { CopiedDeck, CopiedSlide } from './hp/types.ts';

type Obj = Record<string, unknown>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

/** A line the card can set: markup the card does not know ({anything}) prints as its own words, never throws. */
export function safeLine(line: string): string {
  try { parseLine(line); return line; } catch { return line.replace(/\{([^}]*)\}/g, '$1'); }
}

/** The visuals a slide may ask for in place of its figure's card (the 2D `visual`). */
const VISUALS = new Set(['table', 'ladders', 'outline', 'check', 'plane', 'scale', 'quadrant', 'walls', 'allpatients']);
const PRESET_IDS = new Set((PRESETS as readonly { id: string }[]).map((p) => p.id));
const TOOL_KINDS = new Set<string>([...CHART_TOOLS, ...INSTRUMENT_TOOLS]);
/** What the author writes for each slide's words; these are read by name, everything else goes through the field table. */
const OWN = new Set(['id', 'title', 'kicker', 'line', 'notes', 'tell', 'ask', 'eq']);
const OVERLAY = new Set<string>(OVERLAY_FIELDS);

export interface Authored { deck: CopiedDeck; notices: string[] }

/** One slide, as the copied-deck shape: its words, and every other field the app uses that passes the checks. `at` names the slide in a notice. */
export function authorSlide(raw0: Obj, i: number, deckId: string, deckTitle: string, used: Set<string>, notices: string[]): CopiedSlide {
  // (a slide written as a template is laid out as ordinary fields first, and from here on is an ordinary slide: decks/templates.ts)
  const { slide: raw, problems } = expandTemplate(raw0);
  const title = str(raw.title, 'Slide'), at = `Slide ${i + 1} (“${title}”)`;
  for (const p of problems) notices.push(`${at}: ${p}.`);
  let id = str(raw.id) || `s${i + 1}`;
  while (used.has(id)) id += '-';
  used.add(id);
  const ask = Array.isArray(raw.ask) ? raw.ask : null;
  const out: Obj = {
    id, kicker: str(raw.kicker, deckTitle), title, line: safeLine(str(raw.line)), notes: str(raw.notes) || str(raw.tell),
    ask: ask && typeof ask[0] === 'string' ? [ask[0], typeof ask[1] === 'string' ? ask[1] : ''] : ['', ''],
  };
  if (raw.eq != null) {
    const clean = cleanEq(raw.eq) as [string, string] | null;
    if (!clean) notices.push(`${at}: the equation holds markup the app does not allow, so it was left out.`);
    else { try { eqParts(clean[0]); out.eq = clean[1] ? [clean[0], clean[1]] : [clean[0]]; } catch { notices.push(`${at}: the equation could not be read, so it was left out.`); } }
  }
  for (const [k, v] of Object.entries(raw)) {
    if (OWN.has(k) || v === undefined) continue;
    if (!(k in FIELD_HOME) && !OVERLAY.has(k)) { notices.push(`${at}: “${k}” is not a field the app uses, so it was left out.`); continue; }
    const bad = unsafeIn(v);
    if (bad) { notices.push(`${at}: “${k}” uses “${bad}”, which an imported deck may not, so it was left out.`); continue; }
    out[k] = v;
  }
  // values that would break the slide are named and taken out, one by one, so the rest of the slide plays
  const drop = (k: string, why: string): void => { delete out[k]; notices.push(`${at}: ${why}, so “${k}” was left out.`); };
  if (out.preset != null && !PRESET_IDS.has(str(out.preset))) { drop('preset', `there is no patient “${str(out.preset)}”`); delete out.params; delete out.presetDays; }
  if (isObj(out.tool) && !TOOL_KINDS.has(str(out.tool.kind))) drop('tool', `there is no instrument or chart “${str(out.tool.kind)}”`);
  if (out.visual != null && !VISUALS.has(str(out.visual))) drop('visual', `there is no visual “${str(out.visual)}”`);
  if (out.cath != null && !(CATHS as readonly string[]).includes(str(out.cath))) drop('cath', `there is no catheter state “${str(out.cath)}”`);
  if (out.view != null && out.view !== 'circuit' && out.view !== 'anatomic') drop('view', `the view “${str(out.view)}” is not one of anatomic or circuit`);
  for (const p of ([] as unknown[]).concat((out.procedure ?? []) as unknown[])) {
    const kind = typeof p === 'string' ? p : isObj(p) ? str(p.kind) : '';
    if (!PROCEDURE_PLAYS.has(kind)) { drop('procedure', `there is no procedure “${kind}”`); break; }
  }
  // the figure's camera and colour lens are checked by planning the slide, which throws on a name neither app has
  for (let tries = 0; tries < 3; tries++) {
    try { planSlide(deckId, out as CopiedSlide, i); break; } catch (e) {
      const why = e instanceof Error ? e.message : 'it could not be placed';
      if ('cam' in out) drop('cam', why); else if ('lens' in out) drop('lens', why); else throw e;
    }
  }
  return out as CopiedSlide;
}

/** The copied-deck shape of a deck object (the 2D deck format: title, summary, objectives, slides, checks …), checked slide by slide. */
export function authorDeck(id: string, title: string, d: Obj, summary = ''): Authored {
  const notices: string[] = [];
  const used = new Set<string>();
  // (a deck never takes a built-in deck's id: the figure's numbers are kept by deck id)
  const own = isSource(id) || id === 'hvpg' ? `my-${id}` : id;
  const slides = (Array.isArray(d.slides) ? d.slides : []).filter(isObj).map((x, i) => authorSlide(x, i, own, title, used, notices));
  const checks = (Array.isArray(d.checks) ? d.checks : [])
    .filter((c): c is [string, string] => Array.isArray(c) && typeof c[0] === 'string' && typeof c[1] === 'string')
    .map((c) => [c[0], c[1]] as [string, string]);
  const sections = Array.isArray(d.sections) ? (d.sections as unknown[]).filter((x): x is [string, string[]] => Array.isArray(x) && typeof x[0] === 'string' && Array.isArray(x[1])) : undefined;
  // (a question's `back` names another slide, so it can only be checked once the deck's slides are all here)
  slides.forEach((s, i) => {
    if (s.interact == null) return;
    const why = interactProblems(s.interact, slides.map((x) => x.id));
    if (why.length) { notices.push(`Slide ${i + 1} (“${s.title}”): the question for the room cannot be played (${why.join('; ')}), so “interact” was left out.`); delete s.interact; }
  });
  return {
    notices,
    deck: {
      id: own, title, level: 'yours', minutes: typeof d.minutes === 'number' ? d.minutes : 0, summary: str(d.summary, summary),
      objectives: (Array.isArray(d.objectives) ? d.objectives : []).filter((o): o is string => typeof o === 'string'),
      checks, slides, ...(sections ? { sections } : {}), ...(typeof d.head === 'string' ? { head: d.head } : {}),
    },
  };
}
