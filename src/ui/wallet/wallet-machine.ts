// The wallet (iPhone): one card shows, the other waits as a 48 px strip at the foot. A tap on the strip, or a swipe up or down on
// either, swaps them. Pure rules here; the motion itself is two CSS transitions (transform and opacity, 280 ms), so no frame loop.

import type { Slot } from '../layout/plan.ts';
import { EASE_ARRIVE } from '../motion.ts';

export const WALLET_EASE = EASE_ARRIVE;
/** How far (px) a swipe must travel, or how fast (px/ms), before it counts. Under that it is a tap or a slow drag, which does nothing. */
export const SWIPE_MIN_PX = 36;
export const SWIPE_FAST_PX_PER_MS = 0.45;
export const SWIPE_FAST_MIN_PX = 16;

export interface Gesture { dx: number; dy: number; ms: number }

/** Is this finished pointer movement a vertical swipe that swaps the cards? Mostly vertical (twice as far as sideways), and far or fast enough. */
export function isSwapSwipe(g: Gesture): boolean {
  const ay = Math.abs(g.dy), ax = Math.abs(g.dx);
  if (ay < ax * 2) return false;
  if (ay >= SWIPE_MIN_PX) return true;
  return ay >= SWIPE_FAST_MIN_PX && g.ms > 0 && ay / g.ms >= SWIPE_FAST_PX_PER_MS;
}

/** A tap: barely moved and quick. Used for the strip. */
export function isTap(g: Gesture): boolean {
  return Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10 && g.ms < 600;
}

export const other = (s: Slot): Slot => (s === 'words' ? 'data' : 'words');

export interface WalletState { active: Slot; /** counts swaps, so the view can tell "swapped" from "re-rendered" */ swaps: number }
export const walletStart = (active: Slot = 'words'): WalletState => ({ active, swaps: 0 });
export const swap = (s: WalletState): WalletState => ({ active: other(s.active), swaps: s.swaps + 1 });
/** A new slide brings the words back to the front (the learner reads the line first), without counting as a swap. */
export const resetForSlide = (s: WalletState): WalletState => (s.active === 'words' ? s : { active: 'words', swaps: s.swaps });

/** The words on the strip: what the card behind it holds, in a few words ("Pressures · HVPG 12.1 mmHg", "Slide · The wedged pressure…"). */
export function stripLabel(behind: Slot, hvpg: string | null, slideTitle: string): { lead: string; rest: string } {
  return behind === 'data'
    ? { lead: 'Pressures', rest: hvpg ? `HVPG ${hvpg}` : '' }
    : { lead: 'Slide', rest: slideTitle };
}
