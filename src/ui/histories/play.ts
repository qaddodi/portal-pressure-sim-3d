// Plays a course (courses.ts) on the real engine, day by day, the way the page would have recorded it: the same SampleFeed notes each day (so the days list is the page's own, steps and
// all), the same Treat words label each change (activeInterventions, removedLabel), the same words name each action (actionLabel). Node only (the generator and its test); the page
// never imports it: the page loads what this made (baked/*.generated.ts).
import { Engine } from '../../engine/hales/portal/engine.js';
import { computeMetrics } from '../../engine/hales/portal/metrics.js';
import { detectEvents } from '../../engine/hales/portal/events.js';
import { deepMerge, PRESETS } from '../../engine/hales/portal/scenario.js';
import { SampleFeed } from '../tests/feed.ts';
import { activeInterventions } from '../action/changes.ts';
import type { Params } from '../action/params.ts';
import { actionLabel } from '../action/action-label.ts';
import { removedLabel } from '../timeline/removed-label.ts';
import { storyOf } from './courses.ts';
import { isKeyEntry } from '../timeline/story.ts';
import { stateOf, lengthWords } from './state-words.ts';
import type { Baked, Course, DaySample, EntryOut, HistoryMeta, Now, Snap, Step, Tone } from './types.ts';

/** The same event again within this many days is one line (the page's own rule is 30 seconds of page time, which is days of model time here; a critical one always counts). */
const REPEAT_DAYS = 60;
/** A patient who comes with a disease already settled (a preset with days behind it) has no news in its first days: what the model raises then is the detectors finding the state, not an event. */
const SETTLING_DAYS = 3;
/** The model's own minute after a rupture, stepped (the bleed's hemodynamics are time, not days). */
const BLEED_SECONDS = 60;
const TREATMENTS = (k: string): boolean => k.startsWith('drug:') || k === 'diuretics' || k === 'anticoag';

const nest = (key: string, v: number): Record<string, unknown> => key.split('.').reduceRight<unknown>((acc, k) => ({ [k]: acc }), v) as Record<string, unknown>;
const labelsOf = (p: Params): Map<string, string> => new Map(activeInterventions(p).map((c) => [c.key, c.label]));
const round = (v: number, d = 3): number => +v.toFixed(d);
const isQuiet = (quiet: readonly string[], key: string): boolean => quiet.some((q) => key === q || key.startsWith(q));

