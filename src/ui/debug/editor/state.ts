// The editor's pure state (no DOM, no three): the overrides being edited, the edits that change them, and the undo history. Every edit returns a new Overrides (the old one stays in the history).
import { migrate } from '../../../editor/store.ts';
import { foldStrokes } from '../../../editor/organ-apply.ts';
import { EMPTY, LIQUIFY_LIMIT, ORGAN_LIMITS, type Cage, type OrganEdit, type Overrides, type Stroke, type V3 } from '../../../editor/types.ts';

export const MAX_STROKES = 400;   // per organ: past this the strokes are folded into the organ's displacement grid (organ-apply.ts foldStrokes), never dropped
export const PLAN_PER_SCENE = 300;   // 2D plan units in one scene unit (frame2d UNITS_PER_SCENE)
const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const r4 = (v: number): number => Math.round(v * 10000) / 10000;

/** `a` and `b` describe different drafts? The text of each is made once per object (a draft is never changed in place), so asking on every pointer move costs nothing. */
const textOf = new WeakMap<Overrides, string>();
const text = (o: Overrides): string => { let t = textOf.get(o); if (t === undefined) { t = exportText(o); textOf.set(o, t); } return t; };
export const differs = (a: Overrides, b: Overrides): boolean => a !== b && text(a) !== text(b);
export const isEmpty = (o: Overrides): boolean => !Object.keys(o.nodes ?? {}).length && !Object.keys(o.vessels ?? {}).length && !Object.keys(o.organs ?? {}).length;

/** Node `id` at the absolute offsets (dx, dy plan units, dz scene units) the draft keeps; all zero removes it. */
export function setNode(o: Overrides, id: string, m: { dx: number; dy: number; dz?: number }): Overrides {
  const nodes = { ...o.nodes };
  if (!m.dx && !m.dy && !m.dz) delete nodes[id]; else nodes[id] = { dx: r4(m.dx), dy: r4(m.dy), ...(m.dz ? { dz: r4(m.dz) } : {}) };
  return { ...o, nodes };
}
/** Set the control point of vessel `id` at `u` (merged with a point within 0.02 of it) to the offsets; all-zero removes it. */
export function setControl(o: Overrides, id: string, u: number, m: { dx: number; dy: number; dz?: number }, keep = false): Overrides {
  const before = o.vessels?.[id]?.pts ?? [], had = before.some((p) => Math.abs(p.u - u) <= 0.02), pts = [...before].filter((p) => Math.abs(p.u - u) > 0.02);
  if (m.dx || m.dy || m.dz || had || keep) pts.push({ u: r4(clamp(u, 0, 1)), dx: r4(m.dx), dy: r4(m.dy), ...(m.dz ? { dz: r4(m.dz) } : {}) });
  pts.sort((a, b) => a.u - b.u);
  const vessels = { ...o.vessels };
  if (pts.length) vessels[id] = { pts }; else delete vessels[id];
  return { ...o, vessels };
}
/** A control point at `u` with no offset yet (a place the vessel is pinned at; drag it to bend). Added anywhere along the vessel. */
export const addControl = (o: Overrides, id: string, u: number): Overrides => setControl(o, id, u, controlOf(o, id, u), true);
/** Takes the control point near `u` away (the vessel's course there is the plan's again). */
export function removeControl(o: Overrides, id: string, u: number): Overrides {
  const pts = (o.vessels?.[id]?.pts ?? []).filter((p) => Math.abs(p.u - u) > 0.02), vessels = { ...o.vessels };
  if (pts.length) vessels[id] = { pts }; else delete vessels[id];
  return { ...o, vessels };
}
/** The control points a vessel shows handles for: its own, or three starting places while it has none. */
export const knotsOf = (o: Overrides, id: string): number[] => { const k = (o.vessels?.[id]?.pts ?? []).map((p) => p.u); return k.length ? k : [0.25, 0.5, 0.75]; };
export const controlOf = (o: Overrides, id: string, u: number): { dx: number; dy: number; dz: number } => {
  const p = o.vessels?.[id]?.pts.find((q) => Math.abs(q.u - u) <= 0.02);
  return { dx: p?.dx ?? 0, dy: p?.dy ?? 0, dz: p?.dz ?? 0 };
};
export const nodeOf = (o: Overrides, id: string): { dx: number; dy: number; dz: number } => { const n = o.nodes?.[id]; return { dx: n?.dx ?? 0, dy: n?.dy ?? 0, dz: n?.dz ?? 0 }; };

