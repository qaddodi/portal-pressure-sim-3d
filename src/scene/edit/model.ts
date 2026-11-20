// Edit shapes (a builder's tool, hidden behind Settings > Edit shapes, shown with ?edit in the address). Pure data and maths: the edits are kept apart from the shape data
// (frame2d.ts, vessels/paths.copied.ts, organs/z.ts) and applied over it; with the mode off nothing here runs and nothing is read.
//   vessel  `pts`: the course in 2D units (x right, y down, 1400 x 1000), rewritten at the handles; `dz`: scene units added to the vessel's tier depth (TIER_Z)
//   organ   `dx`, `dy`, `dz`: scene units added to the organ's placement (ORGAN_Z is its depth)
export type P2 = readonly [number, number];
export interface VesselEdit { pts: P2[]; dz: number }
export interface OrganEdit { dx: number; dy: number; dz: number }
export interface Edits { vessels: Record<string, VesselEdit>; organs: Record<string, OrganEdit> }

export const emptyEdits = (): Edits => ({ vessels: {}, organs: {} });

/** How many handles a vessel gets: one about every 60 2D units of its length, 2 to 9 (a short branch is two, the long trunks nine). */
export function handleIndices(pts: readonly P2[]): number[] {
  const n = pts.length;
  if (n < 2) return [0];
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const k = Math.max(2, Math.min(9, Math.round(len / 60) + 1));
  const out: number[] = [];
  for (let j = 0; j < k; j++) out.push(Math.round((j * (n - 1)) / (k - 1)));
  return out.filter((v, i) => i === 0 || v !== out[i - 1]);
}

/** Moves handle `h` (an index into `idx`) to (x, y): its sample goes there and the samples between it and the neighbouring handles follow by a linear share, so the course stays smooth. The ends stay where they are
 *  unless they are the handle itself. Returns a new array. */
export function moveHandle(pts: readonly P2[], idx: readonly number[], h: number, x: number, y: number): P2[] {
  const out = pts.map((p): P2 => [p[0], p[1]]);
  const at = idx[h]!, dx = x - pts[at]![0], dy = y - pts[at]![1];
  const lo = h > 0 ? idx[h - 1]! : at, hi = h < idx.length - 1 ? idx[h + 1]! : at;
  for (let i = lo; i <= hi; i++) {
    const w = i <= at ? (at === lo ? 1 : (i - lo) / (at - lo)) : (hi === at ? 1 : (hi - i) / (hi - at));
    out[i] = [pts[i]![0] + dx * w, pts[i]![1] + dy * w];
  }
  return out;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** What Copy puts on the clipboard: only what changed, rounded (JSON, so it can be pasted into a message and committed as the new source shapes). */
export function exportEdits(e: Edits): string {
  const vessels: Record<string, { pts: [number, number][]; dz: number }> = {};
  for (const [id, v] of Object.entries(e.vessels)) vessels[id] = { pts: v.pts.map(([x, y]): [number, number] => [r1(x), r1(y)]), dz: r3(v.dz) };
  const organs: Record<string, OrganEdit> = {};
  for (const [id, o] of Object.entries(e.organs)) organs[id] = { dx: r3(o.dx), dy: r3(o.dy), dz: r3(o.dz) };
  return JSON.stringify({ kind: 'pps3d-edit-shapes', v: 1, vessels, organs }, null, 1);
}

/** Reads a saved or pasted edit; anything malformed is dropped (never throws). */
export function parseEdits(raw: string | null): Edits {
  const out = emptyEdits();
  try {
    const o = JSON.parse(raw ?? '{}') as { vessels?: Record<string, { pts?: unknown; dz?: unknown }>; organs?: Record<string, { dx?: unknown; dy?: unknown; dz?: unknown }> };
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    for (const [id, v] of Object.entries(o.vessels ?? {})) {
      if (!Array.isArray(v.pts) || !v.pts.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))) continue;
      out.vessels[id] = { pts: (v.pts as [number, number][]).map(([x, y]): P2 => [x, y]), dz: num(v.dz) ? v.dz : 0 };
    }
    for (const [id, v] of Object.entries(o.organs ?? {})) out.organs[id] = { dx: num(v.dx) ? v.dx : 0, dy: num(v.dy) ? v.dy : 0, dz: num(v.dz) ? v.dz : 0 };
  } catch { /* nothing saved */ }
  return out;
}
