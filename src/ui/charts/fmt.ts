// How a chart prints a number and a live reading: the 2D app's fmt (a true minus, never "−0") and its tile table (name, unit, scale, decimals).
import { TILE, type TileInfo } from './tiles.generated.ts';

export const NOT_SHOWN = '—';

/** v to d decimals with a true minus (U+2212) and never "−0.0"; "—" for no number. */
export function fmt(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return NOT_SHOWN;
  const t = v.toFixed(d);
  return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−');
}

/** fmt with the thousands comma of the app's big numbers ("1,320"). */
export function fmtG(v: number | null | undefined, d = 1): string {
  const t = fmt(v, d);
  if (t === NOT_SHOWN) return t;
  const [int, frac] = t.split('.');
  const g = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? g : `${g}.${frac}`;
}

/** The numbers the model reports as the tiles key them ('hvpg', 'asc', 'lsm' …), engine units. */
export type Fingerprint = Readonly<Record<string, number | null | undefined>>;

export const tile = (key: string): TileInfo | undefined => TILE[key];

/** A reading as its tile prints it, with the unit: "21.3 mmHg". */
export function reading(key: string, fp: Fingerprint | null | undefined, withUnit = true): string {
  const v = fp?.[key];
  if (v == null || !Number.isFinite(v)) return NOT_SHOWN;
  const T = TILE[key];
  return `${fmt(v * (T?.x ?? 1), T?.d ?? 1)}${withUnit && T?.u ? ` ${T.u}` : ''}`;
}

/** A value as its tile prints it, as a number (what a criteria row is judged by: the figure on the screen, not the model's digits). */
export function shown(key: string, v: number): number {
  const T = TILE[key];
  return +(v * (T?.x ?? 1)).toFixed(T?.d ?? 1);
}
