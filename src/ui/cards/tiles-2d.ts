// A slide's data-card tiles, as the 2D app's bigTiles builds them (src/ui/presenter-cards.js buildTiles / write / paintBands, card-tiles.js, presenter-case.js respFp,
// presenter-question.js deltaOf / refOf), as pure functions so a test can hold every tile of every slide to the 2D numbers: which tiles the slide shows, each tile's name, number and unit, its
// rating word and colour class, its scale bar (bands, cut-off ticks and numbers, where the number and its start sit) and the line that says where it started. The page only draws this.
// Nothing here is typed per slide: the tiles, their ratings and their scales come from the 2D tables (src/ui/deck/from2d/table-marks.js, card-tiles.js), the numbers from the slide's own state.
import { NO_ASC, SCALE, bandsOf, cutDp, rateOf, tileOf, tileShown, tipsGoal } from '../deck/from2d/table-marks.js';
import { headKeys, tileKeys, toolOnly } from '../deck/from2d/card-tiles.js';
import { bpText } from '../tests/copied/vital-read.copied.js';
import { fmt } from '../charts/fmt.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { changes } from '../../decks/hp/numbers.ts';

export type Fp = Record<string, number | null | undefined>;

export interface BarView {
  zones: { left: number; width: number; rate: string }[];
  ticks: number[];
  labels: { left: number; text: string }[];
  /** where the number sits on the bar, 0 to 100; null when the tile has no number */
  now: number | null;
  /** where the slide it is counted from sat; null without one */
  was: number | null;
}
export interface TileView {
  k: string;
  /** the tile's name (2D: TILE[k].t) and its short form for a narrow tile (TILE[k].n) */
  name: string;
  short: string | null;
  unit: string;
  pct: boolean;
  text: string;
  none: boolean;
  /** the rating class on the tile: ok, mid, hi, info, plain or none (2D: data-rate) */
  rate: string;
  /** the rating's word ("High", "CSPH"…) */
  word: string;
  key: boolean;
  bar: BarView | null;
  /** the line under the rating: where the tile started ("from 7.4"), "No change", or ''; always present so every tile is one height */
  delta: string;
  /** the same reading for the header row of an instrument card: short name, number, unit */
  head: { name: string; text: string; unit: string };
}

const at = (k: string, v: number): number => {
  const s = (SCALE as unknown as Record<string, [number, number, number[]]>)[k]!, x = tileOf(k)?.x ?? 1;
  return Math.min(100, Math.max(0, ((v * x - s[0]) / (s[1] - s[0])) * 100));
};

/** A tile's number as 2D prints it (presenter-cards.js tileVal). */
export function tileVal(k: string, v: number | null | undefined, f: Fp | null = null): string {
  if (v == null) return '—';
  const T = tileOf(k);
  return T?.bp ? bpText(f?.sbp, f?.dbp, v) : fmt(v * (T?.x ?? 1), T?.d ?? 1);
}

/** The rating of a tile's number as printed (presenter-cards.js ratedShown): the word judges the number the tile shows; after TIPS the PPG is read against its 12 mmHg line, in the short words ("Below 12 mmHg": the long "… reference" wrapped to a second row and stood over the value in a narrow tile, TIPS follow-up 25). */
export function ratedShown(k: string, f: Fp, tips = false): [string | null, string] {
  const rated = (g: Fp): [string | null, string] => (tips && k === 'ppg' && g.ppg != null ? tipsGoal(g.ppg, true) : rateOf(k, g)) as [string | null, string];
  return f[k] != null ? rated({ ...f, [k]: tileShown(k, f[k]) }) : rated(f);
}

/** Which slide the tiles' change counts from (presenter-question.js deltaOf): the slide's own `delta`, else the slide before when this one changes the patient without bringing a new one. */
export const deltaOf = (s: CopiedSlide, i: number, changes: (s: CopiedSlide) => boolean): string | boolean | null => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);

/** The HVPG response tile's inputs (presenter-case.js respFp): the percent fall in the HVPG from the slide `hvpgResp` names (true: the one before). */
export function respFp(s: CopiedSlide, f: Fp | null, base: number | null | undefined): Fp | null {
  if (!s.hvpgResp || !f) return f;
  const b = base ?? 0;
  return b > 0 && f.hvpg != null ? { ...f, hvpgFall: ((b - f.hvpg) / b) * 100, respFrom: b, respAt: tileShown('hvpg', f.hvpg) } : { ...f, hvpgFall: null, respFrom: null, respAt: null };
}

/** The rating of each band of a tile's bar (presenter-cards.js paintBands: a band takes the rating of its middle). */
export function bandRates(k: string, f: Fp, tips = false): string[] {
  const bands = bandsOf(k) as { m: number }[] | null;
  if (!bands) return [];
  return bands.map((z) => (tips && k === 'ppg' ? tipsGoal(z.m) : rateOf(k, { ...f, respAt: null, asc: Math.max(f.asc ?? 0, NO_ASC), [k]: z.m }))[0] || 'info');
}

