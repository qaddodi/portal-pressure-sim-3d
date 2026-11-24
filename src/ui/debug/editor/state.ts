// The editor's pure state (no DOM, no three): the overrides being edited, the edits that change them, and the undo history. Every edit returns a new Overrides (the old one stays in the history).
import { EMPTY, LIQUIFY_LIMIT, ORGAN_LIMITS, type OrganEdit, type Overrides, type Stroke, type V3 } from '../../../editor/types.ts';

export const MAX_STROKES = 400;   // per organ: the draft stays small enough for localStorage and a click
export const PLAN_PER_SCENE = 300;   // 2D plan units in one scene unit (frame2d UNITS_PER_SCENE)
const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const r4 = (v: number): number => Math.round(v * 10000) / 10000;

export const isEmpty = (o: Overrides): boolean => !Object.keys(o.nodes ?? {}).length && !Object.keys(o.vessels ?? {}).length && !Object.keys(o.organs ?? {}).length;

/** Node `id` at the absolute offsets (dx, dy plan units, dz scene units) the draft keeps; all zero removes it. */
export function setNode(o: Overrides, id: string, m: { dx: number; dy: number; dz?: number }): Overrides {
  const nodes = { ...o.nodes };
  if (!m.dx && !m.dy && !m.dz) delete nodes[id]; else nodes[id] = { dx: r4(m.dx), dy: r4(m.dy), ...(m.dz ? { dz: r4(m.dz) } : {}) };
  return { ...o, nodes };
}
/** Set the control point of vessel `id` at `u` (merged with a point within 0.02 of it) to the offsets; all-zero removes it. */
export function setControl(o: Overrides, id: string, u: number, m: { dx: number; dy: number; dz?: number }): Overrides {
  const pts = [...(o.vessels?.[id]?.pts ?? [])].filter((p) => Math.abs(p.u - u) > 0.02);
  if (m.dx || m.dy || m.dz) pts.push({ u: r4(clamp(u, 0, 1)), dx: r4(m.dx), dy: r4(m.dy), ...(m.dz ? { dz: r4(m.dz) } : {}) });
  pts.sort((a, b) => a.u - b.u);
  const vessels = { ...o.vessels };
  if (pts.length) vessels[id] = { pts }; else delete vessels[id];
  return { ...o, vessels };
}
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
  if (e.strokes?.length) out.strokes = e.strokes.slice(-MAX_STROKES);
  return out;
}
const organIsDefault = (e: OrganEdit): boolean => !(e.move && e.move.some((v) => v)) && !e.rotY && (e.scale == null || e.scale === 1) && !e.strokes?.length;
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
export const clearStrokes = (o: Overrides, id: string): Overrides => {
  const e = { ...o.organs?.[id] }; delete e.strokes;
  const organs = { ...o.organs }; if (organIsDefault(e)) delete organs[id]; else organs[id] = e;
  return { ...o, organs };
};
export const resetNode = (o: Overrides, id: string): Overrides => setNode(o, id, { dx: 0, dy: 0 });
export const resetVessel = (o: Overrides, id: string): Overrides => { const vessels = { ...o.vessels }; delete vessels[id]; return { ...o, vessels }; };
export const resetOrgan = (o: Overrides, id: string): Overrides => { const organs = { ...o.organs }; delete organs[id]; return { ...o, organs }; };

/** The Overrides as the file wants it: no empty maps, so an untouched draft equals EMPTY. */
export function tidy(o: Overrides): Overrides {
  const out: { -readonly [K in keyof Overrides]: Overrides[K] } = { version: 1 };
  if (Object.keys(o.nodes ?? {}).length) out.nodes = o.nodes!;
  if (Object.keys(o.vessels ?? {}).length) out.vessels = o.vessels!;
  if (Object.keys(o.organs ?? {}).length) out.organs = o.organs!;
  return out;
}
export const exportText = (o: Overrides): string => JSON.stringify(tidy(o), null, 2) + '\n';
/** A draft read back from text (a paste or localStorage): version 1 or nothing. */
export function parseOverrides(s: string): Overrides | null {
  try { const o = JSON.parse(s) as Overrides; return o && o.version === 1 ? tidy(o) : null; } catch { return null; }
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
  /** Starts an undo step now. */
  mark(): void { this.past.push(this.now); if (this.past.length > 200) this.past.shift(); this.future = []; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  undo(): boolean { const p = this.past.pop(); if (!p) return false; this.future.push(this.now); this.now = p; return true; }
  redo(): boolean { const f = this.future.pop(); if (!f) return false; this.past.push(this.now); this.now = f; return true; }
}
