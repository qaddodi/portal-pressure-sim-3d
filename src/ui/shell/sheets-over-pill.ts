// The sheets that rise over the dock on a phone. 2D marks them `.menu-sheet-open` on .app, and its lifted rule takes the view pill away while one is up (app-10-thumb-dock.css: the pill lies
// above the sheets, in the dock); the 3D sheets are not 2D's `.sheet-layer > .menu`, so nothing said it, and the pill was drawn over the Layers sheet's Labels row. Where every surface is
// a sheet (surface/mode.ts) every menu of the one menu shell (surface/Menu.tsx) rests on the dock: the speed and jump-to menus of the timeline bar had the pill drawn over their foot
// (owner, 24 Nov, "Compare from…" cut by the Circuit/Anatomy/Lobule pill), and the lens, Blood and From readings menus are sheets there too now. So every shell menu is here, with the
// shell's own sheets (History, Compare, Why?, the Guide, the timeline chart, Search). tests/sheet-over-pill.test.ts holds it to surface/kinds.ts.
import { MENU_IDS } from '../surface/menu-head.ts';

export const SHEETS_OVER_PILL: ReadonlySet<string> = new Set([...MENU_IDS, 'search', 'history', 'compare', 'why', 'guide', 'timeline']);
