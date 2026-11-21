// The bars and chips that float over the Circuit's canvas (the bottom dock and its view pill, the top bar's chips, the zoom pill), as boxes the captions keep clear of: a name never
// stands half under the view pill (phone, 20 Nov 2026: "Splenic vein" behind the Circuit / Anatomy / Lobule pill). Read once the layout has settled and again when it changes, never in a frame.
// Only what is painted and small counts: a hidden bar (its own or an ancestor's opacity, visibility, `hidden` or `inert`), a layer that covers a big share of the screen, or a card (the cards
// are the plan's own blockers) must never wall off a whole side of the map (20 Nov 2026: every left-hand name of the Circuit was gone on a Mac).
import { readBox, readStyle } from '../../ui/tests/dock/layout-snap.ts';
import type { Box } from '../labels/geometry.ts';

export const UI_WALLS = '.float-ui, .stage-blocker, .vdock, .nb-views, .zoom-pill, .lb-key-wrap';
/** Breathing room kept round each, px. */
export const UI_WALL_PAD = 4;
/** The most a wall may cover of the screen (area), and of either side: a bigger one is a layer or a card, not a chip. */
export const UI_WALL_MAX_AREA = 0.12;
export const UI_WALL_MAX_SIDE = 0.6;

/** Painted now: no ancestor hides it (display, visibility, opacity, `hidden`, `inert`). */
export function painted(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false;
  for (let n: HTMLElement | null = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = readStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
  }
  return true;
}

/** Whether a wall of this size is a chip (kept) or a layer/card (left to the plan's own blockers). */
export function isChip(w: number, h: number, vw: number, vh: number): boolean {
  if (w < 2 || h < 2) return false;
  if (h <= 96 && w <= vw + 0.5) return true;   // (a bar across the top or the foot)
  return w * h <= UI_WALL_MAX_AREA * vw * vh && w <= vw * UI_WALL_MAX_SIDE + 0.5;
}

export function readUiWalls(root: ParentNode = document, vw = innerWidth, vh = innerHeight): Box[] {
  const out: Box[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(UI_WALLS)) {
    const r = readBox(el);
    if (!isChip(r.width, r.height, vw, vh)) continue;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    if (!painted(el)) continue;
    out.push({ x0: r.left - UI_WALL_PAD, y0: r.top - UI_WALL_PAD, x1: r.right + UI_WALL_PAD, y1: r.bottom + UI_WALL_PAD });
  }
  return out;
}
