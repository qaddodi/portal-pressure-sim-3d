// What each slide needs from the rest of the 3D app: its dependency list, derived from the slide's own fields (never typed per slide), and the table that says who
// owns each need and whether it has landed. A need whose batch has not landed is a CLAIMED HOOK: the slide is present (its words, steps and shot are here) but not
// wired until the need's `landed()` is true. The parity claims (src/parity/b13a.ts) and tests/decks-ag-needs.test.ts read this, so a batch that lands a feature
// flips its hook here and every slide that waited for it counts as wired in the same push.
import { CHARTS } from '../../ui/charts/registry.ts';
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { LENS_IDS } from '../../scene/lenses/model.ts';
import { CATHS } from '../schema.ts';
import { UI } from '../../ui/strings.generated.ts';
import type { CopiedSlide } from './types.ts';
import { slideShots, type ShotSpec } from './shots.ts';

/** The plan's batch ids (parity-plan.md section 3). 'ENGINE' is the hales-engine host that already runs every model step. */
export type Owner = 'ENGINE' | 'B3' | 'B5' | 'B6' | 'B7' | 'B8' | 'B10' | 'B11' | 'B12' | 'B13a';

export interface Hook {
  owner: Owner;
  /** In words, what the slide waits for. */
  what: string;
  /** True once the thing is built and registered (read from the real registry where one exists). */
  landed: () => boolean;
}

const ready = (): boolean => true;
const claimed = (): boolean => false;

/** The kinds of action the engine host applies (worker-core.js applyAction). */
export const ACTION_KINDS = ['infuse', 'hemorrhage', 'retain', 'band', 'paracentesis', 'valsalva', 'strain', 'rupture', 'stopBleed'] as const;

/** Slide fields that are the slide's words or its identity: the copy carries them and no other batch has to read them. */
const WORDS = new Set(['id', 'kicker', 'title', 'line', 'notes', 'ask']);
/** The model's steps: the engine host runs them (steps.ts). */
const MODEL = new Set(['preset', 'presetDays', 'params', 'days', 'ramp', 'relax', 'action']);
/** The camera: shots.ts turns it into a ShotSpec. */
const CAMERA = new Set(['cam', 'view', 'zone', 'kMax']);
/** Fields that read the table's or the data card's tile row (`data:tiles`). */
const DATA = new Set(['data', 'tiles', 'key', 'delta']);
/** The table visual's own columns and rows (`visual:table`). */
const TABLE = new Set(['cols', 'asc', 'rowHead', 'of', 'vs', 'foot', 'focusRow']);

/** A field of a slide that is none of the above becomes a need of this name, so no field of a 2D slide is dropped without a hook that holds it. */
const FIELD_HOOKS: Record<string, { id: string; owner: Owner; what: string }> = {
  vignette: { id: 'card:vignette', owner: 'B12', what: 'the case card before the slide' },
  terms: { id: 'card:terms', owner: 'B12', what: 'words that point at figure parts' },
  eq: { id: 'card:equation', owner: 'B12', what: 'the equation under the title' },
  site: { id: 'card:site', owner: 'B12', what: 'the site tag and kicker colour' },
  cite: { id: 'card:cite', owner: 'B12', what: 'the source line' },
  whatIf: { id: 'card:what-if', owner: 'B12', what: 'the what-if button' },
  caseQ: { id: 'card:case-question', owner: 'B12', what: 'the case question' },
  question: { id: 'card:question', owner: 'B12', what: 'the question card' },
  note: { id: 'card:note', owner: 'B12', what: 'a note under the data' },
  cohort: { id: 'card:cohort', owner: 'B12', what: 'the cohort line' },
  pill: { id: 'card:pill', owner: 'B12', what: 'the pill of the line' },
  hvpgResp: { id: 'card:response', owner: 'B12', what: 'the beta-blocker response control' },
  response: { id: 'card:response', owner: 'B12', what: 'the beta-blocker response control' },
  steps: { id: 'card:steps', owner: 'B12', what: 'the step markers of the line' },
  chartFoot: { id: 'card:chart-foot', owner: 'B10', what: 'the chart footnote' },
  graph: { id: 'data:graph', owner: 'B10', what: 'the time-lapse graph on the teaching card' },
  plane: { id: 'visual:plane-options', owner: 'B10', what: 'the plane\'s options' },
  span: { id: 'data:spans', owner: 'B10', what: 'the profile\'s brackets' },
  glow: { id: 'fig:glow', owner: 'B6', what: 'the outlines the slide lights' },
  glowSeq: { id: 'fig:glow-steps', owner: 'B6', what: 'the numbered glow steps' },
  lapseGlow: { id: 'fig:glow-steps', owner: 'B6', what: 'the numbered glow steps' },
  mark: { id: 'fig:mark', owner: 'B6', what: 'the ring and callout on the figure' },
  marks: { id: 'fig:mark', owner: 'B6', what: 'the ring and callout on the figure' },
  callout: { id: 'fig:mark', owner: 'B6', what: 'the ring and callout on the figure' },
  labels: { id: 'fig:labels', owner: 'B6', what: 'the station labels' },
  tint: { id: 'fig:labels', owner: 'B6', what: 'the station labels' },
  sites: { id: 'fig:sites', owner: 'B6', what: 'the readings on the figure' },
  stented: { id: 'fig:stented', owner: 'B5', what: 'a stent drawn in a vein' },
  layers: { id: 'fig:layers', owner: 'B8', what: 'the lobule layers the slide turns on' },
  wave: { id: 'fig:wave', owner: 'B11', what: 'the Doppler wave names' },
  strain: { id: 'fig:strain', owner: 'B11', what: 'the strain demonstration' },
};

