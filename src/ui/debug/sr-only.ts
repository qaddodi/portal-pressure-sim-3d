// ?audit and the screen report: what is on the page only for a screen reader, in one place. Three readers each had their own idea of it (the generic scan, the layout read of a card's words, the screen report's
// texts), and a hidden chart table slipped past two of them: the audit of 21 Nov (iPhone) named about 950 failures (words "cut off", "past the card's edge", "off the screen") that were the captions and cells of
// `table.sr-only`, which no eye sees. A TABLE does not shrink to the 1 px its CSS asks for (a table is as wide as its longest nowrap row), so a test on the box's size alone never matched it; what hides it is the clip.
// Pure: a computed style in, a yes or no out.
export interface SrStyle { position: string; clip: string; clipPath: string; overflow: string; width: string; height: string }

/** The `.sr-only` recipes the app's stylesheets use: out of the flow and clipped to nothing (`clip: rect(0 0 0 0)` or `clip-path: inset(50%)`), or a box of 1 px that clips its overflow. */
export function srOnlyStyle(cs: SrStyle): boolean {
  const clipped = cs.position === 'absolute' && /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)|inset\(50%\)/.test(cs.clip + cs.clipPath);
  return clipped || (cs.overflow === 'hidden' && parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1);
}

/** Whether an element, or any ancestor up to `stop`, is for a screen reader alone. Remembered up the tree for one read. The caller hands in how it reads a style (it already reads them, and layout reads are counted: scripts/layout-read-allowance). */
export function srOnlyMemo(styleOf: (el: Element) => SrStyle, stop?: Element): (el: Element) => boolean {
  const m = new Map<Element, boolean>();
  const f = (el: Element): boolean => {
    const hit = m.get(el); if (hit !== undefined) return hit;
    const up = el !== stop && el.parentElement ? f(el.parentElement) : false;
    const v = up || srOnlyStyle(styleOf(el));
    m.set(el, v); return v;
  };
  return f;
}
