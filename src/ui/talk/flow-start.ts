// Where a time-lapse chart's line starts: the state its days are lived from, the slide before's.
// A slide's `delta` names the state its ARROWS count from (the pre-cure one, Cause treated 4); the chart is of the days the slide plays,
// so starting it there drew the line from a state a year earlier and dropped it straight down at day 0
// (capture 3531bdfa, C-D12: 17.4 began at the pre-cure 11.1 where slide 3 ended at 7.3).
// A chart of a meal (minutes), or of a slide that opens a new patient (`preset`: the slide before is another patient),
// keeps the delta's state, as the 2D chart does. tests/one-number.test.ts: every days chart's first point is the state before it.

/** `days`: a chart of days of the same patient; `before`: the state of the slide before; `delta`: the state the slide's arrows count from. */
export function flowStartOf<T>(days: boolean, before: T | null, delta: T | null): T | null {
  return days ? before : delta;
}
