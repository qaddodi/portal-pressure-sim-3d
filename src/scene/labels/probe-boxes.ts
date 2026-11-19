// The boxes the Tests devices keep off where a side allows (2D stage-doppler.js DPR_AVOID): the labels and callouts showing. The label layer writes them each frame it lays labels out (in place, from a pool
// made once, so a frame allocates nothing); the Doppler probe's search reads them (screen.ts `avoid`). Pure data: node judges it.
import type { Box } from '../devices/probes/screen.ts';

const CAP = 64;
const pool: Box[] = [];
for (let i = 0; i < CAP; i++) pool.push({ x0: 0, y0: 0, x1: 0, y1: 0 });
const view: Box[] = [];
let n = 0;

/** Starts a new list (the label layer's frame). */
export function beginLabelBoxes(): void { n = 0; view.length = 0; }
/** Adds one showing label's box (px, on the stage); the ones past the pool's size are left out. */
export function addLabelBox(x: number, y: number, w: number, h: number): void {
  if (n >= CAP) return;
  const b = pool[n++]!;
  b.x0 = x; b.y0 = y; b.x1 = x + w; b.y1 = y + h;
  view.push(b);
}
/** The labels and callouts showing now. */
export const probeAvoid = (): readonly Box[] => view;