/** One tile, as buildTiles and write make it. `f` is the slide's reading (the fingerprint, with the response fields when it has them), `ref` the earlier state it is counted from. */
export function tileView(k: string, f: Fp, o: { ref?: Fp | null; key?: boolean; tips?: boolean } = {}): TileView {
  const T = tileOf(k) ?? { t: k, s: '', u: '' };
  const S = (SCALE as unknown as Record<string, [number, number, number[]] | undefined>)[k];
  const tips = !!o.tips, ref = o.ref ?? null;
  const [cls, word] = ratedShown(k, f, tips);
  const none = cls == null && (k === 'saag' || k === 'tp');
  const on = !none && f[k] != null;
  const x = T.x ?? 1, dg = T.d ?? 1;
  const r0 = k === 'hvpgFall' ? null : ref?.[k];
  const ok = on && r0 != null;
  const text = none ? '—' : tileVal(k, f[k], f);
  let delta = '';
  if (k === 'hvpgFall') delta = f.respFrom == null ? '' : `from ${fmt(f.respFrom, 1)} mmHg`;
  else if (ok && f[k] != null) {
    const rd = (v: number) => +(v * x).toFixed(dg);
    delta = Math.abs(rd(f[k]!) - rd(r0!)) < 0.5 * 10 ** -dg ? 'No change' : `from ${fmt(r0! * x, dg)}${T.u === '%' ? '%' : ''}`;
  }
  const rates = bandRates(k, f, tips);
  const bands = (bandsOf(k) || []) as { a: number; b: number }[];
  const bar: BarView | null = S ? {
    zones: bands.map((z, i) => ({ left: at(k, z.a / x), width: at(k, z.b / x) - at(k, z.a / x), rate: rates[i]! })),
    ticks: S[2].map((c) => at(k, c / x)),
    labels: S[2].map((c) => ({ left: at(k, c / x), text: fmt(c, cutDp(c)) })),
    now: on ? at(k, f[k]!) : null,
    was: ok ? at(k, r0!) : null,
  } : null;
  return {
    k, name: T.t, short: T.n ?? null, unit: none ? '' : T.u, pct: T.u === '%', text, none, rate: cls || (none ? 'none' : 'plain'), word, key: !!o.key, bar, delta,
    head: { name: T.n || T.t, text, unit: none ? '' : T.u },
  };
}

/** What a slide's data card holds (presenter.js dataIn, card-tiles.js): the tiles' keys, which are the instrument card's header readings instead, and whether the card is the instrument alone. */
export function cardOf(s: CopiedSlide, phone: boolean) {
  const keys = tileKeys(s, phone) as string[];
  return { keys, head: headKeys(s, phone) as string[], toolOnly: toolOnly(s) as boolean, key: (s.key ?? []) as string[] };
}

export interface SlideTiles { keys: string[]; head: string[]; toolOnly: boolean; tiles: TileView[] }

/** Every tile of slide `s` from its state `f` (and `ref`, the state its change counts from). */
export function slideTiles(s: CopiedSlide, f: Fp | null, o: { ref?: Fp | null; respBase?: number | null; phone?: boolean; tips?: boolean } = {}): SlideTiles {
  const c = cardOf(s, !!o.phone);
  const g = respFp(s, f ?? {}, o.respBase);   // (no state yet: every tile stands, its number a dash, so the card keeps its height)
  const tiles = g ? c.keys.map((k) => tileView(k, g, { ref: o.ref, key: c.key.includes(k), tips: o.tips })) : [];
  return { keys: c.keys, head: c.head, toolOnly: c.toolOnly, tiles };
}

/** Slide i's tiles out of a deck's states (results[j] is slide j's engine step: its fingerprint and parameters). A slide that changes nothing stands on the last state that did, the state its
 *  change counts from is the slide before's (or the one `delta` names), and the HVPG response tile counts from the slide `hvpgResp` names: presenter-question.js refOf, presenter-case.js respFp. */
export function tilesAt(slides: readonly CopiedSlide[], results: readonly ({ fp: Fp; params?: unknown } | undefined)[] | undefined, i: number, phone: boolean): SlideTiles | null {
  const s = slides[i];
  if (!s) return null;
  let last = 0;
  const stateOf = slides.map((x, j) => (j === 0 || changes(x) ? (last = j) : last));
  const fpAt = (j: number): Fp | null => (j >= 0 ? results?.[stateOf[j]!]?.fp ?? null : null);
  const refFor = (d: string | boolean | null): Fp | null => (d === true ? (i > 0 ? fpAt(i - 1) : null) : typeof d === 'string' ? fpAt(slides.findIndex((x) => x.id === d)) : null);
  const base = s.hvpgResp ? refFor(s.hvpgResp as string | boolean)?.hvpg : null;
  const tips = !!(results?.[stateOf[i]!]?.params as { tips?: { on?: boolean } } | undefined)?.tips?.on;
  return slideTiles(s, fpAt(i), { ref: refFor(deltaOf(s, i, changes as (x: CopiedSlide) => boolean)), respBase: base, phone, tips });
}

/** The deck's states with slide `i`'s reading replaced by the live one (its parameters stay: the live figure's own settings are not the slide's). */
export function liveResults(results: readonly (object | undefined)[] | undefined, i: number, fp: Fp): ({ fp: Fp; params?: unknown } | undefined)[] {
  const out = [...(results ?? [])] as ({ fp: Fp; params?: unknown } | undefined)[];
  out[i] = { ...(results?.[i] ?? {}), fp };
  return out;
}
