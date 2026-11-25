// Where the credit stands in a talk on a wide or short screen (a laptop, a desktop, a tablet on its side): one fixed place in the screen's foot band, under the left edge of the words' card.
// The hunt among the bare figure (Credit.tsx, free play) judged rectangles that were still moving, so on a Mac it landed on figure labels and table rows; a fixed place cannot. Pure: node judges it.
export interface FootIn { vw: number; vh: number; safe: { top: number; right: number; bottom: number; left: number }; /** the credit's line height, px */ h: number; /** the layout's margin (rules2d margin): the cards stand this far from the screen's edge */ margin: number }

/** The credit's top-left corner: the cards' left edge, the line's foot 2 px above the screen's (or its safe area's) bottom. The cards keep `margin` (16 px at least) off that edge, so the line stands in the band under them, at most a few px into their foot padding. */
export function footCredit(i: FootIn): { x: number; y: number } {
  return { x: Math.round(Math.max(i.safe.left, i.margin)), y: Math.round(i.vh - Math.max(i.safe.bottom, 0) - 2 - i.h) };
}

export interface Box { l: number; t: number; r: number; b: number }
/** Whether the credit's line (its top-left corner `at`, `w` wide, `h` high) stands clear of every box by `gap` px. A phone on its side keeps a card's drawer (the strip of the other card) along the screen's foot,
 *  under the line's own row: the line then stays out of sight (it fades, as 2D's credit.js hides it with no free spot) and never prints over the drawer's words (review a56feaf2, item 12). Pure. */
export function footClear(at: { x: number; y: number }, w: number, h: number, boxes: readonly Box[], gap = 4): boolean {
  return !boxes.some((q) => at.x - gap < q.r && q.l < at.x + w + gap && at.y - gap < q.b && q.t < at.y + h + gap);
}

/** What of a card's content shows: the part of `r` inside the card's own box (a card clips what lies outside it), or null when none of it does. A word or picture that stands outside its card, a chart's hidden
 *  layer or a label parked off the card, is not drawn, so it is not a thing the credit keeps clear of. Root of the missing © on the iPad's chart slides (Circuit 10, Choose treatment 12: the credit judged "covered" with no
 *  card, bar or word anywhere near its foot corner, capture 84496815). Pure; tests/credit-clip-to-card.test.ts. */
export function clipTo(r: Box, within: Box | null): Box | null {
  if (!within) return r;
  const l = Math.max(r.l, within.l), t = Math.max(r.t, within.t), rr = Math.min(r.r, within.r), b = Math.min(r.b, within.b);
  return rr > l && b > t ? { l, t, r: rr, b } : null;
}
