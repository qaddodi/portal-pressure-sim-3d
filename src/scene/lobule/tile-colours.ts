// The lobule's tiles' colours for a look, in one place: the lobule's own cells (micro3d/lobule3d.ts), the sinusoid view's plates it grows round its station
// (micro3d/lobule-fine.ts) and the sinusoid view's own hepatocyte colour (sinusoid/view.ts) all read this rule, so the tile is the same colour in the lobule as in
// the view that follows it (Mohammad, 27 Nov: "the lobule disappears and the sinusoid view appears"). Pure, no page: the same in node.
import { lookColours } from './lz-colours.ts';
import { cordToneInto } from './from2d/lobule-look.generated.js';
import type { LookId } from '../../looks/looks.ts';
import { hexFrac } from './geometry.ts';
import { SIN_LOCAL } from './frames.ts';
import { LOBULE_R } from './sizes.ts';

type RGB = [number, number, number];
const mix3 = (a: ArrayLike<number>, b: ArrayLike<number>, t: number): RGB => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** 2D's hexagon fill under the cells: the page and the gap colour mixed (MIXC), then the gap laid over at half. */
export function groundOf(bg: ArrayLike<number>, gap: ArrayLike<number>, dark: boolean): [number, number, number] {
  const mixc = mix3(bg, gap, 0.55);
  return mix3(mixc, gap, dark ? 0.55 : 0.5);
}

/** 2D's cell base: the liver's first tone (Dark: 0.28 of the way from the gap to it). */
export function cellBase(look: LookId): [number, number, number] {
  const L = lookColours(look), cell = L.rgb01('--og-liver-1'), gap = L.rgb01('--og-liver-2');
  return L.dark ? mix3(gap, cell, 0.28) : [cell[0], cell[1], cell[2]];
}

/** The tiles' colours for a look, 2D's paintLobule rule at a living cell: the ground (the gap colour the tiles stand on), `fill(q, tone)` the cord's tone for a
 *  place across the lobule (q, 0 at the vein, 1 at the edge) and the cell's own tone
 *  (0 to 1), `tile(q, tone)` that fill taken over the ground by the tile's alpha (what the tile is drawn in), `nucleus(tile)` its nucleus's colour. One rule for the
 *  lobule's cells and for the fine rows' plates. */
export type TileColours = {
  ground: [number, number, number]; dark: boolean; nucInk: RGB; nucA: number;
  fill: (q: number, tone: number) => RGB; tile: (q: number, tone: number) => RGB; nucleus: (tile: RGB) => RGB;
};
export function tileColours(look: LookId): TileColours {
  const L = lookColours(look), dark = L.dark;
  const gap = L.rgb01('--og-liver-2'), bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg'), ground = groundOf(bg, gap, dark);
  const base = cellBase(look), nucInk = L.rgb01('--lz-nodule-ink'), nucA = L.alpha('--lz-nodule-ink');
  const TONE: number[] = [0, 0, 0], CT: number[] = [0, 0, 0], alpha = dark ? 0.8 : 0.92;
  const fill = (q: number, tone: number): RGB => {
    const t = 0.88 + 0.12 * tone;
    for (let i = 0; i < 3; i++) CT[i] = base[i]! * t + (1 - t) * (dark ? 0.15 : 1) * 0.3;
    const live = cordToneInto(TONE, CT, q, dark) as number[];
    return [live[0]!, live[1]!, live[2]!];
  };
  return { ground, dark, nucInk, nucA, fill, tile: (q, tone) => mix3(ground, fill(q, tone), alpha), nucleus: (tile) => mix3(tile, nucInk, Math.min(1, nucA * 2.4)) };
}

/** The tone of a living cell at the sinusoid's station (zone 2): the zone's own tint at the station's place across the lobule, the cell's own tone at the middle of its range. */
export const STATION_TONE = 0.5;
/** The colour the lobule's tile has at the sinusoid's station, for a look: what the sinusoid view's hepatocyte wears (sinusoid/view.ts colours). */
export function stationTile(look: LookId): RGB {
  return tileColours(look).tile(hexFrac(SIN_LOCAL[0] / LOBULE_R, -SIN_LOCAL[1] / LOBULE_R), STATION_TONE);
}
