// The look board's picture comparison (pure, so a Node test and the board page share it): two RGBA buffers of one size, a pixel counts as different when any colour channel is
// more than `tolerance` apart (a few levels of dither or driver rounding are not a change). `diffPixels` also paints the difference image: the new picture dimmed, the changes red.
export interface Diff { same: boolean; size: boolean; changed: number; total: number; percent: number; image: Uint8ClampedArray | null }
export const TOLERANCE = 12;
export const FAIL_PERCENT = 0.05;   // above this share of changed pixels a state is listed as "moved" in the report

export function diffPixels(a: ArrayLike<number>, b: ArrayLike<number>, w: number, h: number, tolerance = TOLERANCE): Diff {
  const total = w * h;
  const image = new Uint8ClampedArray(total * 4);
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a[o]! - b[o]!), Math.abs(a[o + 1]! - b[o + 1]!), Math.abs(a[o + 2]! - b[o + 2]!));
    if (d > tolerance) { changed++; image[o] = 230; image[o + 1] = 30; image[o + 2] = 40; image[o + 3] = 255; }
    else { const g = 255 - Math.round((255 - (b[o]! * 0.3 + b[o + 1]! * 0.59 + b[o + 2]! * 0.11)) * 0.25); image[o] = image[o + 1] = image[o + 2] = g; image[o + 3] = 255; }
  }
  return { same: changed === 0, size: true, changed, total, percent: total ? (changed / total) * 100 : 0, image };
}

/** The verdict line of a state. */
export function verdict(d: Diff | null): string {
  if (!d) return 'no baseline';
  if (!d.size) return 'size differs from the baseline';
  return d.same ? 'same as the baseline' : `${d.percent.toFixed(2)}% of pixels changed`;
}
export const moved = (d: Diff | null): boolean => !!d && (!d.size || d.percent > FAIL_PERCENT);
