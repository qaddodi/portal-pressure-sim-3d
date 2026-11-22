// The edge-state texture (?geom=net, WP1): ONE ROW PER EDGE of the skeleton, holding what the per-vessel uniforms hold today (vessels/vessel-object.ts: fade, highlight, lens span, wedge, stump, width kind, ...).
// The network's one mesh reads its row by the edge id its bone carries, so a fade or a highlight is written once per edge and costs one row upload, not ~120 uniforms on each of 65 objects.
//
// THE LAYOUT IS DATA: EDGE_COLUMNS lists the columns once; the packer gives each a texel and a component (first fit, a vector never straddles two texels), and EDGE_LAYOUT is what the network shader reads
// (WP3 fetches `texelFetch(edgeTex, ivec2(texel, edge), 0)`). A column names the uniform of vessels/shaders.ts it replaces (`uniform`), which is how uniform-map.ts proves that every uniform is accounted for.
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { HI_NONE } from '../../materials/shaders.ts';
import { TIER_Z } from '../../frame2d.ts';
import { circuitWidth } from '../vessel-object.ts';
import type { NetTone } from '../network.ts';
import type { SkelEdge } from './types.ts';

/** What a row starts from: the edge's tone and tier (the skeleton's own) and how its width follows the engine's diameter (network.ts widthKind). */
export interface EdgeInit extends Pick<SkelEdge, 'tone' | 'tier'> { widthKind?: 0 | 1 | 2 }

export interface EdgeColumn {
  readonly name: string;
  /** floats: 1 to 4 (shares a texel), or 8 (two whole texels: a vec4[2] uniform) */
  readonly size: 1 | 2 | 3 | 4 | 8;
  /** the uniform of vessels/shaders.ts this column replaces; null: a column the skeleton adds (tone, tier, presence) */
  readonly uniform: string | null;
  /** the row's starting value (what vessel-object.ts gives the uniform when a vessel is built) */
  readonly init: (e: Required<EdgeInit>) => readonly number[];
}

const same = (...v: number[]) => () => v;
const TONES: readonly NetTone[] = ['portal', 'sys', 'artery'];
const TIERS = Object.keys(TIER_Z);
const col = (name: string, size: EdgeColumn['size'], init: EdgeColumn['init'] | number[], uniform: string | null = name): EdgeColumn => ({ name, size, uniform, init: typeof init === 'function' ? init : same(...init) });

