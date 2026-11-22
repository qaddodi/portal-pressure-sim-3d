// One still picture of the figure at a scale of its own, for Copy / Save figure (ui/shell/figure-image-dom.ts). Stage binds the function that draws it (it owns the renderer); nothing here draws.
export interface Shot { canvas: HTMLCanvasElement; /** where the stage stands on the page, CSS px */ css: { x: number; y: number; w: number; h: number } }
export type FigureShot = (want: number) => Shot | null;
let shot: FigureShot | null = null;
export const figureShot = {
  bind(f: FigureShot | null): void { shot = f; },
  /** The figure drawn at up to `want` times its CSS size (less where the device cannot) and copied onto a canvas of its own; null when the stage is not there. */
  take(want: number): Shot | null { return shot ? shot(want) : null; },
};

/** A copy of what a canvas shows now (read in the task that drew it), on a 2D canvas that is not in the page. */
export function copyOfCanvas(el: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = el.width; out.height = el.height;
  out.getContext('2d')!.drawImage(el, 0, 0);
  return out;
}
