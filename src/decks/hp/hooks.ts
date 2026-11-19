// What a slide needs from the rest of the 3D app, derived from the fields the 2D deck gives it, and who builds it.
//
// A slide of the 2D app can ask for a tool in its data card (Doppler, a chart, a monitor), a visual, a procedure played on the figure, compare
// buttons, a slider, a time-lapse, callouts, a lens, a catheter. Most of those belong to other batches (docs/parity-plan.md). This file does not build
// them: it names each one a slide uses as a FEATURE with its owner batch, says whether it has landed, and gives every slide its list of needs. A slide is
// PRESENT when its words, numbers and shot are here; it is WIRED when every feature it needs has landed. A later batch lands a feature by making
// `landed` say so (a test holds each landing to a file that exists), and the score on the ?parity page moves by itself.
//
// Rule for this table: a feature is listed once, with ONE owner. A slide that needs a feature nobody owns fails the test, so none is forgotten.
import { CHARTS } from '../../ui/charts/registry.ts';
import { STATIONS, TERM_STATIONS } from '../../scene/labels/stations.ts';
import { LENS_IDS, SINCE_BASELINE_FED } from '../../scene/lenses/model.ts';
import type { CopiedSlide } from './types.ts';

export interface Feature {
  id: string;
  /** The batch of docs/parity-plan.md that builds it. */
  batch: string;
  /** In words: what the 3D app must do for the slide. */
  what: string;
  /** True once it works in the app (not once it is planned). */
  landed: boolean;
  /** For a landing: a file of this repo that holds it (a test fails a landed feature whose file is missing). */
  evidence?: string;
}

const chartDone = (kind: string) => CHARTS.some((c) => c.kind === kind && c.status === 'done');
const hook = (id: string, batch: string, what: string): Feature => ({ id, batch, what, landed: false });
const done = (id: string, batch: string, what: string, evidence: string): Feature => ({ id, batch, what, landed: true, evidence });

/** A chart look of batch B10: landed when the chart registry says it is done. */
const chart = (kind: string, what: string): Feature => ({ id: `tool:${kind}`, batch: 'B10', what, landed: chartDone(kind), evidence: chartDone(kind) ? 'src/ui/charts/registry.ts' : undefined });

const TABLE: Feature[] = [
  // the words and the figure of the slice (already here)
  done('words', 'S3', 'The teaching card: kicker, title, line, equation, ask, terms', 'src/ui/cards/TeachingCard.tsx'),
  done('case', 'S3', 'The case card before the slide', 'src/ui/cards/CaseCard.tsx'),
  done('shot', 'S2', 'The camera flies to the slide\'s shot, fitted into the room the cards leave', 'src/scene/camera/rig.ts'),
  done('lobule-camera', 'B8', 'The lobule and sinusoid views and their camera shots', 'src/scene/lobule/shots.ts'),
  done('wash', 'B8', 'The wedge\'s amber wash along the sinusoid', 'src/scene/lobule/wash.ts'),
  done('lens', 'B3', 'The vessel colour lenses', 'src/scene/lenses/model.ts'),
  done('stations', 'B6', 'Station labels on the figure', 'src/scene/labels/stations.ts'),
  done('cath:route', 'S2', 'The HVPG catheter: route', 'src/scene/catheter.ts'), done('cath:free', 'S2', 'The HVPG catheter: free', 'src/scene/catheter.ts'),
  done('cath:wedge', 'S2', 'The HVPG catheter: wedged', 'src/scene/catheter.ts'), done('cath:result', 'S2', 'The HVPG catheter: result', 'src/scene/catheter.ts'),
  hook('cath:blocked', 'B5', 'The HVPG catheter against a blocked hepatic vein (Budd–Chiari)'),
  done('tiles', 'B13b', 'The data card of tiles: each reading from the engine, the key ones marked, the change from another state', 'src/decks/hp/TilesCard.tsx'),
  // charts and instruments in the data card
  chart('criteria', 'Guideline rule list with live rows, or the Baveno VIII zones graph'),
  chart('flowtime', 'Lines over days'), chart('trial', 'A trial card'), chart('flows', 'Where the portal blood goes'), chart('lumen', 'A vessel cross-section'),
  chart('forest', 'Forest plot of trials'), chart('profile', 'Pressure profile, gut to heart'), chart('path', 'Guideline path map'), chart('curve', 'One quantity against another'),
  chart('plane', 'Two-quantity plane with zones'), chart('shift', 'Change from healthy'), chart('trace', 'The course on one chart'), chart('evgraph', 'Event graph'),
  hook('tool:doppler', 'B11', 'The Doppler spectrum with its probe on the figure'),
  hook('tool:fibroscan', 'B11', 'FibroScan reading with the probe on the figure'),
  hook('tool:hvpg', 'B11', 'The HVPG monitor tracing'),
  done('tool:vitals', 'B11', 'The bedside monitor: EKG strip over heart rate, pressure, output, hemoglobin', 'src/ui/charts/vitals/VitalsCard.tsx'),
  hook('tool:abdomen', 'B11', 'The abdomen picture: ascites and the pressure inside'),
  hook('tool:wall', 'B11', 'The varix wall in cross-section'),
  hook('tool:reading', 'B11', 'A readout list with a Why? for each'),
  { id: 'tool:course', batch: 'B10', what: 'A course over days', landed: chartDone('curve'), evidence: chartDone('curve') ? 'src/ui/charts/curve/CurveCard.tsx' : undefined },
  done('visual:table', 'B12', 'The summary table over the dimmed figure', 'src/ui/cards/TableCard.tsx'),
  { id: 'visual:plane', batch: 'B10', what: 'A plane over the dimmed figure', landed: chartDone('plane'), evidence: chartDone('plane') ? 'src/ui/charts/plane/PlaneCard.tsx' : undefined },
  // the figure
  hook('procedure:eus', 'B11', 'EUS-PPG: the echoendoscope and needle on the figure'),
  hook('procedure:rex', 'B5', 'The Meso-Rex graft growing along its path'),
  hook('mark', 'B6', 'A ring and a callout on a vessel of the figure'),
  hook('callout', 'B6', 'A callout with a leader to a place in the lobule'),
  hook('glow', 'B3', 'Parts of the figure glow while the slide is up'),
  hook('ripple', 'B3', 'Pulse ripples along the vessels'),
  hook('calipers', 'B11', 'Calipers on a varix or the spleen'),
  hook('layers:zones', 'B8', 'The lobule\'s zone bands'),
  done('scales', 'B12', 'The Anatomy / Lobule / Sinusoid scale switch on the slide', 'src/ui/cards/SlideControls.tsx'),
  hook('view:circuit', 'B7', 'The Circuit view'),
  // what the person can do on the slide
  done('compare', 'B12', 'Compare buttons that switch the live model between states', 'src/ui/talk/controls-run.ts'),
  done('whatIf', 'B12', 'A slider that drags one parameter of the live model', 'src/ui/cards/SlideControls.tsx'),
  done('response', 'B12', 'The beta-blocker response buttons', 'src/decks/controls.ts'),
  done('time-lapse', 'B12', 'The slide\'s days play on the live figure as a time-lapse', 'src/decks/hp/lapse.ts'),
  hook('beats', 'B12', 'A slide with several camera beats'),
  { id: 'since', batch: 'B3', what: 'The Since lens: change since another slide\'s state', landed: SINCE_BASELINE_FED, evidence: SINCE_BASELINE_FED ? 'src/scene/lenses/field.ts' : undefined },
];