/** Every per-edge value. The order is the packing order (static identity first, then what a slide or a pick writes). */
export const EDGE_COLUMNS: readonly EdgeColumn[] = [
  // identity (written once)
  col('tone', 1, (e) => [TONES.indexOf(e.tone)], null),
  col('tier', 1, (e) => [TIERS.indexOf(e.tier)], null),
  col('sewn', 4, [-1, -1, 0, 0], null),   // the edge's sewn ends (net/sewn.ts, written once): the host's bone at end 0 and end 1 (-1: none) and the flags of each (SEWN_INSIDE 1, SEWN_SINK 2, SEWN_FLARE 4, SEWN_CAPPED 8)
  col('bakeScale', 1, [1], null),   // the factor the edge's radii were scaled by for the bake (mesh.bakeScale, written once): a junction vertex's offsets are in units of rest radius x this (net/mesh.ts scaledSkeleton)
  col('peelA', 4, [-1, 2, -1, 2], null),   // the junction peel (net/peel.ts, written once): the anchor bone of the region at end 0 (-1: none), the u of its boundary from end 0, the same for end 1
  col('radius', 1, [0.02]),   // the vessel's nominal radius, scene units: what the Circuit's live width is measured against (shaders.ts circSwell: map half-width over this), and the dust's section
  col('waist', 3, [0, 0.2, 0.5], null),   // a stenosis's waist (disease/clamps.ts waistNarrow): how narrowed (0 none), the bell's sigma, its centre along THIS edge (the old `narrow` attribute, one value per vertex, is a function of u)
  col('lenMap', 1, [1], null),   // the vessel's length along its MAP course, scene units (the old `cl.y`): the Circuit's stent cells tile by it (shaders.ts vArcLen)
  col('noMap', 1, [0], null),   // 1: a part with no map course (a fan, a strand): it never morphs and dissolves in the Circuit's first half (circStay)
  col('presence', 1, [1], null),   // 1: there, 0: not (WP5: eases the radius to nothing and the alpha with it; nothing is created or destroyed at runtime)
  col('vindex', 1, [0]), col('baseD', 1, [1]), col('widthKind', 1, (e) => [e.widthKind]), col('lensIndex', 1, [0]), col('len', 1, [1]), col('px', 1, [1.2]),
  col('lensUse', 1, (e) => [e.tone === 'artery' ? 0 : 1]),
  col('circW', 4, (e) => circuitWidth(e.widthKind)), col('circCap', 2, [0, 0]), col('circRow', 1, [-1]),
  // live state
  col('inflate', 1, [0]), col('reveal', 1, [1]), col('fade', 1, [1]),
  col('flowAmount', 1, [0]), col('flowBands', 1, [0]), col('stubSpeed', 1, [0]), col('smokeOn', 1, [0]), col('dotted', 1, [0]), col('inkOn', 1, [1]), col('liveW', 1, [1]),
  col('glowK', 1, [1]), col('quietK', 1, [0]), col('solidK', 1, [1]), col('veilK', 1, [1]),
  col('circFlat', 1, [0]), col('circAnchA', 3, [0, 0, 0]), col('circAnchC', 3, [0, 0, 0]),
  col('lensSpan', 2, [0, 1]),
  // the crossing shadow (cel-ink.ts SHADOW): the Circuit's depth offset (circuit/map-depth.ts mapDepthOf) and the band's fade length over each joined end (vessels/shadow.ts shadowEndsOf, in this edge's radii; 0 a free end), written once per edge
  col('mapDepth', 1, [0]), col('shadowEnd', 2, [0, 0]),
  // the highlight (highlight.ts)
  col('hiOn', 1, [0]), col('hiDir', 1, [0]), col('hiOffset', 1, [0]), col('hiAhead', 1, [1]), col('hiBehind', 1, [1]), col('hiFade', 1, [1]), col('hiPx', 1, [1.6]),
  col('hiEnds', 2, [HI_NONE, HI_NONE]), col('hiColor', 3, [0, 0, 0]),
  // the fades (fades.ts) and the cava's end
  col('fadeMode', 1, [0]), col('fadeKeep', 1, [0]), col('fadeA', 4, [0, 1, 1, 1]), col('fadeLine', 4, [0, 0, 0, 1]), col('mapFade', 3, [0, 1, 0]), col('cavaEnd', 2, [0, 1]),
  // surgery and procedures
  col('stump', 3, [0, 0, 0]), col('stentU', 4, [0, 0, 1, 0]), col('stentT0', 1, [0]), col('seamA', 8, [0, 0, 0, 0, 0, 0, 0, 0]), col('seamB', 8, [0, 0, 0, 0, 0, 0, 0, 0]),
  col('wedge', 4, [0, 0.02, 0.6, 0]), col('wedgeD', 4, [0, 0, -1, 0.02]),
];

export interface EdgeSlot { readonly name: string; readonly size: number; readonly texel: number; readonly comp: number; readonly uniform: string | null; readonly index: number }

/** First fit: a column of 1 to 4 floats takes the first run of free components inside one texel; a column of 8 takes two whole texels. */
function pack(columns: readonly EdgeColumn[]): { slots: readonly EdgeSlot[]; texels: number } {
  const used: number[] = [];   // per texel, a bit per component
  const slots: EdgeSlot[] = [];
  columns.forEach((c, index) => {
    let texel = 0, comp = 0;
    if (c.size === 8) {
      texel = used.length; used.push(15, 15);
    } else {
      const need = (1 << c.size) - 1;
      search: for (texel = 0; ; texel++) {
        if (texel === used.length) used.push(0);
        for (comp = 0; comp + c.size <= 4; comp++) if (!(used[texel]! & (need << comp))) { used[texel]! |= need << comp; break search; }
      }
    }
    slots.push({ name: c.name, size: c.size, texel, comp, uniform: c.uniform, index });
  });
  return { slots, texels: used.length };
}

