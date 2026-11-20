// Half the drawn width (px) of the vessel a station's caption stands beside, on the map as it is zoomed now: the caption keeps that much further off its line (2D `it.vw / 2`), so a
// thick map line never runs under its own name.
import { LABEL_VESSEL } from '../../ui/action/read.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { circBoostOf } from './map.ts';
import { circuitWidthMap } from './width.ts';

/** A station without a vessel of its own (an inner or minor station) takes a plain vein's width. `scale`: the map's CSS pixels per map unit. */
export function halfWidthPx(station: string, scale: number): number {
  const boost = circBoostOf(scale), perPx = scale > 0 ? Math.min(40, 1 / scale) : 0, v = NETWORK_BY_ID.get(LABEL_VESSEL[station] ?? '');
  const w = v ? circuitWidthMap(v.widthKind, v.baseD, boost, v.circFine ?? 1, perPx) : circuitWidthMap(0, 6, boost, 1, perPx);
  return 0.5 * w * scale;
}
