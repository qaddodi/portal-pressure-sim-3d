// What a card's instruments WANT (Plan 43). A picture held to the room its card leaves it (the profile, the curves, the plane...) writes the height it wanted on its box (`data-want-gap`, charts/painter.ts, from
// Frame.want). The card's own measured height is then the height of a squeezed card; the pair is judged by what the card would be at the instruments' wanted heights, so the title steps first (2D's order)
// before a chart is ever squeezed. Pure on the numbers it is handed; `heldBy` reads the boxes.
import { fitOf } from '../charts/fit.ts';

export interface WantBox { /** how much taller the chart wants to be than it was drawn, in its own px (the painter writes it with the box's height: no layout read) */ gap: number; /** the zoom the box lives under (the card's fit) */ fit: number }

/** How much taller the card would stand at its pictures' wanted heights, in the card's own measure (the card's height is read under its fit: a gap of g own px is g x fit of them). 0 for a picture that is not held. */
export function heldPx(boxes: readonly WantBox[]): number {
  let sum = 0;
  for (const b of boxes) if (b.gap > 0 && b.fit > 0) sum += b.gap * b.fit;
  return Math.round(sum);
}

/** The boxes under `root` that wear a want gap, read now (the gap is the painter's own number; only the zoom is looked up). */
export function heldBy(root: HTMLElement): number {
  const boxes: WantBox[] = [];
  for (const e of root.querySelectorAll<HTMLElement>('[data-want-gap]')) {
    const gap = parseFloat(e.dataset.wantGap ?? '');
    if (gap > 0) boxes.push({ gap, fit: fitOf(e) });
  }
  return heldPx(boxes);
}

/** How many charts under `root` have not drawn once yet (Chart.tsx marks a host `data-built` after its first frame). A card waits to come in until this is 0, so no chart reaches its box while the card slides in. */
export const openCharts = (root: HTMLElement): number => root.querySelectorAll('[data-chart]:not([data-built])').length;
