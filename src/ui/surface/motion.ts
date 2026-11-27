// How long each kind of surface takes to leave, by mode (menu unification: reports/menu-unification.md 3.2, "one motion set"). Every shell reads its leave from here, so a
// menu, a panel and a dialog leave the same way wherever they are; the CSS side reads the same tokens (--d-flip, --d-small). Pure, for node tests.
import { D_FLIP, D_SMALL, LEAVE_SLACK_MS } from '../motion.ts';
import type { SurfaceKind } from './kinds.ts';
import type { SurfaceMode } from './mode.ts';

/** The leave's CSS time, ms: a floating menu flips away (--d-flip); a sheet, a panel and a dialog slide or fade over --d-small. */
export const leaveCss = (kind: SurfaceKind, mode: SurfaceMode): number => (kind === 'menu' && mode === 'float' ? D_FLIP : D_SMALL);

/** How long a surface that is unmounted after its leave stays in the page: the leave and a frame or two, so it is never cut short. */
export const leaveMs = (kind: SurfaceKind, mode: SurfaceMode): number => leaveCss(kind, mode) + LEAVE_SLACK_MS;