/** the metrics the course reads (the engine's record, loosely) */
interface M { hvpg: number; ppg: number; pv?: number; ascites: { volume: number }; shuntFraction: number }
/** The engine as the course drives it (the engine is JavaScript: its typed host protocol lives in the worker, and the course calls the same methods the worker's actions do). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Eng = any;

export function playCourse(c: Course): Baked {
  const e = new Engine() as Eng;
  e.loadPreset(c.preset);
  if (c.init) { e.setParams(deepMerge(e.params, c.init)); e.settle(); }
  const settled = ((PRESETS as { id: string; days?: number }[]).find((p) => p.id === c.preset)?.days ?? 0) > 0;
  const feed = new SampleFeed(), entries: EntryOut[] = [];
  const lastEv = new Map<string, number>();
  const moments = new Map<number, Snap>();
  let baseline = labelsOf(e.params);
  const note = () => {
    const m = computeMetrics(e);
    feed.adopt({ jump: false, clock: 'disease', day: e.day, metrics: m as Record<string, unknown>, params: e.params, bands: e.bands, Pf: e.Pf ?? e.P }, 0);
  };
  const drain = () => {
    for (const ev of e.newEvents.splice(0)) {
      if (settled && ev.day < (c.settle ?? SETTLING_DAYS)) continue;
      const was = lastEv.get(ev.id);
      if (was != null && e.day - was < REPEAT_DAYS && ev.severity !== 'critical') continue;
      lastEv.set(ev.id, e.day);
      entries.push({ kind: 'event', label: ev.title, day: ev.day, t: round(ev.t, 2), ...(ev.detail ? { detail: ev.detail } : {}), sev: ev.severity, evId: ev.id });
    }
  };
  /** the model's clock a little on (the page's frames run between days), so a condition that holds is raised: events need model time to hold (events.js HOLD_S) */
  const watch = (steps: number, dt: number, every = 1, quiet = false) => {
    const was = e.quiet; e.quiet = quiet;
    for (let i = 0; i < steps; i++) { e.step(dt); if (i % every === 0) detectEvents(e); }
    e.quiet = was; drain();
  };

  entries.push({ kind: 'start', label: c.name, day: 0, t: round(e.t, 2), params: structuredClone(e.params) });
  note();

  /** Treat's own words for what a step changed, as Timeline.flush words it (what is on that was not, and what is off that was), without what the disease itself moved */
  const change = (s: Step) => {
    const after = labelsOf(e.params), parts: string[] = [], keys: string[] = [];
    for (const [k, l] of after) if (baseline.get(k) !== l && !isQuiet(c.quiet, k)) { parts.push(l); keys.push(k); }
    for (const [k, l] of baseline) if (!after.has(k) && !isQuiet(c.quiet, k)) parts.push(removedLabel(k, l));
    baseline = after;
    const label = s.label ?? (parts.length ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3} more` : '') : 'Change');
    entries.push({ kind: 'change', label, day: e.day, t: round(e.t, 2), ...(s.detail ? { detail: s.detail } : {}), keys, ...(s.id ? { step: s.id } : {}), params: structuredClone(e.params) });
  };
  const act = (s: Step) => {
    if (s.act === 'bleed') { e.rupture(s.site ?? 'VAR', 0.6); watch(BLEED_SECONDS * 10, 0.1, 5); const r = entries.find((x) => x.evId === 'VARIX_RUPTURE' && x.day === e.day); if (r && s.id) r.step = s.id; return; }
    const a = s.act === 'band' ? { kind: 'band' } : { kind: 'paracentesis', mL: Math.floor(e.slow.ascites / 100) * 100, albumin: true };
    if (a.kind === 'band') e.band(); else { e.paracentesis(a.mL as number, true); feed.markStep(); }   // (a tap is a step of the record, as on the page: send.ts STEPS)
    drain();
    entries.push({ kind: 'change', label: actionLabel(a), day: e.day, t: round(e.t, 2), action: true, ...(s.id ? { step: s.id } : {}), ...(s.detail ? { detail: s.detail } : {}) });
    baseline = labelsOf(e.params);   // (the albumin the tap gave is not a change anyone made)
  };

  for (let d = 0; d < c.days; d++) {
    for (const r of c.ramps ?? []) if (d >= r.from && d <= r.to) e.setParams(deepMerge(e.params, nest(r.key, r.a + (r.b - r.a) * (d - r.from) / Math.max(1, r.to - r.from))));
    for (const s of c.steps.filter((x) => x.day === d)) {
      if (s.act) act(s);
      if (s.set) { e.setParams(deepMerge(e.params, s.set)); e.settle(); change(s); }
      if (s.note) entries.push({ kind: 'event', label: s.note.title, day: e.day, t: round(e.t, 2), detail: s.note.detail, sev: s.note.sev, evId: 'COURSE_' + (s.id ?? 'NOTE'), ...(s.id ? { step: s.id } : {}) });
      note();   // (the same day again: a change is a step in the days list)
    }
    // (A day the story headlines keeps the model as it was at the day's end, after all of its steps, so "Show on the figure" can go back to it: a bleed's day is after the band.)
    if (entries.some((x) => x.day === e.day && isKeyEntry(x))) moments.set(e.day, e.snapshot());
    e.advanceDays(1, { noRupture: true, silent: true });
    watch(4, 0.1, 1, !!c.still);
    note();
  }

  const m = computeMetrics(e) as M, p = e.params, lab = labelsOf(p);
  const meds = [...lab].filter(([k]) => TREATMENTS(k)).map(([, l]) => l);
  const sg = p.stentGeom?.TIPS;
  const thr = Object.values(p.thrombus as Record<string, number>);
  const now: Now = {
    day: e.day, hvpg: round(m.hvpg, 2), ppg: round(m.ppg, 2), pv: round(m.pv ?? 0, 2), ascitesL: round(m.ascites.volume / 1000, 2), shunt: round(m.shuntFraction, 3),
    tipsMm: p.tips?.on ? p.tips.d : null, stentCm: p.tips?.on ? sg?.len ?? 8 : null, clot: thr.length ? round(Math.max(...thr), 3) : null, meds,
  };
  // the last change carries today's snapshot, so Undo can come back to today from an earlier moment (entry snapshots are the model's own)
  const days: DaySample[] = feed.days.map((d) => ({ day: d.day, v: Object.fromEntries(Object.entries(d.v).map(([k, v]) => [k, round(v)])), ...(d.start ? { start: true } : {}) }));
  entries.sort((a, b) => a.day * 86400 + a.t - (b.day * 86400 + b.t));
  // (each moment goes on the last line of its day: the model then is the day's end, so the lines before it on that day are its past, not its future)
  for (const [day, snap] of moments) { const i = entries.findLastIndex((x) => x.day === day); if (i >= 0) entries[i]!.snap = snap; }
  return { id: c.id, days, entries, snap: e.snapshot(), now };
}

/** What the menu keeps eagerly of a baked history (the row, and the little course in its card). */
export function metaOf(c: Course, b: Baked): HistoryMeta {
  const step = Math.max(1, Math.round(b.days.length / 40));
  const pv = b.days.filter((_, i) => i % step === 0 || i === b.days.length - 1).map((d) => round(d.v.CONF ?? 0, 1));
  const tone = (sev?: string): Tone => (sev === 'ok' ? 'ok' : sev === 'caution' ? 'caution' : sev === 'danger' || sev === 'critical' ? 'danger' : 'info');
  // (the story's own days, named: what the little chart marks are the course's steps, in their own words)
  const marks: HistoryMeta['marks'] = [];
  for (const e of b.entries) {
    const word = e.step ? MARK_WORD[e.step] : undefined;
    if (word) marks.push({ day: e.day, word, tone: e.kind === 'change' ? 'change' : tone(e.sev) });
  }
  return {
    id: c.id, name: c.name, group: c.group, where: c.where, preset: c.preset, months: Math.round(c.days / 30.4), state: stateOf(b.now, c.state), story: storyOf(c), path: c.path,
    pv, days: c.days, max: Math.max(12, Math.ceil(Math.max(...pv) / 4) * 4), marks: marks.sort((a, z) => a.day - z.day), chapters: chaptersOf(c),
    counts: { events: b.entries.filter((x) => x.kind === 'event').length, medicines: medCount(b) },
  };
}
/** A course's chapters as days: each anchor is a step's day or a ramp's start. An anchor that names nothing is an error (the generator stops), never a chapter at a guessed day. */
export function chaptersOf(c: Course): { from: number; label: string }[] {
  return c.chapters.map((ch, i) => {
    if (!ch.at) { if (i) throw new Error(`${c.id}: chapter "${ch.label}" has no anchor`); return { from: 0, label: ch.label }; }
    const at = ch.at;
    const day = typeof at === 'string' ? c.steps.find((s) => s.id === at)?.day : c.ramps?.find((r) => r.key === at.ramp)?.from;
    if (day == null) throw new Error(`${c.id}: chapter "${ch.label}" is anchored to ${JSON.stringify(at)}, which the course does not have`);
    return { from: day, label: ch.label };
  });
}
const MARK_WORD: Record<string, string> = {
  carvedilol: 'Carvedilol', bleed: 'Bled', band: 'Banded', tips: 'TIPS', tap1: 'Tap', tap2: 'Tap', tap3: 'Tap', anticoag: 'Anticoagulation', angioplasty: 'Angioplasty', doppler: 'Doppler',
  daa: 'Antiviral', svr: 'Cured', abstain: 'Abstinent', diurOff: 'Diuretics off', recomp: 'Recompensated', brto: 'BRTO', preg: 'Pregnant', prop: 'Propranolol', delivery: 'Delivery',
  hf: 'Heart treated', confusion: 'Confusion',
};
/** how many different medicines the history ran (Treat's drugs, diuretics, anticoagulation): the card's "3 medicines" */
const medCount = (b: Baked): number => {
  const keys = new Set<string>();
  for (const x of b.entries) if (x.params) for (const [k] of labelsOf(x.params)) if (TREATMENTS(k)) keys.add(k);
  return keys.size;
};
export { lengthWords };
