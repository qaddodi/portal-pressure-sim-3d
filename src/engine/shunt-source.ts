// A surgical shunt is drawn at 1x its origin vein's width or less (Mohammad, 28 Nov: "They all should draw 1x or less they're origin vein"; the portocaval shunt "seems big compared to vessel connected from").
// The ENGINE'S numbers are left as they are (the cards still say 14 mm for the portocaval shunt); only the drawn width reads the cap, one rule for the vessel texture (vessel-data.ts) and the clots that sit in the lumen (disease/host.ts).
// The cap is on the DRAWN width (the origin vein's built radius times its live swell), not on the engine's diameter: the mesenteric vein is drawn at its whole's calibre, thinner than its 10 mm says. vessels/network.ts registers the rules.
/** One shunt's rule: the origin vein's engine edge, and the diameter (mm) the shunt must be drawn at, at most, for the origin vein's diameter `dSrc` (undefined: no cap). */
export type ShuntCap = { source: string; capD: (dSrc: number) => number };
const rules = new Map<string, ShuntCap>();
/** Set by network.ts once the drawn courses are known. */
export function registerShuntCaps(list: ReadonlyMap<string, ShuntCap>): void { rules.clear(); for (const [k, v] of list) rules.set(k, v); }
/** The ids of the shunts that carry a cap. */
export const cappedShuntIds = (): string[] => [...rules.keys()];
/** The origin vein's edge of a capped shunt. */
export const shuntSourceOf = (id: string): string | undefined => rules.get(id)?.source;
/** The diameter (mm) a shunt is DRAWN at: its own, but never wider (drawn) than its origin vein as drawn. `dOf` gives an edge's diameter, undefined when unknown; a vessel with no rule keeps `d`. */
export function drawnShuntD(id: string, d: number | undefined, dOf: (edge: string) => number | undefined): number | undefined {
  const r = rules.get(id);
  if (!r || d == null || !Number.isFinite(d)) return d;
  const s = dOf(r.source);
  return s != null && Number.isFinite(s) && s > 0 ? Math.min(d, r.capD(s)) : d;
}
