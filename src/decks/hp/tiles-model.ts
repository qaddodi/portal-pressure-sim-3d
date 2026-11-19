// The tiles card as numbers: which rows, their words and values from the slide's own state, the key ones marked, and the change from another state.
// Pure, so a test reads it; TilesCard.tsx only draws it.
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { fmt } from '../../ui/charts/fmt.ts';
import { valueText, type Fp } from './numbers.ts';
import { DERIVED_TILE, withResponse, withRespKey, respNote } from './derived-tiles.ts';

export interface TileSpec { deck: string; slide: string; keys: string[]; key: string[]; /** a slide id, the slide before (true), or none */ delta: string | boolean | null; /** the readings left once the slide's chart shows its own (2D card-tiles.js ownKeys), for a laptop or tablet and for a phone */ own?: { wide: string[]; phone: string[] }; /** the response tile's baseline (2D `hvpgResp`): a slide id, or true for the slide before */ resp?: string | true }

/** The keys the card prints on this screen: the slide's tiles less those its chart or instrument already shows (2D ownKeys). */
export const keysFor = (spec: TileSpec, onPhone: boolean): string[] => (spec.own ? (onPhone ? spec.own.phone : spec.own.wide) : spec.keys);

/** The slide a tile's change counts from: the one named, or the one before when the slide says `delta: true`. */
export function deltaFrom(spec: TileSpec, ids: readonly string[]): string | null {
  if (typeof spec.delta === 'string') return spec.delta;
  if (spec.delta === true) { const i = ids.indexOf(spec.slide); return i > 0 ? ids[i - 1]! : null; }
  return null;
}
export interface TileRow { key: string; name: string; sub: string; text: string; key_: boolean; delta: { text: string; good: boolean | null } | null }

/** The change of a tile's reading from another state, as its tile prints it ("+3.2", "−4"): null when either is unknown or nothing moved at the printed digits. */
export function deltaOf(key: string, now: Fp | null, before: Fp | null): { text: string; good: boolean | null } | null {
  const T = TILE[key] ?? DERIVED_TILE[key], a = now?.[key], b = before?.[key];
  if (!T || typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = T.d ?? 1, x = T.x ?? 1;
  const diff = Number(((a - b) * x).toFixed(d));
  if (diff === 0) return null;
  const good = T.better ? (diff * T.better > 0 ? true : false) : null;
  return { text: `${diff > 0 ? '+' : ''}${fmt(diff, d)}`, good };
}

/** `shown`: the keys this screen prints (keysFor). `base`: the state the response tile counts from (the slide named by `resp`). */
export function tileRows(spec: TileSpec, fp: Fp | null, before: Fp | null, shown?: readonly string[], base: Fp | null = null): TileRow[] {
  const now = spec.resp ? withResponse(fp, base) : fp;
  return withRespKey(spec.keys, spec.resp).filter((k) => (TILE[k] ?? DERIVED_TILE[k]) && (!shown || !TILE[k] || shown.includes(k))).map((k) => {
    const derived = !TILE[k];
    const T = TILE[k] ?? DERIVED_TILE[k]!;
    return {
      key: k, name: T.t, sub: derived ? respNote(now) || (T.s ?? '') : T.s ?? '',
      text: derived ? (typeof now?.[k] === 'number' ? `${Math.round(now[k] as number)}%` : '—') : valueText(k, now), key_: spec.key.includes(k),
      delta: spec.delta && !derived ? deltaOf(k, now, before) : null,
    };
  });
}
