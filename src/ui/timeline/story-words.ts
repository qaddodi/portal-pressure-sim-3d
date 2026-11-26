// What the timeline panel says (docs/approved/timeline-story.md). History's own words (Go back here, Compare with now, the empty note) stay in history/words.ts, from the 2D app.
export const STORY = {
  day: (d: number) => `Day ${Math.round(d)}`,
  days: (a: number, b: number) => (Math.round(a) === Math.round(b) ? `Day ${Math.round(a)}` : `Day ${Math.round(a)}–${Math.round(b)}`),
  span: (a: number, b: number) => { const n = Math.round(b - a); return `${n} day${n === 1 ? '' : 's'}`; },
  start: 'Start',
  today: 'Today',
  now: 'Now',
  show: 'Show on the figure',
  onFigure: 'On the figure now',
  figureAt: (d: number, today: boolean) => (today ? 'The figure shows today' : `The figure shows Day ${Math.round(d)}`),
  smaller: (n: number) => `and ${n} smaller change${n === 1 ? '' : 's'}`,
  quiet: (n: number) => `${n} smaller changes`,
  times: (n: number) => `${n} times`,
  ahead: 'Undone: Redo brings these back',
  trimmed: 'Earlier moments were not kept',
  before: (when: string) => `Before → ${when}`,
  thatDay: 'That day',
  metric: 'Reading on the strip',
  /** a model patient's story played stop by stop (ui/case): the menu's card and the History panel */
  play: 'Play the case',
} as const;
