// The one place a label's opacity is decided. Nothing else in the app writes a label's alpha or names the dim value
// (tests/labels-dim.test.ts greps for a second copy), so "dim labels are 65 %" is one number.
import { MOTION } from '../../clock/tween.ts';

/** A label the slide does not talk about, while the slide talks about others: 65 % (Mohammad: "dim-label alpha 65%, set in one place"). */
export const DIM_ALPHA = 0.65;

export const FADE = {
  /** A label that goes (it is no longer wanted, or the picture was cut) fades out where it stands in this long, never in one frame and never sliding: 2D's D_SMALL (ease.js), the time of a label's own change of state. */
  outMs: 240,
  /** A label put at another spot, or given other words (a unit, a change badge, a shorter name), crosses over in this long: the old words fade out where they stood while the new fade in where they stand
   *  now, both at once with nothing missing between (2D label-gl.js moveFade: D_SMALL 240 ms, the weights 1 - easeMove(u) and easeMove(u)). */
  moveMs: 240,
  /** A move of this many px or less (dx and dy of the box against its dot) is not a move (2D MOVE_PX): a number's width changing by a pixel never draws the words twice. */
  movePx: 3,
  /** A move this small (px, measured from where the picture last stood, not from the last frame) with the same words, the same spot on its vessel and overlapping boxes is taken at once; any more crosses over. */
  smallPx: 8,
  /** A label that touches a card or the screen's edge fades out whole in this long, and back once it stands clear (2D label-gl.js roomFade, ROOM_MS 160): it is never seen cut. */
  roomMs: 160,
  /** Air kept between a label and a card or the edge before it fades out (px); once out it must stand this clear to come back (2D: 0 while shown, 4 px to return). */
  roomAir: 4,
  /** and comes in at its new spot in this long. */
  inMs: MOTION.tagBackMs,
  /** After the camera (or a card) has stopped moving the picture, labels wait this long before they come back (look-and-feel section 7): never less than the fade-out, so a cut label has gone before it returns at its new spot. */
  settleMs: Math.max(MOTION.tagBackMs, 240 + 32),
  /** Bright to dim and back. */
  dimMs: MOTION.tagBackMs,
} as const;

/** The opacity written to a label: its fade (0..1) times its dimming (0 = bright, 1 = fully dim). */
export const labelOpacity = (fade: number, dim: number): number => fade * (1 - dim * (1 - DIM_ALPHA));
