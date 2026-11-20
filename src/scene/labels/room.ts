// Where the figure's names may stand: the screen less the top bar, and, with the Tests card up, less the card (the same room the camera frames the figure in: ui/tests/place.ts
// roomWith). The card is also a blocker, so a name never stands under it; the view's edge alone would not do for a card that is inset from the screen's edge.
import type { Viewport } from '../../ui/layout/device.ts';
import type { TestsPlace } from '../../ui/tests/place.ts';
import { rectToBox, type Box } from './geometry.ts';

/** The labels' view: inside the safe area under the bar, and left of (or above) the Tests card when one is up, 8 px clear of it as the camera keeps the figure. */
export function labelView(vp: Viewport, bar: number, place: TestsPlace | null): Box {
  const v: Box = { x0: vp.safe.left, y0: vp.safe.top + bar, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom };
  if (!place) return v;
  const r = place.rect;
  if (place.kind === 'side') v.x1 = Math.max(v.x0 + 1, Math.min(v.x1, r.x - 8));
  else v.y1 = Math.max(v.y0 + 1, Math.min(v.y1, r.y - 8));
  return v;
}

/** The Tests card's box as a blocker (none when it is closed). */
export const placeBlockers = (place: TestsPlace | null): Box[] => (place ? [rectToBox(place.rect)] : []);
