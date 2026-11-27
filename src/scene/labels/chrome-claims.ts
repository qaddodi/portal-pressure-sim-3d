// The room the app's own chrome takes on the figure, as boxes in canvas px: ONE list every writer of words on the figure keeps off (the Anatomy's station names, the Circuit's captions, the
// Lobule's names,
// the figure's slide cards and the probes' labels). Before 26 Nov each writer built its own list: the Circuit's and the Lobule's had no Tests card, and none had a playing case's stop card,
// its sheet or its bar,
// so names stood under them (capture 0bc14020: "Splenic vein" and "Portal vein" under the stop card, "Right hepatic vein" under the Tests card, half numbers above the case bar, "Portal vein
// 19" cut by the sheet).
// Two kinds of box, one list:
//  - numbers the UI already publishes (chromeBoxes, pure): the Tests card, the case's stop card at the left of a Mac or its sheet over the foot, and the foot the case bar stands in;
//  - the painted chips read at rest (scene/circuit/ui-walls.ts readUiWalls): the view pill, the zoom pill, the top bar's chips, the dock and the figure's key.
// Written by the shell (ui/shell/chrome-claims-writer.ts) when any of them changes; a writer reads `chromeClaims.boxes` when it solves and listens to `subscribe` to place again at rest.
import type { DeviceClass, Rect, Viewport } from '../../ui/layout/device.ts';
import type { CaseCut } from '../../ui/case/room.ts';
import { dockHeight, dockInset, topBarH } from '../../ui/shell/room.ts';
import type { TestsPlace } from '../../ui/tests/place.ts';
import type { Box } from './geometry.ts';

/** The stop card's top, under the top bar (case.css `.cs-card { top: calc(var(--top-safe) + 8px) }`). */
export const CASE_CARD_TOP_GAP = 8;
/** How far the card on the way reaches down from the stop card's top (case.css `.cs-passing`: 104 px down, 96 px high): while it shows, the column is at least this tall. */
export const CASE_TRAVEL_H = 200;

export interface ChromeIn {
  vp: Viewport;
  /** The layout class the shell sums the foot in (shell/room.ts layoutClass). */
  d: DeviceClass;
  /** The case bar is up (a stop or the way between): it stands in the play bar's place, so the foot is what it takes. */
  caseUp: boolean;
  /** The room the case's cards leave the figure (case/room.ts), and the height of the card standing at the left of a Mac. */
  cut: CaseCut | null;
  cardH: number;
  tests: TestsPlace | null;
  /** History's panel while it stands beside the figure (history/room.ts): a wall the names keep off. */
  panel?: Rect | null;
}

const boxOf = (r: Rect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

/** What the app's own cards and bars take of the figure, from numbers alone (pure: node judges it). */
export function chromeBoxes(i: ChromeIn): Box[] {
  const { vp } = i, out: Box[] = [];
  const left = vp.safe.left, right = vp.w - vp.safe.right;
  if (i.tests && i.tests.rect.w > 0 && i.tests.rect.h > 0) out.push(boxOf(i.tests.rect));
  if (i.panel && i.panel.w > 0 && i.panel.h > 0) out.push(boxOf(i.panel));
  if (i.cut?.kind === 'left' && i.cardH > 0) {
    const top = vp.safe.top + topBarH(vp, i.d);
    out.push({ x0: left, y0: top, x1: Math.max(left, i.cut.x), y1: top + CASE_CARD_TOP_GAP + i.cardH });
  } else if (i.cut?.kind === 'foot') {
    out.push({ x0: left, y0: i.cut.y, x1: right, y1: vp.h });
  }
  if (i.caseUp) {
    // the bar stands in the dock's row (shell/room.ts dockHeight adds its lift), the one foot every sum reads; nothing of the figure's words stands from its top edge to the screen's
    out.push({ x0: left, y0: vp.h - vp.safe.bottom - dockInset(i.d) - dockHeight(i.d), x1: right, y1: vp.h });
  }
  return out.filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
}

let boxes: readonly Box[] = [];
const subs = new Set<() => void>();
const key = (b: readonly Box[]) => b.map((x) => `${Math.round(x.x0)},${Math.round(x.y0)},${Math.round(x.x1)},${Math.round(x.y1)}`).join(';');

export const chromeClaims = {
  /** The boxes the app's chrome stands in now. */
  get boxes(): readonly Box[] { return boxes; },
  /** Written by the shell; a list that has not moved a pixel changes nothing, a change tells the listeners (the words place again at rest). */
  set(next: readonly Box[]): void {
    if (key(next) === key(boxes)) return;
    boxes = next.slice();
    for (const f of subs) f();
  },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