/** The organ's edit with its numbers held to ORGAN_LIMITS (the apply seam clamps too; the UI shows the held value). */
export function clampOrgan(e: OrganEdit): OrganEdit {
  const out: { -readonly [K in keyof OrganEdit]: OrganEdit[K] } = {};
  if (e.move) {
    const [x, y, z] = e.move, L = ORGAN_LIMITS.move, n = Math.hypot(x, y, z), k = n > L ? L / n : 1;
    out.move = [r4(clamp(x * k, -L, L)), r4(clamp(y * k, -L, L)), r4(clamp(z * k, -L, L))];
  }
  if (e.rotY != null) out.rotY = r4(clamp(e.rotY, -ORGAN_LIMITS.rotY, ORGAN_LIMITS.rotY));
  if (e.scale != null) out.scale = r4(clamp(e.scale, ORGAN_LIMITS.scaleMin, ORGAN_LIMITS.scaleMax));
  if (e.cage) out.cage = e.cage;
  if (e.grid) out.grid = e.grid;
  if (e.strokes?.length) out.strokes = e.strokes;
  if (out.strokes && out.strokes.length > MAX_STROKES) return clampOrgan(foldStrokes(out));   // (a long session: the strokes so far become the grid; nothing is dropped)
  return out;
}
const organIsDefault = (e: OrganEdit): boolean => !(e.move && e.move.some((v) => v)) && !e.rotY && (e.scale == null || e.scale === 1) && !e.strokes?.length && !e.cage && !e.grid;
export function setOrgan(o: Overrides, id: string, patch: OrganEdit): Overrides {
  const e = clampOrgan({ ...o.organs?.[id], ...patch });
  const organs = { ...o.organs };
  if (organIsDefault(e)) delete organs[id]; else organs[id] = e;
  return { ...o, organs };
}
export const organOf = (o: Overrides, id: string): { move: V3; rotY: number; scale: number; strokes: number } => {
  const e = o.organs?.[id];
  return { move: e?.move ?? [0, 0, 0], rotY: e?.rotY ?? 0, scale: e?.scale ?? 1, strokes: e?.strokes?.length ?? 0 };
};
/** One liquify stroke (displacement held to LIQUIFY_LIMIT so a single flick cannot ask for more than the seam will give). */
export function addStroke(o: Overrides, id: string, s: Stroke): Overrides {
  const [x, y, z] = s.by, n = Math.hypot(x, y, z), k = n > LIQUIFY_LIMIT ? LIQUIFY_LIMIT / n : 1;
  const st: Stroke = { at: [r4(s.at[0]), r4(s.at[1]), r4(s.at[2])], radius: r4(Math.max(0.01, s.radius)), by: [r4(x * k), r4(y * k), r4(z * k)] };
  return setOrgan(o, id, { strokes: [...(o.organs?.[id]?.strokes ?? []), st] });
}
export const CAGE_N = [3, 3, 3] as const;
/** Cage handle `idx` (x fastest) at the absolute offset `off` (reference frame, scene units), each component held to `lim`; an all-zero cage is dropped. */
export function setCageHandle(o: Overrides, id: string, idx: number, off: V3, lim: V3): Overrides {
  const cur: Cage = o.organs?.[id]?.cage ?? { n: CAGE_N, d: Array.from({ length: CAGE_N[0] * CAGE_N[1] * CAGE_N[2] }, () => [0, 0, 0] as V3) };
  if (idx < 0 || idx >= cur.d.length) return o;
  const d = cur.d.slice();
  d[idx] = [r4(clamp(off[0], -lim[0], lim[0])), r4(clamp(off[1], -lim[1], lim[1])), r4(clamp(off[2], -lim[2], lim[2]))];
  const any = d.some((v) => v[0] || v[1] || v[2]);
  return setOrgan(o, id, { cage: any ? { n: cur.n, d } : undefined });
}
export const cageOffset = (o: Overrides, id: string, idx: number): V3 => o.organs?.[id]?.cage?.d[idx] ?? [0, 0, 0];
export const clearCage = (o: Overrides, id: string): Overrides => {
  const e = { ...o.organs?.[id] }; delete e.cage;
  const organs = { ...o.organs }; if (organIsDefault(e)) delete organs[id]; else organs[id] = e;
  return { ...o, organs };
};
export const clearStrokes = (o: Overrides, id: string): Overrides => {
  const e = { ...o.organs?.[id] }; delete e.strokes; delete e.grid;   // (the grid holds the folded strokes)
  const organs = { ...o.organs }; if (organIsDefault(e)) delete organs[id]; else organs[id] = e;
  return { ...o, organs };
};
export const resetNode = (o: Overrides, id: string): Overrides => setNode(o, id, { dx: 0, dy: 0 });
export const resetVessel = (o: Overrides, id: string): Overrides => { const vessels = { ...o.vessels }; delete vessels[id]; return { ...o, vessels }; };
export const resetOrgan = (o: Overrides, id: string): Overrides => { const organs = { ...o.organs }; delete organs[id]; return { ...o, organs }; };

