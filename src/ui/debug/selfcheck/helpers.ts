// Small helpers the rule modules share (pure).
export const px = (n: number) => `${Math.round(n * 10) / 10} px`;
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export type Box = number[];   // [left, top, right, bottom]
export const area = (b: Box) => Math.max(0, b[2]! - b[0]!) * Math.max(0, b[3]! - b[1]!);
export const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!)) * Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));
/** Whole on the screen, to a pixel. */
export const inside = (b: Box, vw: number, vh: number, slack = 1) => b[0]! >= -slack && b[1]! >= -slack && b[2]! <= vw + slack && b[3]! <= vh + slack;
/** A card is "up" for a judge when it has come in (not leaving, not waiting) and is opaque enough to be read. */
export const isUp = (c: { phase?: string; opacity?: number }) => c.phase === 'in' && (c.opacity ?? 0) >= 0.95;
