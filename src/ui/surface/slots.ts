// The slot table (menu unification, stage 0: reports/menu-unification.md 3.2): which open panels a panel coming up puts away. One pure rule for every panel, in place of the
// hand-written subscriptions that lived in action/boot.ts (Treat against Tests, Treat against a selection, Treat against a list of shell sheets).
//   sheet mode (the thumb dock is up): one panel at a time, left and right columns alike, because every panel is a sheet over the same dock.
//     The one exception: the action card and the Tests card share the foot, because a tap on a structure while Tests is up chooses what Tests reads (tests/from-orders.ts, Tests > IR).
//   float mode (a wide screen): the right column holds Tests and at most one other panel, which stands beside it (treat/beside.ts); the timeline chart (full width) counts as that
//     other panel. The left column (the action card) is never put away by a right-hand panel.
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

/** The panels that `opened` coming up puts away, given what is open now (the opened one is never in the answer). */
export function putsAway(opened: SlotPanel, openNow: Iterable<SlotPanel>, mode: SurfaceMode): SlotPanel[] {
  const out: SlotPanel[] = [];
  for (const p of openNow) {
    if (p === opened) continue;
    if (mode === 'sheet') { if (!SHARE_FOOT.has(`${opened}|${p}`)) out.push(p); continue; }
    // float: only the right column (and the full-width chart) competes; Tests never gives way and never puts the other away (it stands beside it)
    const a = SURFACES[opened].column, b = SURFACES[p].column;
    if (opened === 'tests' || p === 'tests') continue;
    if ((a === 'right' || a === 'full') && (b === 'right' || b === 'full')) out.push(p);
  }
  return out;
}
