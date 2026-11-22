// The edge rows of ?geom=net, written from the OLD vessel objects' state (WP4). The scene keeps building the tubes, so every rule that sets a vessel's state (the fades, the highlight, the lens span, the wedge, the stump, the presence tracks, the flow marks, the
// procedures' stents and seams) keeps writing the per-vessel uniforms it always did; this file copies them, edge by edge, into the edge-state texture the network shader reads. One source of state, no second set of setters to drift: the net shader is a second
// READER of the same state, and a vessel's value is the same for both programs by construction (tests/net-wiring.test.ts holds every column to its uniform).
//
// A HOST SPLIT IN PIECES (skeleton.ts: a vessel with side-wall landings is cut at each landing into edges that share a bone) has ONE uniform set and several edges, each with its own u from 0 to 1. Every column that is in the vessel's u or length is
// remapped onto the piece (`pieceOf`, `remapPiece`): the same rule for every column, so a fade, a highlight or a lens ramp runs on across the cut with no step.
import type { IUniform } from 'three';
import { EDGE_COLUMNS, type EdgeStateTable } from './edge-state.ts';
import { sewnEnds } from './sewn.ts';
import type { Skeleton } from './types.ts';

/** The vessel an edge draws and the stretch of that vessel's course the edge covers (0..1 of its u): [0, 1] for a whole vessel. */
export interface EdgeVessel { id: string; h0: number; h1: number }

/** Per skeleton edge, its vessel and stretch. A vessel cut in pieces `X#0`, `X#1`, ... has its bones shared at the cuts (one bone is the last of a piece and the first of the next), so the pieces tile its bones. */
export function edgeVessels(skel: Skeleton): EdgeVessel[] {
  const base = (id: string): string => id.split('#')[0]!;
  const total = new Map<string, number>(), starts = new Map<string, number>();
  for (const e of skel.edges) total.set(base(e.id), (total.get(base(e.id)) ?? 0) + e.bones[1] - 1);   // (bones - 1 per piece, plus one for the last: the span in bone steps)
  return skel.edges.map((e) => {
    const id = base(e.id), steps = total.get(id)!, at = starts.get(id) ?? 0;
    starts.set(id, at + e.bones[1] - 1);
    return { id, h0: steps > 0 ? at / steps : 0, h1: steps > 0 ? (at + e.bones[1] - 1) / steps : 1 };
  });
}

/** What the rows are written from: the scene's side, a handful of questions about a vessel by its id. Each may answer undefined (a vessel the scene does not draw: its row keeps its start). */
export interface RowSource {
  /** the vessel's uniforms (a VesselObject's `toon.uniforms`) */
  uniforms(id: string): Readonly<Record<string, IUniform>> | undefined;
  /** the fade the scene composes for the vessel (dive, change, feeders: scene.composeFade), WITHOUT the hand-over's share: the network mesh's own fade */
  fade(id: string): number | undefined;
  /** the shares of the two draws of a network: [the organs-pass copy (layer 0), the vessel-pass copy (front or veil)] (VesselObject.netCopies) */
  copies(id: string): readonly [number, number] | undefined;
  /** whether the vessel is drawn at all (its group is visible): the edge's presence */
  present(id: string): boolean | undefined;
  /** the clamp's waist on the vessel: [how narrowed 0..1, the bell's sigma in u, its centre in u], or null */
  waist(id: string): readonly [number, number, number] | null | undefined;
  /** what is fixed for the vessel: its map course's length (the old geometry's `cl.y`) and whether it has no map course (a fan: it never morphs) */
  fixed(id: string): { lenMap: number; noMap: boolean } | undefined;
}

/** A uniform's value as the floats of its column (a number, a three vector or colour, a vec4 array for the seams). */
export function flat(v: unknown): number[] | null {
  if (typeof v === 'number') return [v];
  if (typeof v === 'boolean') return [v ? 1 : 0];
  if (Array.isArray(v)) { const out: number[] = []; for (const x of v) { const f = flat(x); if (!f) return null; out.push(...f); } return out; }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.w === 'number') return [o.x as number, o.y as number, o.z as number, o.w];
    if (typeof o.z === 'number') return [o.x as number, o.y as number, o.z];
    if (typeof o.y === 'number') return [o.x as number, o.y];
    if (typeof o.r === 'number') return [o.r, o.g as number, o.b as number];
  }
  return null;
}


/** A vessel's u on a piece covering [h0, h1] of it. */
const onPiece = (u: number, h0: number, h1: number): number => (u - h0) / (h1 - h0);

/** The columns that are NOT copied verbatim from their uniform, and what each does with a piece. Every other column with a uniform is copied as is. */
export const REMAPPED = ['len', 'fadeA', 'mapFade', 'cavaEnd', 'stump', 'stentU', 'lensSpan', 'hiOffset', 'hiEnds', 'circCap', 'fade', 'solidK', 'veilK'] as const;

/** `arcHost` for a piece starting h0 of the way along a vessel `len` long: [the arc length before it, the vessel's length]. */
export const arcHost = (len: number, h0: number): [number, number] => [len * h0, len];

