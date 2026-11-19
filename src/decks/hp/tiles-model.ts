// The tiles card as numbers: which rows, their words and values from the slide's own state, the key ones marked, and the change from another state.
// Pure, so a test reads it; TilesCard.tsx only draws it.
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { fmt } from '../../ui/charts/fmt.ts';
import { valueText, type Fp } from './numbers.ts';

export interface TileSpec { deck: string; slide: string; keys: string[]; key: string[]; /** a slide id, the slide before (true), or none */ delta: string | boolean | null }

/** The slide a tile's change counts from: the one named, or the one before when the slide says `delta: true`. */
export function deltaFrom(spec: TileSpec, ids: readonly string[]): string | null {
  if (typeof spec.delta === 'string') return spec.delta;
  if (spec.delta === true) { const i = ids.indexOf(spec.slide); return i > 0 ? ids[i - 1]! : null; }
  return null;
}
export interface TileRow { key: string; name: string; sub: string; text: string; key_: boolean; delta: { text: string; good: boolean | null } | null }

/** The change of a tile's reading from another state, as its tile prints it ("+3.2", "−4"): null when either is unknown or nothing moved at the printed digits. */
export function deltaOf(key: string, now: Fp | null, before: Fp | null): { text: string; good: boolean | null } | null {
  const T = TILE[key], a = now?.[key], b = before?.[key];
  if (!T || typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = T.d ?? 1, x = T.x ?? 1;
  const diff = Number(((a - b) * x).toFixed(d));
  if (diff === 0) return null;
  const good = T.better ? (diff * T.better > 0 ? true : false) : null;
  return { text: `${diff > 0 ? '+' : ''}${fmt(diff, d)}`, good };
}

export function tileRows(spec: TileSpec, now: Fp | null, before: Fp | null): TileRow[] {
  return spec.keys.filter((k) => TILE[k]).map((k) => ({
    key: k, name: TILE[k]!.t, sub: TILE[k]!.s ?? '', text: valueText(k, now), key_: spec.key.includes(k),
    delta: spec.delta ? deltaOf(k, now, before) : null,
  }));
}
