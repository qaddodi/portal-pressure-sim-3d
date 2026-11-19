/** The height a chart is drawn at in its box (Cv.tsx): the box's own, as the 2D stylesheet sized it, once it has one; else the height it was handed. */
export const cvHeight = (measured: number, fallback: number): number => (measured > 0 ? measured : Math.round(fallback));
