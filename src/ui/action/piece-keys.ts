// A split vein is one vein to the engine: thrombus, stenosis and stent are read under the vein's own key (`partOf(id)`), never under a piece's. This is the one place
// that says so for saved settings: a shared link, the undo history or a "yours" preset made before a tap on a piece selected the vein may carry a piece key.
import { partOf } from '../../engine/hales/portal/topology.js';
import type { Params } from './params.ts';

const KEYED = ['thrombus', 'stenosis'] as const;

/** The same settings with every piece key of `thrombus` and `stenosis` moved to its vein (the larger value when both are there). Returns `params` itself when nothing moves. */
export function migratePieceKeys(params: Params): Params {
  if (!params || typeof params !== 'object') return params;
  let out: Params = params;
  for (const k of KEYED) {
    const t = params[k] as Record<string, number> | undefined;
    if (!t || typeof t !== 'object' || !Object.keys(t).some((id) => partOf(id) !== id)) continue;
    if (out === params) out = { ...params };
    const moved: Record<string, number> = {};
    for (const [id, v] of Object.entries(t)) { const h = partOf(id); moved[h] = Math.max(moved[h] ?? 0, v || 0); }
    out[k] = moved;
  }
  return out;
}
