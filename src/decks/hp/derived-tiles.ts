// The readings a data card works out from the slide's own state rather than reading from the engine's tiles (2D table-marks.js DERIVED_TILE, presenter-case.js respFp).
//   hvpgFall  the percent fall of the HVPG from another slide's (the slide field `hvpgResp`: a slide id, or true for the slide before), as the beta-blocker response tile reads it
//   res       the resistance inside the liver (mmHg per L/min): the engine's `rih`, read by the summary table's column and the circuit's captions (ui/deck/from2d/table-marks.js fpv)
import type { Fp } from './numbers.ts';
import { hvpgNotMeasurable } from '../../engine/hv-flag.ts';
import type { TileInfo } from '../../ui/charts/tiles.generated.ts';

/** The tile rows the card prints that no engine tile stands for. */
export const DERIVED_TILE: Record<string, TileInfo> = { hvpgFall: { t: 'HVPG fall', s: 'From the slide named', u: '%', d: 0, better: 1 } };

/** The HVPG as its tile prints it (one decimal): the number the fall is counted against, so the card never reads 11.6 and a fall from 11.7. */
const shown = (v: number): number => Math.round(v * 10) / 10;

/** The slide's fingerprint with its response in it: the fall from the baseline's HVPG, that baseline, and the HVPG now as printed; nothing but nulls when either is not known. */
export function withResponse(fp: Fp | null, base: Fp | null): Fp | null {
  if (!fp) return fp;
  const b = base?.hvpg, now = fp.hvpg;
  // (no fall is counted from, or to, an HVPG nobody can measure: a blocked hepatic vein, ui/cuts.ts)
  return typeof b === 'number' && b > 0 && typeof now === 'number' && !hvpgNotMeasurable(fp) && !hvpgNotMeasurable(base)
    ? { ...fp, hvpgFall: ((b - now) / b) * 100, respFrom: b, respAt: shown(now) }
    : { ...fp, hvpgFall: null, respFrom: null, respAt: null };
}

/** The tile keys a slide shows: its own, and the response tile when the slide has a response and does not list it (2D card-tiles.js tileKeys). */
export const withRespKey = (keys: readonly string[], resp: unknown): string[] => (resp && !keys.includes('hvpgFall') ? [...keys, 'hvpgFall'] : [...keys]);

/** The line under the response tile: the HVPG the fall counts from. */
export const respNote = (fp: Fp | null): string => (typeof fp?.respFrom === 'number' ? `from ${fp.respFrom.toFixed(1)} mmHg` : '');
