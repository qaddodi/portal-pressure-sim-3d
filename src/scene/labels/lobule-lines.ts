// The courses the lobule draws (sinusoids, cross-links, inlets, twigs) as they stand on the canvas now, for the writers that must keep clear of them:
// the slide's ring callout (figure-cards.ts) stands its words in the brown between the vessels, not on them. Written by the lobule's names
// (LobuleCaptions, which already projects every course for its own solver) when they are placed, emptied when the lobule is not the figure.
// The same shape as callout-claims.ts, the other way round: the callout reads the lines, the names read the callout's boxes.
export type CourseLine = readonly [number, number, number, number];

let lines: readonly CourseLine[] = [];
let key = '0';
const subs = new Set<() => void>();
/** A cheap signature of a set of lines: how many, and the sum of their ends (rounded), so a moved picture differs. */
const keyOf = (l: readonly CourseLine[]): string => {
  let s = 0;
  for (const x of l) s += x[0] + x[1] * 3 + x[2] * 7 + x[3] * 11;
  return `${l.length}:${Math.round(s)}`;
};

export const lobuleLines = {
  get lines(): readonly CourseLine[] { return lines; },
  get key(): string { return key; },
  set(next: readonly CourseLine[]): void {
    const k = keyOf(next);
    if (k === key) return;
    lines = next; key = k;
    for (const f of subs) f();
  },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