/** The Overrides as the file wants it: no empty maps, so an untouched draft equals EMPTY. */
export function tidy(o: Overrides): Overrides {
  const out: { -readonly [K in keyof Overrides]: Overrides[K] } = { version: 1 };
  if (o.meta && Object.keys(o.meta).length) out.meta = o.meta;
  if (o.snapshots && Object.keys(o.snapshots).length) out.snapshots = o.snapshots;
  if (Object.keys(o.nodes ?? {}).length) out.nodes = o.nodes!;
  if (Object.keys(o.vessels ?? {}).length) out.vessels = o.vessels!;
  if (Object.keys(o.organs ?? {}).length) out.organs = o.organs!;
  return out;
}
/** The edits themselves: no file notes (meta) and no snapshots. Equality of drafts is judged on this. */
export const core = (o: Overrides): Overrides => { const { meta: _m, snapshots: _s, ...rest } = tidy(o); return rest; };
export const exportText = (o: Overrides): string => JSON.stringify(core(o), null, 2) + '\n';
/** The file as Save and Export write it: the edits, the named snapshots, and the commit it was made on. */
export function fileText(o: Overrides, snapshots: Overrides['snapshots'], base: string): string {
  return JSON.stringify(tidy({ ...core(o), ...(snapshots && Object.keys(snapshots).length ? { snapshots } : {}), ...(base ? { meta: { base } } : {}) }), null, 2) + '\n';
}
/** A draft's file content as an Overrides (what saveDraft keeps). */
export const fileOverrides = (o: Overrides, snapshots: Overrides['snapshots'], base: string): Overrides => JSON.parse(fileText(o, snapshots, base)) as Overrides;
/** The note for a draft made on another commit than this build, or null. */
export const staleNote = (draftBase: string | undefined, build: string): string | null => (draftBase && build && draftBase !== build ? `This draft was made on commit ${draftBase.slice(0, 7)}; this build is ${build.slice(0, 7)}. Check it still fits.` : null);
/** A draft read back from text (a paste or localStorage): version 1 or nothing. */
export function parseOverrides(s: string): Overrides | null {
  try { const o = migrate(JSON.parse(s)); return o ? tidy(o) : null; } catch { return null; }
}

