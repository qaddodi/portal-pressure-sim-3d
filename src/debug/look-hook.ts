// The look board's one hook into the drawing (WP11): Stage.tsx calls `lookCapture.run(canvas)` right after the frame's render. When the board has asked, the canvas is read in that
// same task, so no `preserveDrawingBuffer` is needed (a canvas read in a later task is blank). Nothing asks on a normal page, and then this is one null test per drawn frame.
export type Grab = (canvas: HTMLCanvasElement) => void;
let pending: Grab | null = null;

export const lookCapture = {
  /** Read the canvas right after the next frame is drawn (the caller asks the clock for that frame). */
  ask(fn: Grab): void { pending = fn; },
  /** Called by Stage after `cel.render(gl)`. */
  run(canvas: HTMLCanvasElement): void { const f = pending; if (f) { pending = null; f(canvas); } },
  get waiting(): boolean { return pending !== null; },
};
