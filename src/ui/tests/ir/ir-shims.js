// What the 2D files copied into ir/copied/ import from util.js, charts.js, trace-gl.js and store.js, in this app's terms. Hand-written; the copies name only what is here.
import { fmt as chartFmt } from '../../charts/fmt.ts';
import { TOKENS } from '../../charts/looks2d/theme-tokens.js';
import { latest } from '../../../engine/store.ts';
import { readFrame } from '../slide/reads.ts';

/** v to d decimals with a true minus (2D util.js fmt). */
export const fmt = chartFmt;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A custom property's value: the bedside monitor's tokens are one look in every theme (theme-tokens.js mon-*), and the monitor reads only those. */
export const cssVar = (name) => TOKENS.light[name.replace(/^--/, '')] ?? '#000000';
/** A font as the monitor sets it: weight and size (charts.js FONT). ir/ctx-frame.ts reads the two numbers back. */
export const FONT = (w = 500, px = 11) => `${w} ${px}px Inter`;
/** The monitor is drawn on the drawer it is handed (ir/ctx-frame.ts), which stands in for the GPU's 2D context: { ctx, w, h }. */
export const fitPen = (cv, g) => g;
/** The model's newest frame, as 2D's store.get().frame. */
// (the SHOWN pressures, or the slide's own while one is pinned: tests/slide/reads.ts, the one place a measurement is read from)
export const store = { get: () => ({ frame: readFrame(latest.frame) }) };
