// The case bar's played rail and playhead (case/CaseBar.tsx), one fraction of the strip's span written as two transforms on the one clock.
// The ink rail grows from the span's own start (scaleX from its left edge), so its box can never reach left of the rail's start: nothing has to clip it.
// (B2, capture 0bc14020: the rail was a full-width bar parked to the playhead's left and cut by a clip-path; where that cut failed it ran over the buttons and the "Day N" text.)

/** the fraction clamped to the strip: a drag past either end, or a day outside the axis, never moves the rail out of its span */
export const playedFrac = (f: number): number => (Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0);

/** the playhead's transform: its own width is the span, so the percent is the fraction of the span */
export const headTransform = (f: number): string => `translateX(${(playedFrac(f) * 100).toFixed(3)}%)`;

/** the played rail's transform: grown from the span's left edge to the fraction (the rail is `left: 0; right: 0` in the span, case.css) */
export const fillTransform = (f: number): string => `scaleX(${playedFrac(f).toFixed(5)})`;
