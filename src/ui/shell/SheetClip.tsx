import type { ReactNode } from 'react';

/** The one box every phone sheet stands in (owner, 23 Nov: "never appear under the timeline bar"). It is as big as the screen, never moves, and on the thumb dock clips what is in it at the dock's top edge (menu-motion.css
 *  `.sh-clip`), so a sheet at rest, coming in, leaving or pulled with a finger tucks behind the timeline bar and is never drawn below it. Each sheet kind is mounted in one: the menus and shell sheets (`data-clip="sheets"`,
 *  Sheets.tsx), the Tests card (TestsLayer.tsx) and the cards that wear the 2D sheets (InApp.tsx). A sheet is never given a clip of its own. */
export function SheetClip({ id, children }: { id: 'sheets' | 'tests' | 'cards'; children: ReactNode }) {
  return <div className="sh-clip" data-clip={id}>{children}</div>;
}
/** Where the menus that are mounted only while open are put (Menu.tsx, UMenu.tsx). */
export const sheetRoot = (): Element | null => (typeof document === 'undefined' ? null : document.querySelector('.sh-clip[data-clip="sheets"]') ?? document.querySelector('.sh-root'));
