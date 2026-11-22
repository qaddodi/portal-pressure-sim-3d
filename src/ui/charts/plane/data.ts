// The plane's inputs from the 3D engine (2D: ext-panels.js rowsFp, visual-plane.js trailFrom). A summary's points are the slide's `of`: a slide id, { id, name }, or { preset, params?, days?,
// presetDays?, name } for a patient no slide shows, each with an optional `from` (where the patient started: a slide id or the same kind of patient); a slide's reading is its state's fingerprint
// (fpOf), a patient is worked out once in the engine's worker ('sequence', the same message the 2D presenter's ctx.run sends) and kept for the talk.
import type { EngineClient } from '../../../engine/client.ts';
import type { Fp, PlanePoint, Stop } from './model.ts';
import { bakedPatient } from '../baked/store.ts';

export interface PatientSpec { preset: string; params?: unknown; days?: number; presetDays?: number }
export interface RowSpec extends Partial<PatientSpec> { id?: string; name?: string; title?: string; short?: string; site?: string; from?: string | RowSpec }
/** A slide, as far as a plane reads it: its id, its title and its site. */
export interface SlideLike { id?: string; title?: string; site?: string }
export interface PlaneRow { x: RowSpec; name: string; short: string; site: string | undefined; f: Fp | null; from: Fp | null; fx: RowSpec | null }

const specOf = (o: unknown): RowSpec | null => (typeof o === 'string' ? { id: o } : o && typeof o === 'object' ? (o as RowSpec) : null);
/** A plane's rows from the slide's `of` (2D rowsFp, before any reading is in): name, short name and site from the row, else from the slide it names. */
export function planeRows(of: readonly unknown[] | null | undefined, slides: readonly SlideLike[] = []): PlaneRow[] {
  const out: PlaneRow[] = [];
  for (const o of Array.isArray(of) ? of : []) {
    const x = specOf(o);
    if (!x) continue;
    const sl = x.id ? slides.find((s) => s.id === x.id) : undefined;
    out.push({ x, name: x.name || x.title || sl?.title || '', short: x.short || '', site: x.site ?? sl?.site, f: null, from: null, fx: x.from ? specOf(x.from) : null });
  }
  return out;
}
/** The patient a spec names, as the engine's sequence takes it. The same patient asked twice is the same key. */
export const patientKey = (o: RowSpec) => JSON.stringify([o.preset, o.params ?? null, o.days ?? null, o.presetDays ?? null]);

const patients = new Map<string, Promise<Fp | null>>();
/** A patient's fingerprint, worked out once in the engine's worker and kept (2D: the presenter's ctx.run for one preset). */
export function patientFp(client: Pick<EngineClient, 'sequence'>, o: PatientSpec): Promise<Fp | null> {
  const k = patientKey(o);
  const baked = bakedPatient(k) as Fp | null;
  if (baked) return Promise.resolve(baked);   // (worked out at build time: no worker call)
  if (!patients.has(k)) patients.set(k, client.sequence([{ preset: o.preset, params: o.params, days: o.days, presetDays: o.presetDays }]).then((out) => (out?.[0]?.fp as Fp) ?? null).catch(() => null));
  return patients.get(k)!.then((f) => { if (!f) patients.delete(k); return f; });
}
/** Forget the patients worked out (a test, or a new engine). */
export const forgetPatients = () => patients.clear();

/** The rows whose readings are in: a row whose slide's state is not worked out yet, or whose `from` is not, waits. fpOf: a slide id → its state's fingerprint (null while it is not worked out). */
export function fillRows(rows: PlaneRow[], fpOf: (id: string) => Fp | null | undefined, patientOf: (o: RowSpec) => Fp | null | undefined = () => null): PlaneRow[] {
  const get = (sp: RowSpec) => (sp.id ? fpOf(sp.id) ?? null : sp.preset ? patientOf(sp) ?? null : null);
  for (const r of rows) { r.f = r.f ?? get(r.x); if (r.fx) r.from = r.from ?? get(r.fx); }
  return rows.filter((r) => r.f && (!r.fx || r.from));
}
/** The summary's points from the rows that are ready. */
export const pointsOfRows = (rows: readonly PlaneRow[]): PlanePoint[] => rows.filter((r) => r.f).map((r) => ({ f: r.f!, from: r.from, name: r.name, short: r.short || undefined, site: r.site }));

/** The points whose readings are known on the spot (a slide's state, a patient baked at build time or already worked out): what a summary's first drawing holds. A row waiting on a reading is left out. */
export function pointsSync(of: readonly unknown[] | null | undefined, slides: readonly SlideLike[], fpOf: (id: string) => Fp | null | undefined): PlanePoint[] {
  const rows = planeRows(of, slides);
  return pointsOfRows(fillRows(rows, fpOf, (o) => bakedPatient(patientKey(o)) as Fp | null));
}

/** Every row's readings, worked out: a slide's from fpOf, a patient's in the worker. Resolves with the points that came in. */
export async function loadPoints(of: readonly unknown[] | null | undefined, slides: readonly SlideLike[], fpOf: (id: string) => Fp | null | undefined, client: Pick<EngineClient, 'sequence'>): Promise<PlanePoint[]> {
  const rows = planeRows(of, slides), found = new Map<string, Fp | null>();
  const all = rows.flatMap((r) => [r.x, ...(r.fx ? [r.fx] : [])]).filter((x) => !x.id && x.preset);
  await Promise.all(all.map(async (x) => { found.set(patientKey(x), await patientFp(client, x as PatientSpec)); }));
  return pointsOfRows(fillRows(rows, fpOf, (o) => found.get(patientKey(o))));
}

/** A tool's trail: [{ slide, name }], the slides the patient stood at before this one, as the stops the card draws. null while any of them is not worked out (it is asked for again at the next reading). */
export function trailStops(trail: readonly { slide?: string; name?: string }[] | null | undefined, fpOf: (id: string) => Fp | null | undefined): Stop[] | null {
  if (!Array.isArray(trail) || !trail.length) return [];
  const list = trail.map((s) => ({ f: typeof s?.slide === 'string' ? fpOf(s.slide) ?? null : null, name: s?.name || '' }));
  return list.some((s) => !s.f) ? null : (list as Stop[]);
}