/** One column's floats for a piece [h0, h1] of the vessel, given what the whole vessel has (`all`, the vessel's own length for the length-based ones). Returns null to leave the row as it is. */
export function remapPiece(name: string, all: readonly number[], h0: number, h1: number, len: number, fadeMode = 0, hiDir = 0): number[] {
  const d = h1 - h0;
  if (h0 === 0 && h1 === 1) return all.slice();
  switch (name) {
    case 'len': return [all[0]! * d];
    case 'fadeA': return fadeMode > 0.5 && fadeMode < 1.5 ? [onPiece(all[0]!, h0, h1), onPiece(all[1]!, h0, h1), all[2]!, all[3]!] : all.slice();   // (mode 1 fades by u; modes 2 to 4 by position: unchanged)
    case 'mapFade': return [onPiece(all[0]!, h0, h1), onPiece(all[1]!, h0, h1), all[2]!];
    // the cava's end ease starts `span` before the vessel's end: on a piece that ends short of it, the ease has not begun (span 0); on the last piece the same stretch is a larger share of it
    case 'cavaEnd': return h1 >= 1 - 1e-9 ? [Math.min(1, all[0]! / d), all[1]!] : [0, all[1]!];
    // the divided stretch (figure units from the vessel's start, in the shader's body scale of 300 per scene unit) that lies before this piece is gone from its start
    case 'stump': return [Math.max(0, all[0]! - h0 * len * 300), all[1]! - h0 * len * 300, all[2]!];
    case 'stentU': return [all[0]!, onPiece(all[1]!, h0, h1), onPiece(all[2]!, h0, h1), all[3]!];
    // the ramp's stretch this piece wears: the vessel's [a, b] sampled at the piece's two ends
    case 'lensSpan': return [all[0]! + (all[1]! - all[0]!) * h0, all[0]! + (all[1]! - all[0]!) * h1];
    // the highlight's distance along the route is measured from this vessel's start (ahead) or its end (behind); a piece starts h0 of the way along and ends (1 - h1) short of the end
    case 'hiOffset': return [all[0]! + (hiDir < -0.5 ? len * (1 - h1) : len * h0)];
    case 'hiEnds': return [all[0]! + len * h0, all[1]! + len * (1 - h1)];
    case 'circCap': return [h0 <= 1e-9 ? all[0]! : 0, h1 >= 1 - 1e-9 ? all[1]! : 0];
    default: return all.slice();
  }
}



/** Writes the rows of the whole skeleton. `static` once (the identity columns the uniforms do not carry), `sync` every frame the figure moves (only a changed value touches the table). */
export class NetRows {
  readonly vessels: EdgeVessel[];
  /** columns that are copied from a uniform of the same name or of `uniform` (everything but REMAPPED, the identity columns and the ones below) */
  private readonly copy = EDGE_COLUMNS.filter((c) => c.uniform && !(REMAPPED as readonly string[]).includes(c.name));
  private readonly skel: Skeleton; readonly table: EdgeStateTable; private readonly src: RowSource;
  constructor(skel: Skeleton, table: EdgeStateTable, src: RowSource) {
    this.skel = skel; this.table = table; this.src = src;
    this.vessels = edgeVessels(skel);
  }

  /** The identity columns: the sewn ends (net/sewn.ts), the bake scale (the mesh's own, per edge) (the junction peel went with 71141fa7: the shader reads no `peelA`). Written once. */
  writeStatic(bakeScale: ArrayLike<number> | undefined): void {
    const sewn = sewnEnds(this.skel);
    sewn.forEach(([a, b], row) => {
      this.table.set(row, 'sewn', [a ? a.host : -1, b ? b.host : -1, a ? a.flags : 0, b ? b.flags : 0]);
      if (bakeScale) this.table.set(row, 'bakeScale', bakeScale[row] ?? 1);
      const f = this.src.fixed(this.vessels[row]!.id), v = this.vessels[row]!;
      if (f) { this.table.set(row, 'noMap', f.noMap ? 1 : 0); this.table.set(row, 'lenMap', f.lenMap * (v.h1 - v.h0)); }
    });
  }

  /** Copies every edge's state from the vessel objects. Returns whether any row changed. */
  sync(): boolean {
    let changed = false;
    this.skel.edges.forEach((_, row) => {
      const { id, h0, h1 } = this.vessels[row]!, u = this.src.uniforms(id);
      if (!u) return;
      const set = (name: string, v: readonly number[] | number | null | undefined): void => { if (v != null && this.table.set(row, name, v)) changed = true; };
      const num = (name: string): number => { const f = flat(u[name]?.value); return f ? f[0]! : 0; };
      for (const c of this.copy) { const f = u[c.uniform!] ? flat(u[c.uniform!]!.value) : null; if (f && f.length === (c.size === 8 ? 8 : c.size)) set(c.name, f); }
      const len = num('len'), fadeMode = num('fadeMode'), hiDir = num('hiDir');
      for (const name of ['len', 'fadeA', 'mapFade', 'cavaEnd', 'stump', 'stentU', 'lensSpan', 'hiOffset', 'hiEnds', 'circCap']) {
        const f = u[name] ? flat(u[name]!.value) : null;
        if (f) set(name, remapPiece(name, f, h0, h1, len, fadeMode, hiDir));
      }
      if (h0 > 0 || h1 < 1) set('arcHost', arcHost(len, h0));   // (a piece of a split host: its start on the host's arc, and the host's length)
      const fade = this.src.fade(id); if (fade !== undefined) set('fade', fade);
      const cp = this.src.copies(id); if (cp) { set('solidK', cp[0]); set('veilK', cp[1]); }
      const pr = this.src.present(id); if (pr !== undefined) set('presence', pr ? 1 : 0);
      const w = this.src.waist(id); if (w !== undefined) { const d = h1 - h0; set('waist', w ? [w[0], w[1] / d, onPiece(w[2], h0, h1)] : [0, 0.2, 0.5]); }
    });
    return changed;
  }
}

