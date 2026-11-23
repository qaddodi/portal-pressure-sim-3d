// What a card's instruments WANT (Plan 43). A picture held to the room its card leaves it (the profile, the curves, the plane...) writes the height it wanted on its box (`data-want-h`, charts/painter.ts, from
// Frame.want). The card's own measured height is then the height of a squeezed card; the pair is judged by what the card would be at the instruments' wanted heights, so the title steps first (2D's order)
// before a chart is ever squeezed. Pure on the numbers it is handed; `heldBy` reads the boxes.
import { fitOf, scaleOf } from '../charts/fit.ts';

export interface WantBox { /** the height the chart wants, in its own px */ want: number; /** the box's rect height, screen px */ rectH: number; /** the zoom the box lives under (the card's fit) */ fit: number; /** a transform scale on the card (a card zoom) */ scale: number }

/** How much taller the card would stand at its pictures' wanted heights, in the card's own measure (the px its height is read in: the rect over the transform scale, under the card's fit). 0 for a picture that is not held. */
export function heldPx(boxes: readonly WantBox[]): number {
  let sum = 0;
  for (const b of boxes) {
    if (!(b.want > 0) || !(b.fit > 0) || !(b.scale > 0)) continue;
    sum += Math.max(0, b.want * b.fit - b.rectH / b.scale);
  }
  return Math.round(sum);
}

/** The boxes under `root` that wear a want, read now. */
export function heldBy(root: HTMLElement): number {
  const boxes: WantBox[] = [];
  for (const e of root.querySelectorAll<HTMLElement>('[data-want-h]')) {
    const want = parseFloat(e.dataset.wantH ?? '');
    if (want > 0) boxes.push({ want, rectH: e.getBoundingClientRect().height, fit: fitOf(e), scale: scaleOf(e) });
  }
  return heldPx(boxes);
}

/** How many charts under `root` have not drawn once yet (Chart.tsx marks a host `data-built` after its first frame). A card waits to come in until this is 0, so no chart reaches its box while the card slides in. */
export const openCharts = (root: HTMLElement): number => root.querySelectorAll('[data-chart]:not([data-built])').length;
