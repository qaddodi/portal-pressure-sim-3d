// The one place a label's opacity is decided. Nothing else in the app writes a label's alpha or names the dim value
// (tests/labels-dim.test.ts greps for a second copy), so "dim labels are 65 %" is one number.
import { MOTION } from '../../clock/tween.ts';

/** A label the slide does not talk about, while the slide talks about others: 65 % (Mohammad: "dim-label alpha 65%, set in one place"). */
export const DIM_ALPHA = 0.65;

export const FADE = {
  /** A label that goes (it is no longer wanted, or the picture was cut) leaves in this long, linear, where it stands (it never slides). */
  outMs: 120,
  /** A label put at another spot, or given other words (a unit, a change badge, a shorter name), crosses over in this long: the old words fade out where they stood while the new fade in where they stand
   *  now, both at once with nothing missing between (2D label-gl.js moveFade: D_SMALL 240 ms, the weights 1 - easeMove(u) and easeMove(u)). */
  moveMs: 240,
  /** A move of this many px or less (dx and dy of the box against its dot) is not a move (2D MOVE_PX): a number's width changing by a pixel never draws the words twice. */
  movePx: 3,
  /** A label that touches a card or the screen's edge fades out whole in this long, and back once it stands clear (2D label-gl.js roomFade, ROOM_MS 160): it is never seen cut. */
  roomMs: 160,
  /** Air kept between a label and a card or the edge before it fades out (px); once out it must stand this clear to come back (2D: 0 while shown, 4 px to return). */
  roomAir: 4,
  /** and comes in at its new spot in this long. */
  inMs: MOTION.tagBackMs,
  /** After the camera (or a card) has stopped moving the picture, labels wait this long before they come back (look-and-feel section 7). */
  settleMs: MOTION.tagBackMs,
  /** Bright to dim and back. */
  dimMs: MOTION.tagBackMs,
} as const;

/** The opacity written to a label: its fade (0..1) times its dimming (0 = bright, 1 = fully dim). */
export const labelOpacity = (fade: number, dim: number): number => fade * (1 - dim * (1 - DIM_ALPHA));
