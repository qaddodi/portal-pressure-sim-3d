// The slot table (menu unification, stage 0: reports/menu-unification.md 3.2): which open panels a panel coming up puts away. One pure rule for every panel, in place of the
// hand-written subscriptions that lived in action/boot.ts (Treat against Tests, Treat against a selection, Treat against a list of shell sheets).
//   sheet mode (the thumb dock is up): one panel at a time, left and right columns alike, because every panel is a sheet over the same dock.
//     The one exception: the action card and the Tests card share the foot, because a tap on a structure while Tests is up chooses what Tests reads (tests/from-orders.ts, Tests > IR).
//   float mode (a wide screen): the right column holds up to two panels side by side, any two of Tests, Treat, History, Compare and Why, when both fit and leave the figure
//     its 400 px (panel-place.ts fitsTogether, passed in as `fits`); otherwise one. Opening another puts away the one opened longest ago (`openNow` is oldest first: wire.ts usePanelOrder).
//     The full-width timeline chart fills the column alone. The left column (the action card) is never put away by a right-hand panel and puts none away.
//     (Coordinator, 27 Nov, from the owner's Mac report: History opened beside Tests stood behind it and put Treat away; History and Treat would not stand together.)
// Menus and dialogs are not in this table: opening one never puts a panel away (a menu stands over it and goes when you have chosen).
// The case's stop card belongs to the case and is not in the table either.
// Pure: no DOM, no stores, so a node test runs the whole table (tests/panel-slots.test.ts).
import type { SurfaceMode } from './mode.ts';
import type { PanelId } from './kinds.ts';
import { SURFACES } from './kinds.ts';

/** The panels the slot rule governs. */
export const SLOT_PANELS = ['tests', 'treat', 'history', 'compare', 'why', 'timeline', 'action'] as const satisfies readonly PanelId[];
export type SlotPanel = (typeof SLOT_PANELS)[number];

/** Pairs that share a sheet slot's foot (both up at once in sheet mode), with the reason in the header. */
const SHARE_FOOT: ReadonlySet<string> = new Set(['action|tests', 'tests|action']);

/** Whether these right-column panels (oldest first) stand side by side on this screen. */
export type ColumnFits = (column: readonly SlotPanel[]) => boolean;

const inRight = (p: SlotPanel): boolean => SURFACES[p].column === 'right' || SURFACES[p].column === 'full';

/** The panels that `opened` coming up puts away, given what is open now, oldest first (the opened one is never in the answer). */
export function putsAway(opened: SlotPanel, openNow: Iterable<SlotPanel>, mode: SurfaceMode, fits: ColumnFits = () => true): SlotPanel[] {
  const now = [...openNow].filter((p) => p !== opened);
  if (mode === 'sheet') return now.filter((p) => !SHARE_FOOT.has(`${opened}|${p}`));
  // float: only the right column (and the full-width chart) competes
  if (!inRight(opened)) return [];
  const right = now.filter(inRight);
  if (SURFACES[opened].column === 'full') return right;
  const out: SlotPanel[] = right.filter((p) => SURFACES[p].column === 'full');
  const col = right.filter((p) => SURFACES[p].column === 'right');
  col.push(opened);
  // (the oldest goes first, until what is left fits: two at most, and two only when both fit)
  while (col.length > 2 || (col.length === 2 && !fits(col))) out.push(col.shift()!);
  return out;
}