const PACKED = pack(EDGE_COLUMNS);
export const EDGE_SLOTS: readonly EdgeSlot[] = PACKED.slots;
/** A row's width in texels: the texture is EDGE_TEXELS wide and one row per edge tall. */
export const EDGE_TEXELS = PACKED.texels;
export const EDGE_LAYOUT: ReadonlyMap<string, EdgeSlot> = new Map(EDGE_SLOTS.map((s) => [s.name, s]));

const widthKindOf = (e: EdgeInit): 0 | 1 | 2 => e.widthKind ?? (e.tone === 'artery' ? 1 : 0);
const sameNums = (a: ArrayLike<number>, o: number, b: readonly number[]): boolean => { for (let i = 0; i < b.length; i++) if (a[o + i] !== b[i]) return false; return true; };

/** The table: one row per edge, written in place; the rows that changed since the last upload are kept as one range, and `flush` hands exactly those to the GPU (three's texture update ranges). */
export class EdgeStateTable {
  readonly rows: number;
  readonly data: Float32Array;
  /** rows the table has written since creation: a coil step must move this by one edge's, not the network's (the test pins it) */
  writes = 0;
  private lo = Infinity; private hi = -1;
  private tex: DataTexture | null = null;

  constructor(edges: readonly EdgeInit[]) {
    this.rows = edges.length;
    this.data = new Float32Array(Math.max(1, this.rows) * EDGE_TEXELS * 4);
    edges.forEach((e, row) => {
      const full: Required<EdgeInit> = { tone: e.tone, tier: e.tier, widthKind: widthKindOf(e) };
      for (const s of EDGE_SLOTS) this.data.set(EDGE_COLUMNS[s.index]!.init(full), this.offset(row, s));
    });
    this.markAll();
  }

  private offset(row: number, s: EdgeSlot): number { return (row * EDGE_TEXELS + s.texel) * 4 + s.comp; }
  private slot(name: string): EdgeSlot { const s = EDGE_LAYOUT.get(name); if (!s) throw new Error(`edge-state: no column "${name}"`); return s; }
  private mark(row: number): void { if (row < this.lo) this.lo = row; if (row > this.hi) this.hi = row; }
  private markAll(): void { this.lo = 0; this.hi = this.rows - 1; }

  /** The column's values for an edge (a copy). */
  get(row: number, name: string): number[] { const s = this.slot(name); return Array.from(this.data.subarray(this.offset(row, s), this.offset(row, s) + s.size)); }

  /** Writes a column of an edge. Returns whether anything changed: the same values touch nothing and mark nothing, so a state that is rewritten every frame with the same numbers costs no upload. */
  set(row: number, name: string, value: number | readonly number[]): boolean {
    const s = this.slot(name), v = typeof value === 'number' ? [value] : value;
    if (row < 0 || row >= this.rows) throw new RangeError(`edge-state: row ${row} of ${this.rows}`);
    if (v.length !== s.size) throw new RangeError(`edge-state: "${name}" is ${s.size} values, got ${v.length}`);
    const o = this.offset(row, s);
    if (sameNums(this.data, o, v)) return false;
    this.data.set(v, o);
    this.mark(row); this.writes++;
    return true;
  }

  /** The rows written since the last flush, first and last (null: none). */
  dirtyRows(): readonly [number, number] | null { return this.hi < 0 ? null : [this.lo, this.hi]; }

  /** The texture (RGBA32F, EDGE_TEXELS x rows, nearest): made once, uploaded whole the first time, then only the dirty rows. */
  texture(): DataTexture {
    if (!this.tex) {
      const t = new DataTexture(this.data, EDGE_TEXELS, Math.max(1, this.rows), RGBAFormat, FloatType);
      t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      this.tex = t;
      this.lo = Infinity; this.hi = -1;   // (the first upload is whole)
    }
    return this.tex;
  }

  /** Hands the dirty rows to the GPU: one update range covering them, then forgets them. A no-op when nothing changed. */
  flush(): void {
    const t = this.tex;
    if (!t || this.hi < 0) return;
    const stride = EDGE_TEXELS * 4;
    t.addUpdateRange(this.lo * stride, (this.hi - this.lo + 1) * stride);
    t.needsUpdate = true;
    this.lo = Infinity; this.hi = -1;
  }
}
