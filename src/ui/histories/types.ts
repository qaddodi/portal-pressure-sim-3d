// The shapes of a model patient's history (the Histories tab). A course is the script the generator plays on the real engine (courses.ts); what comes out is baked (baked/*.generated.ts):
// the day-by-day record the timeline chart draws, History's entries, and the model's state today (a snapshot the worker restores). Plain data: no engine, no page.
import type { CaseRamp, CaseStopBaked, CaseStopIn } from '../case/types.ts';

/** What one scripted step does on its day (the engine is driven exactly as the page's buttons drive it). */
export interface Step {
  day: number;
  /** a name the course's story and the generator's checks give this step's day by */
  id?: string;
  /** parameters merged into the patient's (the treatment panel's change) */
  set?: Record<string, unknown>;
  /** an engine action: a bleed (the model's own rupture, run for a minute), a band, a large-volume paracentesis with albumin (all the fluid there is, to 0.1 L) */
  act?: 'bleed' | 'band' | 'paracentesis';
  /** The step that stops a bleed under way: hemostasis. A band stops an esophageal bleed by itself (the engine's band); a gastric varix has no band, so a step says it (the vasoactive drug's
   *  control, a BRTO). The generator stops when a bleed runs on past BLEED_END_DAYS with none. */
  stopsBleed?: true | string;   // (a string is the days list's words for it: "Bleeding controlled by EUS coils and glue")
  /** where a bleed comes from: the esophageal varices (the default) or a gastric varix */
  site?: 'VAR' | 'GV';
  /** History's words for the step, when the change's own labels would not say it (an angioplasty is a thrombus put away) */
  label?: string;
  detail?: string;
  /** a line the course adds that the model does not raise (a Doppler follow-up): shown as an event */
  note?: { title: string; detail: string; sev: 'ok' | 'caution' | 'danger' | 'info' };
}

export interface Course {
  id: string;
  name: string;
  /** the name on a phone's top pill (two lines of 15 characters at most), only when the full name is longer than that;
   *  without it the name itself is shown (tests/pill-name.test.ts holds every history to it) */
  short?: string;
  /** the menu's group and the words beside it */
  group: string; where: string;
  /** the engine preset the patient starts from (day 0) */
  preset: string;
  days: number;
  /** parameters merged in before day 0 */
  init?: Record<string, unknown>;
  /** the disease moving by itself (not a change anyone made): `key` eased from a to b over days from..to; not a History line */
  ramps?: { key: string; from: number; to: number; a: number; b: number }[];
  /** Treat's change keys (prefixes) that are the disease or its result, not something done: left out of the History lines */
  quiet: string[];
  /** days at the start in which the model's detectors are still finding the state the patient came with (a patient who starts with ascites is not "forming" it): their lines are left out. Default 3. */
  settle?: number;
  /** the day's look at the model (to raise its events) is taken with the breath and the pulse held still, as a settled day is. The live steps carry them, and four of them a day move the fluid by litres over months (the model's
   *  mean pressures differ from its settled ones): a course whose fluid must follow only the disease and the treatments (a patient who recompensates) sets this; the courses that rely on the fluid coming back do not. */
  still?: boolean;
  steps: Step[];
  /** the story's chapters (docs/approved/timeline-story.md): the first from Day 0, each other from the day of the step it names (`at`, a step's id) or the start of a ramp (`{ ramp }`, its key).
   *  Anchored to the course, never to a day the engine raised something on, so a rebake cannot slide a chapter. */
  chapters: { at?: string | { ramp: string }; label: string }[];
  /** the story: {id} is the day of the step with that id */
  story: string;
  /** the course in a few words, for the row's tip */
  path: string;
  /** what the row's second line says about the patient today, in order */
  state: ('tips' | 'hvpg' | 'ppg' | 'meds' | 'ascites' | 'clot')[];
  /** playing the case (ui/case): the stops whose default shot is not right, or that are dropped (every key moment is a stop by default) */
  play?: { stops?: CaseStopIn[] };
}

export interface DaySample { day: number; v: Record<string, number>; start?: boolean }
export interface EntryOut {
  kind: 'start' | 'change' | 'event';
  label: string; day: number; t: number;
  detail?: string; sev?: string; evId?: string; keys?: string[]; action?: boolean;
  /** the course step that made this entry (the little chart's marks are the steps) */
  step?: string;
  /** the patient's settings after this entry (a start and a change; the chart's medicine bars read them) */
  params?: unknown;
  /** the model at the end of this entry's day, on the last line of a day the story headlines (timeline/story.ts isKeyEntry): "Show on the figure" restores it */
  snap?: Snap;
}
/** What the worker's restore takes (the engine's snapshot): opaque but for the clock and the settings. */
export interface Snap { t: number; day: number; params: unknown; [k: string]: unknown }
/** The model's state today, in numbers the rows and the card word. */
export interface Now {
  day: number; hvpg: number; ppg: number; pv: number; ascitesL: number; shunt: number;
  tipsMm: number | null; stentCm: number | null; clot: number | null;
  /** the treatments running today, as Treat words ("Carvedilol", "Anticoagulation", "Diuretics") */
  meds: string[];
}
export interface Baked { id: string; days: DaySample[]; entries: EntryOut[]; snap: Snap; now: Now }

export type Tone = 'ok' | 'caution' | 'danger' | 'info';
/** a piece of the row's second line */
export interface Seg { text: string; tone?: 'danger' | 'caution' | 'ok' }
/** What the menu needs before a history is loaded: the row, and the folded-open card with its small chart. */
export interface HistoryMeta {
  id: string; name: string; short?: string; group: string; where: string;
  /** the preset the patient started from (a shared link carries the settings on it) */
  preset: string;
  months: number; state: Seg[]; story: string; path: string;
  /** the portal vein pressure along the course, one value in about three days, and the lines the story draws on it (day, word, tone) */
  pv: number[]; days: number; max: number;
  marks: { day: number; word: string; tone: Tone | 'change' }[];
  /** the story's chapters, each from the day of the step or ramp it is anchored to (timeline/story.ts) */
  chapters?: { from: number; label: string }[];
  /** playing the case: the course's ramps (the disease between stops) and its own stops, anchored to their days */
  play?: { ramps?: CaseRamp[]; stops?: CaseStopBaked[] };
  counts: { events: number; medicines: number };
}
