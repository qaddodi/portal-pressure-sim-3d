import type { Frame } from './scene.ts';

// The box a chart drew at last, by its `memo` name and width. A card whose readings are not worked out yet (a state is being solved again)
// draws an EMPTY box this tall, never nothing. A card is measured and locked with what it holds when it lands, and one with no chart
// came in at its header alone and stood clipped when the readings arrived (Mohammad, 28 Nov, Hyperdynamic 2 on return from 3).
// `fallback` is the height the chart would take with no data when nothing has been drawn yet.
const drawn = new Map<string, number>();
export const rememberBox = (memo: string, w: number, h: number): void => { drawn.set(`${memo}|${Math.round(w)}`, h); };
export const pendingFrame = (memo: string, w: number, fallback: number, label = ''): Frame => {
  const h = drawn.get(`${memo}|${Math.round(w)}`) ?? fallback;
  return { w: Math.max(160, w), h: Math.max(1, Math.round(h)), shapes: [], label };
};
