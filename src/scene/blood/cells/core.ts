import { STREAK, laneSpeed, lanesFor } from '../streak-glsl.ts';
// Blood-cell particles, the node-testable core (no three.js, no GPU): how many cells each vessel gets, where each one starts, how a cell's place follows the blood's distance
// (wrap and reversal), how many of a vessel's cells show at a given flow, the data rows the shader reads, and when the layer is on. The GPU side is shader.ts and cells.ts.
//
// The picture the rules make: every drawn vessel owns a fixed row of "slots" (cells), laid along its course at an even, slightly jittered spacing. The blood's distance D (the same
// stream the chevrons ride, blood/streams.ts: the engine's flow, time-averaged, its direction held through a reversal) slides the whole row along the course; the row wraps at the
// ends, so a cell that leaves a vessel's end comes back at its start. A reversed flow runs D backwards, so the row runs backwards; no flow stands the row still. How many of the
// slots show follows the flow: slot j shows when the flow's share of the vessel's design flow passes its thinning rank (a van der Corput order, so any share leaves an even spread).

/** Samples along a vessel's course in the course texture (the shader interpolates between two of them). */
export const CELL_SAMPLES = 64;
/** Rows of the edge texture (one texel per vessel in each). */
export const EDGE_ROWS = 5;
/** Tube segments round a vessel (tubes.ts RADIAL): vertices per ring is one more (the seam repeats). */
export const TUBE_RADIAL = 14;

/** The hard cap on cells drawn at once, desktop and phone (owner's ask: 1500 to 3000 on a desktop, about half on a phone). */
export const CELL_CAP = { desktop: 2400, phone: 1200 } as const;
export const cellCap = (phone: boolean): number => (phone ? CELL_CAP.phone : CELL_CAP.desktop);

/** A vessel whose tube is under this radius (2D units) carries no cells at all (a hairline: a cell would be wider than the tube). */
export const MIN_RADIUS = 2;
/** The fewest cells a drawn vessel keeps in its row, so a small vein still shows moving blood. */
export const MIN_PER_EDGE = 2;

/** The figure's units to a scene unit: the vessels' lengths and radii are held in the 2D figure's units (a scene length times this). */
export const UNITS = 300;
export { STREAK, laneSpeed, lanesFor };
/** The design flow of a vessel as a multiple of its resting flow: the flow at which all its slots show. */
export const DESIGN_HEADROOM = 1.5;
/** The flow below which a vessel counts as not flowing (flow.ts markSpeed: 0.05 mL/s). */
export const NO_FLOW = 0.05;


/** The flow (mL/s) at which a vessel shows all its slots, from its resting flow in the topology. */
export const designFlow = (restQ: number): number => DESIGN_HEADROOM * Math.max(Math.abs(restQ), 1);

export interface BudgetEdge {
  /** the flow all slots show at (designFlow) */
  flow: number;
  /** length of the course, 2D units */
  length: number;
  /** tube radius, 2D units */
  radius: number;
}

/** The most cells a vessel's tube holds: cells in a row 1.7 diameters apart, one to three rows across (never fewer than the minimum). 0 for a hairline or a vessel with no flow or length. */
export function edgeCapacity(e: BudgetEdge): number {
  if (!(e.flow > 0) || !(e.length > 0) || e.radius < MIN_RADIUS) return 0;
  const rows = lanesFor(e.radius);
  const gap = Math.max(STREAK.LEN_OF_R * e.radius * 1.4, 6);   // (a streak and the clear stretch behind it)
  return Math.max(MIN_PER_EDGE, Math.floor(e.length / gap) * rows);
}

/**
 * How many slots each vessel gets, `edges` in the engine's order (0 for a vessel that carries none): the cells of a vessel are proportional to its flow, each vessel keeps at least
 * MIN_PER_EDGE and at most what its tube holds, and the sum never passes `total` (the hard cap). Whatever a full tube cannot take goes to the others, by flow.
 */
export function particleBudget(edges: readonly BudgetEdge[], total: number): number[] {
  const cap = edges.map(edgeCapacity);
  const out = cap.map((c) => Math.min(c, MIN_PER_EDGE));
  let used = out.reduce((a, b) => a + b, 0);
  if (used > total) {
    // not even the minimum for everyone: the biggest flows keep theirs
    out.fill(0); used = 0;
    for (const i of edges.map((_, k) => k).filter((k) => cap[k]! > 0).sort((a, b) => edges[b]!.flow - edges[a]!.flow)) {
      const n = Math.min(MIN_PER_EDGE, total - used);
      if (n <= 0) break;
      out[i] = Math.min(n, cap[i]!); used += out[i]!;
    }
    return out;
  }
  // water-filling by flow on what is left: a vessel that its share would overfill takes what its tube holds, and the rest is shared again among the others
  let open = edges.map((_, k) => k).filter((k) => out[k]! < cap[k]!);
  let left = total - used;
  for (let guard = 0; guard < 64 && open.length && left > 0; guard++) {
    const w = open.reduce((a, k) => a + edges[k]!.flow, 0);
    const full = open.filter((k) => out[k]! + (left * edges[k]!.flow) / w >= cap[k]!);
    if (!full.length) {
      // every share fits: floor each, then the largest remainders take the cells that are left
      const share = open.map((k) => ({ k, x: (left * edges[k]!.flow) / w }));
      for (const s of share) { const n = Math.floor(s.x); out[s.k]! += n; left -= n; }
      share.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || edges[b.k]!.flow - edges[a.k]!.flow);
      for (const s of share) { if (left <= 0) break; if (out[s.k]! < cap[s.k]!) { out[s.k]!++; left--; } }
      break;
    }
    for (const k of full) { left -= cap[k]! - out[k]!; out[k] = cap[k]!; }
    open = open.filter((k) => !full.includes(k));
  }
  return out;
}

