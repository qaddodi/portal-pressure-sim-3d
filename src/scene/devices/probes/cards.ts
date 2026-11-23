// What the Tests devices keep clear of (2D blockers.js BLOCKER_SEL, stage-doppler.js dprCardsRead): the slide's cards (the words, the data card, the wallet's strip), the Tests card, and the bars
// at the top and foot of the figure (the bars are not the figure's: nothing is drawn under them). Each box is grown by 6 px, as the 2D probe grows the cards it reads. The 2D reads the page's boxes
// four times a second; here they are the UI's own numbers (the card layer and the Tests card publish them), so nothing is read from the page.
import { useUi, talkRects } from '../../../ui/ui-store.ts';
import { useTestsRoom } from '../../../ui/tests/room.ts';
import { BAR } from '../../../ui/layout/plan.ts';
import type { Rect } from '../../../ui/layout/device.ts';
import type { Box } from './screen.ts';
import { probeKeyRoom } from '../../labels/probe-boxes.ts';

/** How far the probe keeps off a card, px (2D dprCardsRead: 6). */
export const CARD_PAD = 6;

const box = (r: Rect, m = 0): Box => ({ x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m });

/** The boxes now, in CSS px on the stage. `testsRect` lets a test hand in the Tests card's place. */
export function probeCards(testsRect?: Rect | null): Box[] {
  const u = useUi.getState(), b = u.boxes, vp = u.vp, out: Box[] = [];
  for (const r of talkRects(b)) out.push(box(r, CARD_PAD));
  const t = testsRect === undefined ? useTestsRoom.getState().place?.rect ?? null : testsRect;
  if (t && t.w > 0 && t.h > 0) out.push(box(t, CARD_PAD));
  // the figure's colour key, over the figure at the foot (labels/key-dock.ts): the probe stands clear of it as of a card
  const key = probeKeyRoom();
  if (key) out.push({ x0: key.x0 - CARD_PAD, y0: key.y0 - CARD_PAD, x1: key.x1 + CARD_PAD, y1: key.y1 + CARD_PAD });
  // the bars: the shell's top bar (the figure's room starts under it, as the labels' view does) and the safe area at the foot
  out.push({ x0: -1, y0: -1, x1: vp.w + 1, y1: vp.safe.top + BAR });
  if (vp.safe.bottom > 0) out.push({ x0: -1, y0: vp.h - vp.safe.bottom, x1: vp.w + 1, y1: vp.h + 1 });
  return out;
}
