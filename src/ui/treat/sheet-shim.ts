// What 2D's sheet code imports from its own helpers (ease.js, layout-snap.js, rest-pass.js, motion.js), on the 3D app's: the copies in this folder (scripts/copy-treat-sheet.mjs) import only this.
// Layout reads happen in events (a tap, a refit), never in a frame; the 3D app's frames are the clock's (src/clock), which none of these ask for.
import { D_SMALL as SMALL, reduced } from '../a11y/motion.ts';

import { clock } from '../../clock/frame.ts';
export const D_SMALL = SMALL;
/** 2D's rest pass runs between frames, after the task that changed the DOM; a zero-delay task is the same moment. */
export const restPass = (fn: () => void): number => clock.after(fn, 0) as unknown as number;
export const readBox = (e: Element): DOMRect => e.getBoundingClientRect();
export const readMetric = (e: Element, k: string): number => (e as unknown as Record<string, number>)[k] ?? 0;
export const readStyle = (e: Element, pseudo?: string): CSSStyleDeclaration => getComputedStyle(e, pseudo);
export const reduceMotionMQ = { get matches(): boolean { return reduced(); } };