/** The hook a need id stands for. Families (`tool:<kind>`, `tile:<key>`, …) are resolved here from the registries the other batches keep. */
export function hookOf(id: string): Hook | null {
  const [family, rest = ''] = [id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  switch (family) {
    case 'model':
      if (rest === 'lapse') return { owner: 'B12', what: 'the days played as a time-lapse on the live figure', landed: ready }   // (hp/lapse.ts, 19 Nov);
      if (rest === 'preset') return { owner: 'ENGINE', what: 'the patient loads', landed: () => true };
      if (rest.startsWith('action:')) return { owner: 'ENGINE', what: `the ${rest.slice(7)} action`, landed: () => (ACTION_KINDS as readonly string[]).includes(rest.slice(7)) };
      return { owner: 'ENGINE', what: `the model step "${rest}"`, landed: ready };
    case 'reading': return { owner: 'B12', what: `the "${rest}" reading, worked out by the data card from the slide's own state (not an engine tile)`, landed: claimed };
    case 'tile': return { owner: 'B10', what: `the ${rest} reading`, landed: () => rest in TILE };
    case 'data': return { owner: id === 'data:tiles' ? 'B12' : 'B10', what: id === 'data:tiles' ? 'the data card of tiles' : `the ${rest} of the data card`, landed: id === 'data:tiles' ? ready : claimed };
    case 'tool': return { owner: 'B10', what: `the ${rest} instrument or chart`, landed: () => CHARTS.find((c) => c.kind === rest)?.status === 'done' };
    case 'lens': return { owner: 'B3', what: `the ${rest} colour lens`, landed: () => (LENS_IDS as readonly string[]).includes(rest) };
    case 'cath': return { owner: 'B5', what: `the catheter's ${rest} state`, landed: () => (CATHS as readonly string[]).includes(rest) };
    case 'procedure': return { owner: 'B5', what: `the ${rest} procedure`, landed: claimed };
    case 'view': return { owner: 'B7', what: 'the Circuit view', landed: claimed };
    case 'scale':
      if (rest === 'switch') return { owner: 'B12', what: 'the Anatomy, Lobule and Sinusoid pill the slide offers', landed: ready }   // (ui/cards/SlideControls.tsx);
      return { owner: 'B8', what: `the ${rest} view`, landed: ready };
    case 'visual': return { owner: 'B12', what: `the ${rest} visual over the figure`, landed: rest === 'table' ? ready : claimed }   // (the summary table: ui/cards/TableCard.tsx);
    case 'compare': return { owner: 'B12', what: `the compare buttons (${rest})`, landed: ['own', 'params', 'preset', 'slide', 'lens'].includes(rest) ? ready : claimed }   // (gate and tool buttons move an instrument: the Tests cards);
    case 'present': return { owner: 'B12', what: 'the presenter plays any deck by its id, with the scene plate of each slide', landed: ready }   // (decks/all.ts);
    case 'fig': case 'card': case 'field': {
      const f = Object.values(FIELD_HOOKS).find((h) => h.id === id);
      if (f) return { owner: f.owner, what: f.what, landed: ['card:vignette', 'card:terms', 'card:equation', 'card:what-if', 'card:case-question', 'card:response'].includes(id) ? ready : claimed };
      return family === 'field' ? { owner: 'B12', what: `the slide field "${rest}"`, landed: claimed } : null;
    }
    default: return null;
  }
}

/** The kinds in a compare list: the keys other than the button's label that say what it switches. */
function compareKinds(list: readonly Record<string, unknown>[]): string[] {
  const kinds = new Set<string>();
  for (const c of list) {
    const k = Object.keys(c).filter((x) => !['label', 'short', 'own'].includes(x)).sort().join('+');
    kinds.add(k || 'own');
  }
  return [...kinds];
}

/** Every need of a slide, sorted and unique. */
export function needsOf(s: CopiedSlide): string[] {
  const n = new Set<string>();
  n.add('present:slide-plate');
  // the model
  if (s.preset) n.add('model:preset');
  if (s.params) n.add('model:params');
  if (s.days) n.add('model:days');
  if (s.ramp) n.add('model:ramp');
  if (s.relax) n.add('model:relax');
  if (s.presetDays) n.add('model:presetDays');
  const actions = (Array.isArray(s.action) ? s.action : s.action ? [s.action] : []) as { kind?: string }[];
  for (const a of actions) if (a?.kind) n.add(`model:action:${a.kind}`);
  if (s.lapse) n.add('model:lapse');
  // the data card
  if (s.data === 'tiles' || s.tiles?.length) n.add('data:tiles');
  const tile = (t: string) => n.add(TILE[t] ? `tile:${t}` : `reading:${t}`);
  for (const t of s.tiles ?? []) tile(t);
  for (const t of s.key ?? []) tile(t);
  if (s.tool?.kind) n.add(`tool:${s.tool.kind}`);
  if (s.visual) { n.add(`visual:${s.visual}`); for (const t of s.cols ?? []) tile(t); }
  if (s.compare?.length) for (const k of compareKinds(s.compare)) n.add(`compare:${k}`);
  // the figure
  if (s.lens) n.add(`lens:${s.lens}`);
  if (s.cath) n.add(`cath:${s.cath}`);
  if (s.procedure) n.add(`procedure:${typeof s.procedure === 'string' ? s.procedure : (s.procedure as { kind?: string }).kind ?? 'tips'}`);
  const shots = slideShots(s);
  const kinds = [shots.main, shots.lapse, ...Object.values(shots.scales ?? {})].filter((x): x is ShotSpec => !!x);
  for (const sp of kinds) {
    if (sp.kind === 'circuit') n.add('view:circuit');
    if (sp.kind === 'lobule') n.add(sp.cam === 'sinusoid' ? 'scale:sinusoid' : 'scale:lobule');
  }
  if (s.view === 'circuit') n.add('view:circuit');
  // every other field of the slide holds a hook of its own, so none is dropped
  for (const f of Object.keys(s)) {
    if (WORDS.has(f) || MODEL.has(f) || CAMERA.has(f) || DATA.has(f) || TABLE.has(f) || f === 'lapse' || f === 'tool' || f === 'visual' || f === 'compare' || f === 'lens' || f === 'cath' || f === 'procedure' || f === 'scales') continue;
    n.add(FIELD_HOOKS[f]?.id ?? `field:${f}`);
  }
  if (s.scales) n.add('scale:switch');
  return [...n].sort();
}

/** The need ids that do not have a hook (a typo, or a family nobody owns): a test fails on any. */
export const unknownNeeds = (needs: readonly string[]): string[] => needs.filter((id) => !hookOf(id));

/** What a slide still waits for: its needs whose hooks have not landed, with their owners. */
export function waitingOn(needs: readonly string[]): { id: string; owner: Owner; what: string }[] {
  return needs.flatMap((id) => { const h = hookOf(id); return h && !h.landed() ? [{ id, owner: h.owner, what: h.what }] : []; });
}

/** Preset ids the 2D app has (the patient a slide loads must be one). */
export const PRESET_IDS: ReadonlySet<string> = new Set((UI.presets as readonly { id: string }[]).map((p) => p.id));