/** Undo history. A drag calls `mark` once at its start and then `commit(next, true)` per move, so the whole drag is one undo step. */
export class History {
  private past: Overrides[] = [];
  private future: Overrides[] = [];
  now: Overrides;
  constructor(start: Overrides = EMPTY) { this.now = start; }
  commit(next: Overrides, coalesce = false): void {
    if (next === this.now) return;
    if (!coalesce) this.mark();
    this.now = next;
  }
  /** Starts an undo step that goes back to `prev` (a change that was made first and noticed after: a slider that may not have changed the draft). */
  markAs(prev: Overrides): void { this.past.push(prev); if (this.past.length > 200) this.past.shift(); this.future = []; }
  /** Starts an undo step now. */
  mark(): void { this.past.push(this.now); if (this.past.length > 200) this.past.shift(); this.future = []; }
  get pastList(): readonly Overrides[] { return this.past; }
  get futureList(): readonly Overrides[] { return this.future; }
  /** Takes a saved history (session.ts) back. */
  restore(p: { now: Overrides; past: readonly Overrides[]; future: readonly Overrides[] }): void { this.now = p.now; this.past = [...p.past]; this.future = [...p.future]; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  undo(): boolean { const p = this.past.pop(); if (!p) return false; this.future.push(this.now); this.now = p; return true; }
  redo(): boolean { const f = this.future.pop(); if (!f) return false; this.past.push(this.now); this.now = f; return true; }
}

export type Lock = 'free' | 'x' | 'y' | 'z';
export const DZ_LIMIT = 0.3;   // scene units: the most a handle may be pulled in depth
/** A drag's body-frame movement (scene units) added to an offset, on all three axes: x and y become plan units (y down), z stays scene units (the depth offset). `lock` keeps one axis only.
 *  Root cause of the old "works only facing the front": z was dropped, so on a side or top view the pointer's movement along the depth axis was lost. */
export function dragToOffsets(start: { dx: number; dy: number; dz: number }, d: { x: number; y: number; z?: number }, lock: Lock = 'free'): { dx: number; dy: number; dz: number } {
  const keep = (a: 'x' | 'y' | 'z'): boolean => lock === 'free' || lock === a;
  const z = Math.min(DZ_LIMIT, Math.max(-DZ_LIMIT, start.dz + (keep('z') ? d.z ?? 0 : 0)));
  return { dx: start.dx + (keep('x') ? d.x : 0) * PLAN_PER_SCENE, dy: start.dy - (keep('y') ? d.y : 0) * PLAN_PER_SCENE, dz: z };
}
/** A point as built (the organ with the edit it was loaded with) back to the organ's reference frame, which is the frame a stroke is written in (organ-apply.ts: strokes first, then scale, turn about Y, move, all about the centroid). */
export function toReference(p: V3, loadedEdit: OrganEdit | undefined, centroid: V3): V3 {
  const e = clampOrgan(loadedEdit ?? {}), mv = e.move ?? [0, 0, 0], k = e.scale ?? 1, a = e.rotY ?? 0, cs = Math.cos(a), sn = Math.sin(a);
  const u = p[0] - centroid[0] - mv[0], w = p[2] - centroid[2] - mv[2];
  return [centroid[0] + (u * cs - w * sn) / k, centroid[1] + (p[1] - centroid[1] - mv[1]) / k, centroid[2] + (u * sn + w * cs) / k];
}
/** A stroke's pull and radius as seen on the built organ (scene units, on screen) back to the reference frame: the stroke acts before scale and turn, so undo both. */
export function strokeToReference(by: V3, radius: number, loadedEdit: OrganEdit | undefined): { by: V3; radius: number } {
  const e = clampOrgan(loadedEdit ?? {}), k = e.scale ?? 1, a = e.rotY ?? 0, cs = Math.cos(a), sn = Math.sin(a);
  return { by: [(by[0] * cs - by[2] * sn) / k, by[1] / k, (by[0] * sn + by[2] * cs) / k], radius: radius / k };
}
