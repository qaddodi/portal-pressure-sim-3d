// Where the credit stands in a talk on a wide or short screen (a laptop, a desktop, a tablet on its side): one fixed place in the screen's foot band, under the left edge of the words' card.
// The hunt among the bare figure (Credit.tsx, free play) judged rectangles that were still moving, so on a Mac it landed on figure labels and table rows; a fixed place cannot. Pure: node judges it.
export interface FootIn { vw: number; vh: number; safe: { top: number; right: number; bottom: number; left: number }; /** the credit's line height, px */ h: number; /** the layout's margin (rules2d margin): the cards stand this far from the screen's edge */ margin: number }

/** The credit's top-left corner: the cards' left edge, the line's foot 2 px above the screen's (or its safe area's) bottom. The cards keep `margin` (16 px at least) off that edge, so the line stands in the band under them, at most a few px into their foot padding. */
export function footCredit(i: FootIn): { x: number; y: number } {
  return { x: Math.round(Math.max(i.safe.left, i.margin)), y: Math.round(i.vh - Math.max(i.safe.bottom, 0) - 2 - i.h) };
}