// ---- the slots of a vessel ----

/** The van der Corput radical inverse of j in base 2 (0, .5, .25, .75, .125 ...): the order the slots of a vessel thin out in, so the shown ones are always spread evenly. */
export function thinOrder(j: number): number {
  let n = j, f = 0.5, r = 0;
  while (n > 0) { if (n & 1) r += f; n >>= 1; f *= 0.5; }
  return r;
}

/** A fixed pseudo-random number in [0, 1) from two integers (the same on every device and every load). */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface CellLayout {
  /** per cell: edge index, phase along the course (0 to 1), thinning order (0 to 1) */
  place: Float32Array;
  /** per cell: slots on its vessel, lateral place across the tube (-1 to 1), size jitter (0 to 1), a second hash (0 to 1) */
  extra: Float32Array;
  count: number;
}

/** The cells of every vessel, `counts` per edge: an even row along the course with a jitter of up to a quarter of the gap, the thinning order, and a lateral place spread by the golden ratio. */
export function layoutCells(counts: readonly number[]): CellLayout {
  const count = counts.reduce((a, b) => a + b, 0);
  const place = new Float32Array(count * 3), extra = new Float32Array(count * 4);
  let at = 0;
  counts.forEach((n, e) => {
    for (let j = 0; j < n; j++, at++) {
      place[at * 3] = e;
      place[at * 3 + 1] = (j + 0.5 + (hash2(e, j) - 0.5) * 0.5) / n;
      place[at * 3 + 2] = thinOrder(j);
      extra[at * 4] = n;
      extra[at * 4 + 1] = (Math.floor(((j * 0.6180339887 + hash2(j, e) * 0.2) % 1) * STREAK.LANES) - (STREAK.LANES - 1) / 2) / ((STREAK.LANES - 1) / 2);   // a lane: -1, -2/3 ... 1
      extra[at * 4 + 2] = hash2(e + 977, j);
      extra[at * 4 + 3] = hash2(e + 31, j + 4001);
    }
  });
  return { place, extra, count };
}

// ---- where a cell is, and whether it shows (the shader's rules, in numbers, so a test can hold them) ----

/** A cell's place along its course, 0 to 1: its phase carried along by the blood's distance D (2D units) over the course's length. Wraps at both ends; D going down runs it backwards. */
export function cellArc(phase: number, D: number, length: number): number {
  const x = phase + D / length;
  return x - Math.floor(x);
}

/** The share of a vessel's design flow the flow is, 0 to 1. */
export const flowShare = (q: number, design: number): number => Math.min(1, Math.max(0, Math.abs(q) / Math.max(design, 1e-3)));

/** How much of a cell shows (0 to 1): its thinning order against the flow's share, over one slot's width of share, so a rising flow brings cells in one by one and a falling one takes them out. */
export const slotShown = (share: number, order: number, slots: number): number => Math.min(1, Math.max(0, (share - order) * slots));

/** A cell fades in and out over `edge` 2D units at each end of its course (the wrap never pops): 0 at the ends, 1 inside. */
export function endFade(u: number, length: number): number {
  const e = Math.max(10, 0.06 * length), s = u * length;
  const sm = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  return sm(s / e) * (1 - sm((s - (length - e)) / e));
}

/** The width a tube has at `u` as a share of its own radius (tubes.ts factorAt, the run-on taper). */
export function taperAt(t: readonly [number, number] | undefined, u: number): number {
  if (!t) return 1;
  const sm = (x: number) => x * x * (3 - 2 * x);
  return u < 0.3 ? t[0] + (1 - t[0]) * sm(u / 0.3) : u > 0.7 ? 1 + (t[1] - 1) * sm((u - 0.7) / 0.3) : 1;
}

// ---- reading the centre line out of a tube ----

/** The centre of each ring of a tube's vertices (rings of `radial + 1`, the first ring at vertex 0): the mean of the ring's distinct vertices, which is the course's own point there. */
export function ringCentres(position: ArrayLike<number>, segments: number, radial = TUBE_RADIAL): Float32Array {
  const out = new Float32Array((segments + 1) * 3), ring = radial + 1;
  for (let k = 0; k <= segments; k++) {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < radial; j++) { const i = (k * ring + j) * 3; x += position[i]!; y += position[i + 1]!; z += position[i + 2]!; }
    out[k * 3] = x / radial; out[k * 3 + 1] = y / radial; out[k * 3 + 2] = z / radial;
  }
  return out;
}

