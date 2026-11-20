// The reading the Tests devices wear on the figure, as the 2D app draws them. Pure: node judges all of it; probe-labels-dom.ts writes it.
//  - The FibroScan probe's own screen: the live stiffness and "kPa" printed on the display, turned with the probe's body (stage-scan.js `.sp-read`, drawn by label-gl.js: 12 px, the number at 700 and
//    the unit at 600 in the waves' orange darkened; the spleen's probe, past the upright, has them turned a half turn about the screen's centre so they read the right way up).
import { NOT_SHOWN } from '../../ui/charts/fmt.ts';

/** The record the devices write each frame and the label layer reads (positions in CSS px on the stage). */
export interface ProbeLabelRec {
  scan: { on: boolean; alpha: number; x: number; y: number; turn: number; k: number | null };
  /** the Doppler's marks as thin strokes over the figure: 4 lines (sight, axis, gate bars) of x0, y0, x1, y1, the probe's alpha, and whether the sample volume is closed (its axis and bars are gone) */
  dop: { on: boolean; alpha: number; shut: boolean; lines: Float32Array };
}
export const probeLabel: ProbeLabelRec = {
  scan: { on: false, alpha: 0, x: 0, y: 0, turn: 45, k: null },
  dop: { on: false, alpha: 0, shut: false, lines: new Float32Array(16) },
};

/** The strokes' widths, px (the line, and the black rim round it): 2D's 2 and 4.4 (the gate's bars 3 and 5.6) drawn thinner, as the owner asked, 20 Nov 2026. */
export const DOP_LINE_PX = [1.4, 1.4, 2, 2] as const, DOP_RIM_STROKE_PX = [3, 3, 4, 4] as const;

/** The transform of a stroke from (x0, y0) to (x1, y1): a 1 px element laid along it by its length and turn (as a leader is). */
export function strokeTransform(x0: number, y0: number, x1: number, y1: number): string {
  const r = (n: number): string => (Math.round(n * 100) / 100).toString();
  return `translate3d(${r(x0)}px,${r(y0)}px,0) rotate(${(Math.atan2(y1 - y0, x1 - x0)).toFixed(4)}rad) scaleX(${r(Math.hypot(x1 - x0, y1 - y0))})`;
}

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
