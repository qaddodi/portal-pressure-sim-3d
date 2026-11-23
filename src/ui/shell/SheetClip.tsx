import type { ReactNode } from 'react';

/** The one box every phone sheet stands in (owner, 23 Nov: "never appear under the timeline bar"). Its outer box ends at the dock's top edge and clips what is in it by `overflow: clip` (menu-motion.css `.sh-clip`); the inner box is
 *  as big as the screen, so every sheet's own offsets are the screen's. Never `clip-path`, `mask`, `filter` or `opacity` here: each makes a backdrop root, and the glass behind every card and sheet would see nothing to blur (23 Nov: "cards don't have blur"), so a sheet at rest, coming in, leaving or pulled with a finger tucks behind the timeline bar and is never drawn below it. Each sheet kind is mounted in one: the menus and shell sheets (`data-clip="sheets"`,
 *  Sheets.tsx), the Tests card (TestsLayer.tsx) and the cards that wear the 2D sheets (InApp.tsx). A sheet is never given a clip of its own. */
export function SheetClip({ id, children }: { id: 'sheets' | 'tests' | 'cards'; children: ReactNode }) {
  return <div className="sh-clip" data-clip={id}><div className="sh-clip-in">{children}</div></div>;
}
/** Where the menus that are mounted only while open are put (Menu.tsx, UMenu.tsx). */
export const sheetRoot = (): Element | null => (typeof document === 'undefined' ? null : document.querySelector('.sh-clip[data-clip="sheets"] > .sh-clip-in') ?? document.querySelector('.sh-root'));
