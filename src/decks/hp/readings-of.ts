import type { Readings } from '../../ui/ui-store.ts';

/** The readings a slide's words print: its state's numbers, else (until the state is in) the live figure's six headline ones. */
export const readingsOf = (fp: Readonly<Record<string, unknown>> | null | undefined, live: { whvp: number | null; fhvp: number | null; hvpg: number | null; ivc: number | null; ra: number | null; pv: number | null }): Readings => (fp ? numeric(fp) : { whvp: live.whvp, fhvp: live.fhvp, hvpg: live.hvpg, ivc: live.ivc, ra: live.ra, pv: live.pv });
const numeric = (fp: Readonly<Record<string, unknown>> | null | undefined): Readings => {
  const out: Readings = {};
  if (fp) for (const [k, v] of Object.entries(fp)) if (typeof v === 'number') out[k] = v;
  return out;
};
