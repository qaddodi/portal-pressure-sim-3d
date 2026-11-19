// The three small helpers the 2D plane file asks of its neighbours (util.js clamp; table-marks.js numName and tileShown), on this app's tile table (tiles.generated.ts).
import { TILE } from '../tiles.generated.ts';

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** The name of a reading shown as ONE number (2D numName): the tile's title; the blood pressure tile prints systolic/diastolic, but its single number is the mean. */
export const numName = (k: string, short = false): string | undefined => (k === 'map' ? (short ? 'MAP' : 'Mean arterial pressure') : TILE[k]?.t);

/** A value as its tile prints it (its scale and decimals), back in the model's units (2D tileShown): a tile's word judges the number it shows. */
export const tileShown = (k: string, v: number): number => {
  if (v == null || !Number.isFinite(v)) return v;
  const x = TILE[k]?.x ?? 1;
  return +(+(v * x).toFixed(TILE[k]?.d ?? 1) / x).toPrecision(12) || 0;
};
