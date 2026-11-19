import type { CelObject } from './materials/cel.ts';

// Vessel highlight (look-and-feel.md section 9): the picked vessel gets a bolder outline in its own deep colour (white on the dark
// looks) that runs on downstream and fades, and reaches only a short way upstream ("long ahead, short behind"). It lifts a hair.
// Nothing else is dimmed. Downstream is read from the topology (edge `from` to `to`), so the highlight follows the blood through
// branches (the portal trunk into both portal branches) with no per-vessel hand tuning.

export interface HighlightEdge {
  id: string;
  from: string;
  to: string;
  /** Centreline length in scene units. */
  length: number;
}

export interface HighlightSpec {
  /** 0 = the picked vessel, +1 downstream of it, -1 upstream of it. */
  dir: -1 | 0 | 1;
  /** Distance along the flow from the picked vessel's end (downstream) or start (upstream) to this vessel's near end. */
  offset: number;
}

export interface HighlightRange {
  /** How far the outline runs on downstream, in scene units. */
  ahead: number;
  /** How far it reaches upstream. */
  behind: number;
}

export const DEFAULT_RANGE: HighlightRange = { ahead: 2.4, behind: 0.45 };
/** Outline lift on the picked vessel (scene units), mocks: 0.012. */
export const PICK_LIFT = 0.012;
/** Fade in and out of the outline, ms. */
export const HIGHLIGHT_FADE_MS = 180;

/** Which vessels carry the outline for a pick, and where along the flow each one starts. Walks the topology both ways. A pick is a group
 *  when the engine cuts a vein into pieces (a vein with a shunt joining part-way along it is one vein to the eye): every piece is the pick. */
export function computeHighlight(pick: string | readonly string[], edges: readonly HighlightEdge[], range: HighlightRange = DEFAULT_RANGE): Map<string, HighlightSpec> {
  const ids = typeof pick === 'string' ? [pick] : pick;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const group = ids.map((id) => byId.get(id)).filter((e): e is HighlightEdge => !!e);
  const out = new Map<string, HighlightSpec>();
  if (!group.length) return out;
  for (const e of group) out.set(e.id, { dir: 0, offset: 0 });
  const nodes = new Set(group.flatMap((e) => [e.from, e.to]));

  // downstream: edges that leave any node of the pick
  const down = [...nodes].map((node) => ({ node, offset: 0 }));
  while (down.length) {
    const { node, offset } = down.shift()!;
    if (offset >= range.ahead) continue;
    for (const e of edges) {
      if (e.from !== node || out.has(e.id)) continue;
      out.set(e.id, { dir: 1, offset });
      down.push({ node: e.to, offset: offset + e.length });
    }
  }
  // upstream: edges that flow into any node of the pick (short)
  const up = [...nodes].map((node) => ({ node, offset: 0 }));
  while (up.length) {
    const { node, offset } = up.shift()!;
    if (offset >= range.behind) continue;
    for (const e of edges) {
      if (e.to !== node || out.has(e.id)) continue;
      out.set(e.id, { dir: -1, offset });
      up.push({ node: e.from, offset: offset + e.length });
    }
  }
  return out;
}

/** Outline strength 0 to 1 at a distance along the flow, as the ink shader computes it (smoothstep fade). */
export function outlineStrength(spec: HighlightSpec, arc: number, length: number, range: HighlightRange = DEFAULT_RANGE): number {
  if (spec.dir === 0) return 1;
  const dist = spec.dir > 0 ? spec.offset + arc : spec.offset + (length - arc);
  const limit = spec.dir < 0 ? range.behind : range.ahead;
  const t = Math.min(1, Math.max(0, dist / Math.max(limit, 1e-4)));
  return 1 - t * t * (3 - 2 * t);
}

/** Moves `v` toward `goal` by at most `step`, landing on it exactly. */
const approach = (v: number, goal: number, step: number): number => (Math.abs(goal - v) <= step ? goal : v + Math.sign(goal - v) * step);

interface Track { obj: CelObject; on: number; target: number; lift: number; liftTarget: number }

/** Applies a pick to the vessel objects and fades it in and out. `step` returns true while anything is still moving, so the clock keeps
 *  asking for frames and goes quiet afterwards (nothing is drawn when nothing moves). */
export class Highlight {
  private tracks = new Map<string, Track>();
  private range: HighlightRange;
  private edges: HighlightEdge[];
  picked: string | null = null;
  private hostOf: ReadonlyMap<string, string>;

  constructor(objects: readonly CelObject[], range: HighlightRange = DEFAULT_RANGE, hostOf: ReadonlyMap<string, string> = new Map()) {
    this.hostOf = hostOf;
    this.range = range;
    this.edges = [];
    for (const o of objects) {
      if (!o.isVessel || !o.edge) continue;
      this.edges.push({ id: o.edge.id, from: o.edge.from, to: o.edge.to, length: o.edge.length });
      this.tracks.set(o.edge.id, { obj: o, on: 0, target: 0, lift: 0, liftTarget: 0 });
      const u = o.ink.uniforms;
      u.hiAhead.value = range.ahead;
      u.hiBehind.value = range.behind;
    }
  }

  set(id: string | null): void {
    this.picked = id && this.tracks.has(id) ? id : null;
    const spec = this.picked ? computeHighlight(this.group(this.picked), this.edges, this.range) : new Map<string, HighlightSpec>();
    for (const [eid, t] of this.tracks) {
      const s = spec.get(eid);
      t.target = s ? 1 : 0;
      t.liftTarget = s && s.dir === 0 ? PICK_LIFT : 0;
      if (s) {
        const u = t.obj.ink.uniforms;
        u.hiDir.value = s.dir;
        u.hiOffset.value = s.offset;
      }
    }
  }

  /** All the pieces of the vein a picked piece belongs to. */
  private group(id: string): string[] {
    const host = this.hostOf.get(id) ?? id;
    return this.edges.filter((e) => (this.hostOf.get(e.id) ?? e.id) === host).map((e) => e.id);
  }

  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / HIGHLIGHT_FADE_MS); // linear: the full fade takes HIGHLIGHT_FADE_MS
    let moving = false;
    for (const t of this.tracks.values()) {
      if (t.on !== t.target || t.lift !== t.liftTarget) {
        t.on = approach(t.on, t.target, k);
        t.lift = approach(t.lift, t.liftTarget, k * PICK_LIFT);
        moving = true;
      }
      t.obj.ink.uniforms.hiOn.value = t.on;
      t.obj.toon.uniforms.inflate.value = t.lift;
    }
    return moving;
  }
}
