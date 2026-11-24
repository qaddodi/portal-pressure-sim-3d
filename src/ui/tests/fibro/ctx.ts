import { lsmContext } from '../../../engine/hales/portal/lsm-cuts.js';

/** The context of the card's stiffness (congested, vascular or none). A slide's card reads it from the slide's own settled state, the one its numbers come from: the live metrics ease up from the slide before, and a liver
 *  that is still scarring read "Vascular disease: CSPH rules do not apply" under "Fibrosis stiffens the liver" (Stiffness 3, capture 572259fd). */
export function ctxOf(fp: Record<string, unknown> | null | undefined, m: Record<string, unknown> | null | undefined): 'congested' | 'vascular' | null {
  const own = fp && Number.isFinite(fp.lsm as number) && Number.isFinite(fp.scar as number) ? fp : m;
  return own ? (lsmContext(own) as 'congested' | 'vascular' | null) : null;
}
