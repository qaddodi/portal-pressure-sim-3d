// What the copied 2D procedure modules (see scripts/copy-b5-data.mjs) take from three of the 2D app's files this repo does not carry:
// frame.js (its frame clock: here the one clock, src/clock/, drives procedures, so the 2D callers that ask for frames are not used),
// motion.js (the move helpers: the curves are the 2D app's own, from ease.js), and shape-gl.js (only `flattenPath`, the outline polygon the balloon is fitted to).
import { easeIn, easeMove } from './ease.js';

export { easeIn, easeMove };
/** The 2D frame scheduler. A copied module may make one at load; none of the copied pure functions calls it. */
export const frameFor = () => () => 0;
export const cancelFrame = () => {};
/** Reduce Motion is read by the 3D app's own settings, not here. */
export const reduced = () => false;
export const reduceMotionMQ = { matches: false, addEventListener() {}, removeEventListener() {} };
/** The 2D app's reversible move (`playProcedure` uses it). The 3D player runs `procFrame(kind, t)` on the clock instead (src/scene/procedures/player.ts). */
export function createReversible() { throw new Error('createReversible is the 2D app\'s move clock: the 3D app plays procFrame(kind, t) on its own clock'); }

/**
 * The polygons of an SVG path of absolute M, L, C and Z commands, curves cut finely enough to stay within `tol` (world units): [{ pts: [x0, y0, x1, y1, …], closed }].
 * (The 2D app's shape-gl.js flattenPath, for the paths the anatomy writes: the two outlines the tamponade tube is fitted to.)
 */
export function flattenPath(d, tol = 0.25) {
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const out = [];
  let cur = null, i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
  const push = (x, y) => { cur.pts.push(x, y); cx = x; cy = y; };
  while (i < toks.length) {
    if (/^[MLCZ]$/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (cmd === 'M') { cur = { pts: [], closed: false }; out.push(cur); sx = +toks[i++]; sy = +toks[i++]; push(sx, sy); cmd = 'L'; }
    else if (cmd === 'L') push(+toks[i++], +toks[i++]);
    else if (cmd === 'C') {
      const x1 = +toks[i++], y1 = +toks[i++], x2 = +toks[i++], y2 = +toks[i++], x3 = +toks[i++], y3 = +toks[i++];
      const len = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.max(4, Math.ceil(Math.sqrt(len / tol) * 0.7));
      const x0 = cx, y0 = cy;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    } else if (cmd === 'Z') { if (cur) cur.closed = true; cx = sx; cy = sy; cmd = ''; }
    else throw new Error(`unsupported path command in ${d.slice(0, 30)}`);
  }
  return out;
}
