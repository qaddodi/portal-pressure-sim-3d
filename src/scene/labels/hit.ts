// Which station's label a tap landed on (2D: stage-label-layer.js blockEl: every station label is a button that opens the structure it stands for, `interactiveNode`;
// an organ's name on the plate is not, and the catheter's cards and the key are not). The label layer is not a pointer target (the figure's gestures own the pointer, so
// a pan that starts on a label still pans): the stage's tap asks here, and a label that is not drawn now, or has faded out, is not hit.
import type { Draw } from './controller.ts';
import { stationById } from './stations.ts';

/** The least a label's opacity may be for a tap to count (a label fading out takes no tap). */
export const HIT_ALPHA = 0.25;
/** A touch's slack round a label's box, px (a label is small type: 2D's button is its text box). */
export const HIT_SLACK = 4;

/** The station (its topology node, as 2D's `it.node`) whose label is under (x, y), the topmost last drawn, or null. */
export function labelNodeAt(out: readonly Draw[], x: number, y: number, slack = HIT_SLACK): string | null {
  for (let i = out.length - 1; i >= 0; i--) {
    const d = out[i]!;
    if (d.kind !== 'station' || d.ghost || d.alpha * d.mix < HIT_ALPHA) continue;
    const st = stationById(d.id);
    if (!st?.node) continue;   // (an organ's name has no node: it is not a button)
    if (x >= d.x - slack && x <= d.x + d.w + slack && y >= d.y - slack && y <= d.y + d.h + slack) return st.node;
  }
  return null;
}

let source: ((x: number, y: number) => string | null) | null = null;
/** The label layer says where its labels stand (bound while it is mounted; returns the remover). */
export function bindLabelHits(f: (x: number, y: number) => string | null): () => void { source = f; return () => { if (source === f) source = null; }; }
/** The station node whose label is at (x, y) on the canvas now, or null (also when no label layer is mounted). */
export const labelAt = (x: number, y: number): string | null => source?.(x, y) ?? null;
