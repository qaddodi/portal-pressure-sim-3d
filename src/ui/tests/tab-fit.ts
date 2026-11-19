// How the Tests tab row fits its width (2D dock.js fitTabs): a wide card shows every full name; under 780 px the short names (.compact); under 520 the name under its icon (.narrow); under 420 (a
// phone's sheet, beside the close button) only the open tab keeps its name (.tight), and where even that would be cut the open tab is an icon too (.bare, "never a cut name"). The 2D reads
// the open tab's own width; here the width comes from a ResizeObserver and the open tab's name is measured by its letters (a 12 px, 600-weight name is about 7.2 px a letter).
export interface TabFit { compact: boolean; narrow: boolean; tight: boolean; bare: boolean }
const ICON_ONLY = 26, LETTER = 7.2, ICON_AND_GAPS = 16 + 16 + 5;

export function fitTabs(w: number, tabs: number, openName: string): TabFit {
  const compact = w < 780, narrow = w < 520, tight = w < 420;
  let bare = false;
  if (tight) {
    const need = (tabs - 1) * ICON_ONLY + ICON_AND_GAPS + openName.length * LETTER + 5 + 2 * (tabs - 1) + 6;
    bare = need > w;
  }
  return { compact, narrow, tight, bare };
}