export const FEATURES: ReadonlyMap<string, Feature> = new Map(TABLE.map((f) => [f.id, f]));
export const BATCH_OF_FEATURE = (id: string) => FEATURES.get(id)?.batch ?? null;

/** Stations the 3D labels know now; a slide that names another has a hook for it (batch B6 adds stations as decks come over). */
const STATION_IDS = new Set(STATIONS.map((s) => s.id));

const toolKind = (t: CopiedSlide['tool']) => (t && typeof t.kind === 'string' ? t.kind : null);
const asList = <T,>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Every feature a slide needs, in a stable order, as ids of FEATURES (an unknown one is added to the table by its owner, and a test fails until it is). */
export function needsOf(s: CopiedSlide): string[] {
  const need = new Set<string>(['words', 'shot']);
  if (s.vignette || s.question) need.add('case');
  if (s.data === 'tiles' && s.tiles?.length) need.add('tiles');
  const tk = toolKind(s.tool);
  if (tk) need.add(`tool:${tk}`);
  if (s.visual && s.visual !== 'outline' && s.visual !== 'check') need.add(`visual:${s.visual}`);
  for (const p of asList(s.procedure)) need.add(`procedure:${typeof p === 'string' ? p : (p as { kind: string }).kind}`);
  if (s.cath) need.add(`cath:${s.cath}`);
  if (s.lens) need.add(s.lens === 'since' ? 'since' : 'lens');
  if (s.mark) need.add('mark');
  if (s.callout) need.add('callout');
  if (s.glow) need.add('glow');
  if (s.ripple) need.add('ripple');
  if (s.calipers) need.add('calipers');
  if (s.wash) need.add('wash');
  if (Array.isArray(s.layers) && s.layers.includes('zones')) need.add('layers:zones');
  if (s.scales) need.add('scales');
  if (s.view === 'circuit') need.add('view:circuit');
  if (s.compare?.length) need.add('compare');
  if (s.whatIf) need.add('whatIf');
  if (s.response) need.add('response');
  if (s.lapse || s.ramp) need.add('time-lapse');
  if (s.beats) need.add('beats');
  if (typeof s.cam === 'string' && /^(lobule|sinusoid)/.test(s.cam)) need.add('lobule-camera');
  if (s.labels?.length) need.add('stations');
  return [...need];
}

/** Stations a slide's `labels` name that the 3D figure cannot label yet, and terms its words point at that no figure part answers yet (batch B6's tables). */
export function missingStations(s: CopiedSlide): string[] { return (s.labels ?? []).filter((id) => !STATION_IDS.has(id)); }
export function missingTerms(s: CopiedSlide): string[] {
  const t = s.terms;
  const parts = !t ? [] : Array.isArray(t) ? t : Object.values(t);
  return parts.filter((t) => !(t in TERM_STATIONS) && !/^(lobule|sinusoid):/.test(t));
}

export interface Readiness { present: boolean; wired: boolean; needs: Feature[]; open: Feature[] }
export function readiness(s: CopiedSlide): Readiness {
  const needs = needsOf(s).map((id) => FEATURES.get(id)).filter((f): f is Feature => !!f);
  const open = needs.filter((f) => !f.landed);
  const gaps = missingStations(s).length + missingTerms(s).length;
  return { present: true, wired: open.length === 0 && gaps === 0, needs, open };
}

/** The lens ids a slide may ask for (the 2D names; the scene has all but a few). */
export const knownLens = (id: string) => (LENS_IDS as readonly string[]).includes(id);
