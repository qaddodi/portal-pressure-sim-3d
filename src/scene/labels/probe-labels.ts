// The two readings the Tests devices wear on the figure, as the 2D app draws them. Pure: node judges all of it; probe-labels-dom.ts writes it.
//  - The FibroScan probe's own screen: the live stiffness and "kPa" printed on the display, turned with the probe's body (stage-scan.js `.sp-read`, drawn by label-gl.js: 12 px, the number at 700 and
//    the unit at 600 in the waves' orange darkened; the spleen's probe, past the upright, has them turned a half turn about the screen's centre so they read the right way up).
//  - The Doppler probe's callout: the vessel's name and its velocity in cm/s beside the gate (stage-label-items.js velItem), on the side of the vessel away from the probe's body, where it crosses
//    nothing: the 2D solver's pick of a clear place, as a ring of eight tries here (opposite first), the place it had kept while it stays clear.
import { NOT_SHOWN } from '../../ui/charts/fmt.ts';
import type { Box, Pt } from '../devices/probes/screen.ts';
import { overlaps } from '../devices/probes/screen.ts';

/** The record the devices write each frame and the label layer reads (positions in CSS px on the stage). */
export interface ProbeLabelRec {
  scan: { on: boolean; alpha: number; x: number; y: number; turn: number; k: number | null };
  dop: { on: boolean; alpha: number; gx: number; gy: number; ang: number; body: Box; name: string; vel: string; none: boolean; waiting: boolean };
}
export const probeLabel: ProbeLabelRec = {
  scan: { on: false, alpha: 0, x: 0, y: 0, turn: 45, k: null },
  dop: { on: false, alpha: 0, gx: 0, gy: 0, ang: 0, body: { x0: 0, y0: 0, x1: 0, y1: 0 }, name: '', vel: '', none: false, waiting: true },
};

/** Where the reading stands on the probe, in the probe's own frame (px from the tip, along the body and across it): the screen's centre, 2D (24, 48) against the tip (66, 48), the baseline 4.3 px under it. */
export const SCAN_READ = { cx: -42, cy: 0, base: 4.3 } as const;
/** The reading's text: the stiffness to one decimal, the dash while the model has none (scan-ease.js scanReadingText). */
export const scanText = (k: number | null): string => (k != null && Number.isFinite(k) ? k.toFixed(1) : NOT_SHOWN);
/** The words are turned a half turn where the probe points left of the upright (the spleen's), so they read left to right. */
export const scanFlips = (turnDeg: number): boolean => Math.cos((turnDeg * Math.PI) / 180) < -1e-6;

/** The transform that puts the reading's box (its own top left at the origin, its baseline at 80% of its height, centred) on the probe's screen: the tip's place, the turn, the screen's centre, the flip. */
export function scanTransform(x: number, y: number, turn: number): string {
  const f = scanFlips(turn);
  const r = (n: number): string => (Math.round(n * 100) / 100).toString();
  return `translate3d(${r(x)}px,${r(y)}px,0) rotate(${r(turn)}deg) translate(${SCAN_READ.cx}px,${SCAN_READ.cy}px)${f ? ' rotate(180deg)' : ''} translate(0,${SCAN_READ.base}px) translate(-50%,-80%)`;   // (turned about the screen's centre, the words are drawn in the turned frame as they were: the baseline stays the same way down in it)
}

/** How far the callout stands off the gate, px (the 2D label's own offset beside its vessel, about its ring). */
export const DOP_GAP = 11;
const DIRS = [180, 135, 225, 90, 270, 45, 315, 0];   // (degrees from the probe's own direction: the far side first, then the slants, the sides, last the probe's own side)

export interface DopPick { x: number; y: number; slot: number; clear: boolean }

/**
 * The callout's top left (a box of w by h): at one of eight places round the gate, the side away from the probe's body first, kept where it was while that stays clear. `view`: the figure's room;
 * `cards`: the pieces it never stands under; `avoid`: the other labels (it keeps off them where a place allows); `body`: the probe's own body.
 */
export function dopCalloutAt(g: Pt, ang: number, w: number, h: number, view: Box, cards: readonly Box[], body: Box, avoid: readonly Box[], keep: number, out: DopPick = { x: 0, y: 0, slot: 0, clear: true }): DopPick {
  const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const tryAt = (slot: number): { x: number; y: number; score: number } => {
    const a = ((ang + DIRS[slot]!) * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), reach = DOP_GAP + Math.abs(dx) * (w / 2) + Math.abs(dy) * (h / 2);
    const cx = g.x + dx * reach, cy = g.y + dy * reach;
    box.x0 = cx - w / 2; box.y0 = cy - h / 2; box.x1 = cx + w / 2; box.y1 = cy + h / 2;
    let score = 0;
    if (box.x0 < view.x0 || box.y0 < view.y0 || box.x1 > view.x1 || box.y1 > view.y1) score += 100;
    for (const c of cards) if (overlaps(box, c)) { score += 100; break; }
    if (overlaps(box, body)) score += 50;
    for (const v of avoid) if (overlaps(box, v)) score += 1;
    return { x: box.x0, y: box.y0, score };
  };
  let best = -1, bx = 0, by = 0, bs = Infinity;
  if (keep >= 0) { const t = tryAt(keep); if (t.score === 0) { out.x = t.x; out.y = t.y; out.slot = keep; out.clear = true; return out; } }
  for (let s = 0; s < DIRS.length; s++) {
    const t = tryAt(s);
    if (t.score < bs) { bs = t.score; best = s; bx = t.x; by = t.y; if (bs === 0) break; }
  }
  out.x = bx; out.y = by; out.slot = best; out.clear = bs < 100;
  return out;
}
