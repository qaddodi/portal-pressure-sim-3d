// How long each kind of surface takes to leave, by mode (menu unification: reports/menu-unification.md 3.2, "one motion set"). Every shell reads its leave from here, so a
// menu, a panel and a dialog leave the same way wherever they are; the CSS side reads the same tokens (--d-flip, --d-small). Pure, for node tests.
import { D_FLIP, D_SMALL, LEAVE_SLACK_MS } from '../motion.ts';
import type { SurfaceKind } from './kinds.ts';
import type { SurfaceMode } from './mode.ts';

/** The leave's CSS time, ms: a floating menu flips away (--d-flip); a sheet, a panel and a dialog slide or fade over --d-small. */
export const leaveCss = (kind: SurfaceKind, mode: SurfaceMode): number => (kind === 'menu' && mode === 'float' ? D_FLIP : D_SMALL);

/** How long a surface that is unmounted after its leave stays in the page: the leave and a frame or two, so it is never cut short. */
export const leaveMs = (kind: SurfaceKind, mode: SurfaceMode): number => leaveCss(kind, mode) + LEAVE_SLACK_MS;

// The surfaces' own-pace times: each is deliberately its own pace (no leave or arrival of a surface, which are the tokens above), named once here so no surface file writes a
// millisecond count of its own (lint surface-motion-tokens).
/** own pace: the main menu's row preview beside it comes up when the mouse rests on a row this long, */
export const PREVIEW_REST_MS = 300;
/** own pace: or this long when a preview is already up (the mouse moves from row to row), */
export const PREVIEW_NEXT_MS = 120;
/** own pace: and goes this long after the mouse leaves the row and the preview both. */
export const PREVIEW_HIDE_MS = 220;
/** own pace: a sheet's pull swallows the click its own let-go would make for this long (a pull that ends on a button never presses it). */
export const PULL_CLICK_SWALLOW_MS = 350;
/** own pace: a sheet pulled away waits this long for its own leave to end before it tidies up anyway (a transition that never ends: the tab hidden mid-pull). */
export const PULL_AWAY_FALLBACK_MS = 700;
/** own pace: a done mark on a panel's button (Treat's "Given" on a fluid) stays this long, long enough to be read. */
export const DONE_MARK_MS = 1400;
/** own pace: how often a panel whose words follow the running model reads it again (History's story: today's point and the days ahead). */
export const PANEL_TICK_MS = 500;
