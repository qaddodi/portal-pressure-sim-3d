// The bars and chips that float over the Circuit's canvas (the bottom dock and its view pill, the top bar's chips, the zoom pill, a card), as boxes the captions keep clear of: a name never
// stands half under the view pill (phone, 20 Nov 2026: "Splenic vein" behind the Circuit / Anatomy / Lobule pill). Read once the layout has settled and again when it changes, never in a frame.
import { readBox, readStyle } from '../../ui/tests/dock/layout-snap.ts';
import type { Box } from '../labels/geometry.ts';

export const UI_WALLS = '.float-ui, .stage-blocker, .vdock, .nb-views, .zoom-pill';
/** Breathing room kept round each, px. */
export const UI_WALL_PAD = 4;

export function readUiWalls(root: ParentNode = document, vw = innerWidth, vh = innerHeight): Box[] {
  const out: Box[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(UI_WALLS)) {
    const r = readBox(el);
    if (r.width < 2 || r.height < 2 || (r.width >= vw * 0.98 && r.height >= vh * 0.9)) continue;   // (not a layer that covers the whole screen)
    const cs = readStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    out.push({ x0: r.left - UI_WALL_PAD, y0: r.top - UI_WALL_PAD, x1: r.right + UI_WALL_PAD, y1: r.bottom + UI_WALL_PAD });
  }
  return out;
}