/** `pts` (n points of xyz, even in arc length) taken to `m` points, by straight interpolation. */
export function resample(pts: ArrayLike<number>, m = CELL_SAMPLES): Float32Array {
  const n = pts.length / 3, out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const f = n > 1 ? (i / (m - 1)) * (n - 1) : 0, a = Math.min(n - 1, Math.floor(f)), b = Math.min(n - 1, a + 1), t = f - a;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = pts[a * 3 + c]! + (pts[b * 3 + c]! - pts[a * 3 + c]!) * t;
  }
  return out;
}

// ---- the data rows (flat Float32Array, `rows` of `n` texels of 4; the texture is `n` wide) ----

export interface EdgeStatic {
  /** course length, 2D units */
  length: number;
  /** tube radius, scene units, at the diameter the vessel was built at */
  radius: number;
  baseD: number;
  design: number;
  /** 0 vessel by diameter, 1 artery, 2 fixed (network.ts widthKind) */
  widthKind: number;
  /** 0 portal, 1 systemic, 2 artery */
  tone: number;
  taper?: readonly [number, number];
  /** how much of the vessel shows through the organs it lies behind (1 in front) */
  veil: number;
}
export interface EdgeLive {
  /** the draw-on's reach along the course (0 to 1) */
  reveal: number;
  /** 0 when the vessel is not drawn (retracted, a dotted thread) */
  visible: number;
  /** the tip fade: mode (0 none, 1 to 4 as fades.ts), its (from, to, alpha at from, alpha at to) and its line */
  fadeMode: number;
  fadeA: [number, number, number, number];
  fadeLine: [number, number, number, number];
}
const at = (row: number, n: number, e: number): number => (row * n + e) * 4;

export function writeEdgeStatic(out: Float32Array, n: number, e: number, s: EdgeStatic): void {
  let i = at(0, n, e);
  out[i] = s.length; out[i + 1] = s.radius; out[i + 2] = s.baseD; out[i + 3] = s.design;
  i = at(1, n, e);
  out[i] = s.widthKind + 4 * s.tone; out[i + 1] = s.taper?.[0] ?? 1; out[i + 2] = s.taper?.[1] ?? 1; out[i + 3] = s.veil;
}
/** Writes a vessel's live rows (3 and 4 are the fade's line and (2) its numbers; row 4 the reveal, visibility and mode). True when anything changed. */
export function writeEdgeLive(out: Float32Array, n: number, e: number, l: EdgeLive): boolean {
  let changed = false;
  const put = (i: number, a: number, b: number, c: number, d: number) => {
    if (out[i] !== a) { out[i] = a; changed = true; }
    if (out[i + 1] !== b) { out[i + 1] = b; changed = true; }
    if (out[i + 2] !== c) { out[i + 2] = c; changed = true; }
    if (out[i + 3] !== d) { out[i + 3] = d; changed = true; }
  };
  put(at(2, n, e), l.fadeA[0], l.fadeA[1], l.fadeA[2], l.fadeA[3]);
  put(at(3, n, e), l.fadeLine[0], l.fadeLine[1], l.fadeLine[2], l.fadeLine[3]);
  put(at(4, n, e), l.reveal, l.visible, l.fadeMode, 0);
  return changed;
}
/** The length of a vessel (2D units) after it reshaped; the shader reads it from row 0. True when it changed. */
export function writeEdgeLength(out: Float32Array, n: number, e: number, length: number): boolean {
  const i = at(0, n, e);
  if (Math.abs(out[i]! - length) < 1e-4) return false;
  out[i] = length; return true;
}
/** One vessel's course into the course texture's rows (width CELL_SAMPLES, one row a vessel). */
export function writeCourse(out: Float32Array, e: number, pts: ArrayLike<number>, m = CELL_SAMPLES): void {
  for (let i = 0; i < m; i++) { const o = (e * m + i) * 4; out[o] = pts[i * 3]!; out[o + 1] = pts[i * 3 + 1]!; out[o + 2] = pts[i * 3 + 2]!; out[o + 3] = 0; }
}

// ---- when the layer is on ----

export interface CellsContext {
  /** Settings > Figure depth > Blood streaks */
  on: boolean;
  /** the viewer asked for less motion: the cells are not drawn at all (a still scatter of dots would read as noise, and the chevrons already show the direction) */
  reduceMotion: boolean;
  view: 'body' | 'circuit' | 'lobule' | 'sinusoid';
  /** a procedure is on the figure: no streaks while it runs */
  quiet?: boolean;
}
/** Whether the layer wants to be showing: on, motion allowed, and the body is the view (the Circuit, the lobule and the sinusoid have their own blood). */
export const cellsWanted = (c: CellsContext): boolean => c.on && !c.reduceMotion && c.view === 'body' && !c.quiet;

/** Eases `amount` toward `goal` (0 or 1) over `ms`. */
export function easeAmount(amount: number, goal: number, dtMs: number, ms = 240): number {
  const k = Math.min(1, Math.max(0, dtMs) / ms);
  return Math.abs(goal - amount) <= k ? goal : amount + Math.sign(goal - amount) * k;
}
