// The one place a label's opacity is decided. Nothing else in the app writes a label's alpha or names the dim value
// (tests/labels-dim.test.ts greps for a second copy), so "dim labels are 65 %" is one number.
import { MOTION } from '../../clock/tween.ts';

/** A label the slide does not talk about, while the slide talks about others: 65 % (Mohammad: "dim-label alpha 65%, set in one place"). */
export const DIM_ALPHA = 0.65;

export const FADE = {
  /** A label that must change spot or go leaves in this long, linear, where it stands (it never slides). */
  outMs: 120,
  /** and comes in at its new spot in this long. */
  inMs: MOTION.tagBackMs,
  /** After the camera (or a card) has stopped moving the picture, labels wait this long before they come back (look-and-feel section 7). */
  settleMs: MOTION.tagBackMs,
  /** Bright to dim and back. */
  dimMs: MOTION.tagBackMs,
} as const;

/** The opacity written to a label: its fade (0..1) times its dimming (0 = bright, 1 = fully dim). */
export const labelOpacity = (fade: number, dim: number): number => fade * (1 - dim * (1 - DIM_ALPHA));
