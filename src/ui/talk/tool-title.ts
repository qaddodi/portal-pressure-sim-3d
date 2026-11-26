// The data card's heading, as the 2D presenter words it (presenter-question.js cardTitle, presenter-tools.js `title`/`short`): the slide's own `dataTitle`, else its instrument's title
// (the tool's own `title`, else the kind's: the built-in kinds' table is copied whole, tool-titles.generated.js; the kinds a deck visuals package registers (ext-charts, ext-teaching, ext-model,
// ext-instruments, ext-stent, ext-panels) have the same words here, each held to the 2D file by tests/data-card-head.test.ts), else "The patient". A phone's card takes the short form of a long title.
import { lcFirst } from '../../engine/hales/portal/lc-first.js';
import { TITLE, SHORT_TITLE } from './tool-titles.generated.js';
import { titleParts } from './title-units.generated.js';
import { PATHS, knownOf } from '../charts/path/model.ts';
import { trialOf } from '../charts/trial/model.ts';
import { curveLines, lineMeta, axisMeta } from '../charts/curve/curve-pure.generated.js';
import { courseOf } from '../charts/curve/course-pure.generated.js';
import { lumenName } from '../charts/lumen/model.ts';
import { stentTitle } from '../charts/stent/model.ts';
import { toolPlane, planeTitle } from '../charts/plane/model.ts';
import { readingTitle } from '../tests/ir/copied/reading-scripts.copied.js';

type T = Record<string, any>;
type S = Record<string, any> | null | undefined;
const lc = lcFirst as (s: string) => string;
// ext-model.js: a chart whose lines are different readings of one kind goes by the slide's `reading`
const names = (t: T): string[] => (typeof t.reading === 'string' && t.reading ? [t.reading] : (curveLines(t) as string[]).map((k, j) => (j ? lc(lineMeta(k).name) : lineMeta(k).name)));

/** The deck-visuals packages' instruments: { title(t, slide), short(t) } (the 2D files' own words). */
const EXT: Record<string, { title: (t: T, s?: S) => string; short: (t: T) => string }> = {
  profile: { title: () => 'Pressure, gut to heart, mmHg', short: () => 'Gut to heart' },                                                                       // ext-charts.js
  shift: { title: () => 'Change from healthy', short: () => 'From healthy' },
  menu: { title: () => 'Every treatment option in this case', short: () => 'Treatment menu' },
  flows: { title: (t) => (t.of === 'inflow' ? 'Hepatic inflow' : 'Where portal blood goes, % of portal flow'), short: (t) => (t.of === 'inflow' ? 'Hepatic inflow' : 'Portal flow') },
  lumen: { title: (t) => `The ${lumenName(t.vessel || 'PV_TRUNK')}, in cross-section`, short: () => 'Cross-section' },                                     // ext-instruments.js
  fluid: { title: (t) => (t?.window ? 'Fluid balance' : 'Fluid balance: lymph formation and drainage'), short: () => 'Fluid balance' },
  stent: { title: (t) => stentTitle(t), short: (t) => (Array.isArray(t?.show) && !t.show.includes('lumen') ? 'Pressure loss' : 'Stent') },              // ext-stent.js
  path: { title: (t) => t?.title || (PATHS as any)[knownOf(t?.of)].label, short: (t) => t?.short || (PATHS as any)[knownOf(t?.of)].short },             // ext-teaching.js
  trial: { title: (t) => trialOf(t?.id)?.name || 'Trial', short: (t) => trialOf(t?.id)?.name || 'Trial' },
  saag: { title: (t) => t?.title || 'SAAG and ascitic protein', short: (t) => t?.short || 'SAAG' },
  forest: { title: (t) => t?.title || 'The trials on one scale', short: (t) => t?.short || 'Trials' },
  reading: { title: (t, s) => t?.title || readingTitle(s?.procedure ?? t?.of), short: (t) => t?.short || 'Tracing' },
  criteria: { title: (t) => t?.title || 'Criteria', short: (t) => t?.title || 'Criteria' },
  curve: { title: (t) => `${names(t).join(' and ')} by ${lc(axisMeta(t).name)}`, short: (t) => `${names(t).join(' and ')} by ${lc(axisMeta(t).name)}` },   // ext-model.js (2D's short form was "By <axis>", which named no reading: "By portal vein thrombus" read as a clipped title, 23 Nov review; a phone wraps the whole title)
  course: { title: (t) => courseOf(t).words.title, short: (t) => courseOf(t).words.short },
  plane: { title: (t) => planeTitle(toolPlane(t)), short: () => 'Two readings' },                                                                          // ext-panels.js
};
export const EXT_TITLE_KINDS = Object.keys(EXT);
const BUILT_IN = TITLE as Record<string, (t: T) => string>;

/** The tool's heading (2D tools.title): its own `title`, the kind's, or nothing. */
export const toolTitle = (t: T, s?: S): string => t.title || BUILT_IN[t.kind]?.(t) || EXT[t.kind]?.title(t, s) || '';
/** A registered instrument's short title for a phone's card, when the card shows its own title in full (2D tools.short); the built-in kinds have none. */
export const toolShort = (t: T, full: string, s?: S): string | null => (t && !BUILT_IN[t.kind] && EXT[t.kind] && full === EXT[t.kind]!.title(t, s) ? EXT[t.kind]!.short(t) : null);

/** The data card's title for a slide (2D cardTitle); `small`: a phone, or a phone on its side. */
export function cardTitle(s: S, small: boolean): string {
  const full: string = s?.dataTitle || (s?.tool ? toolTitle(s.tool, s) : 'The patient');
  const t = small && full.length > 20
    ? (SHORT_TITLE as Record<string, string>)[full] || (s?.tool && toolShort(s.tool, full, s)) || full.replace(/ over the (days|year|talk)$/, '').replace(/,.*$/, '')
    : full;
  return t.replace(/-/g, '‑');
}
/** A title cut at its units ('Fluid balance · mL/day' → [words, unit, words]): the odd entries are units, each for a `.pz-unit` span (2D unitSpans). */
const parts2d = titleParts as (text: string) => string[];
/** A word that keeps its own case in a title set in capitals: a lower-case letter, then capitals ("cACLD"; "FIRST VISIT WITH CACLD" printed the c as a capital, capture 3531bdfa 28.8). */
const MIXED_CASE = /(\b[a-z]+[A-Z]{2,}\b)/;
/** A title cut at its units and its mixed-case acronyms: the odd entries keep their case (a `.pz-unit` span each), so the capitals the card sets its title in never change an acronym's own letters. */
export const titleUnits = (text: string): string[] => parts2d(text).flatMap((p, i) => (i % 2 ? [p] : p.split(MIXED_CASE)));
