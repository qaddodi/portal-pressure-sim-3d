// The registry entry of the timeline chart: the clock's GPU-drawn words and the jump's day count (the one piece of 2D's timeline.js that is a drawing; look small.day).
import type { ChartKind } from '../registry.ts';
import { clockFrame } from './frame.ts';

export const timelineEntry: ChartKind = {
  kind: 'timeline', what: 'The model timeline\'s clock: two clocks (seconds on day 0, then days) and the jump\'s day count', slides: undefined, status: 'done',
  specimens: [
    { id: 'seconds', label: 'The first day, in minutes and seconds', build: (c) => clockFrame({ t: 74, day: 0 }, c) },
    { id: 'days', label: 'Past day 0, the day alone', build: (c) => clockFrame({ t: 3e6, day: 142 }, c) },
    { id: 'jump', label: 'Halfway through a jump of six months', build: (c) => clockFrame({ t: 0, day: 142, jump: { from: 142, days: 180, u: 0.4 } }, c) },
  ],
};
