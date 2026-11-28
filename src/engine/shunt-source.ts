// A surgical shunt is drawn no wider than the vein it is made from (Mohammad, 28 Nov: the portocaval shunt "seems big compared to vessel connected from"). The engine gives the portocaval shunt 14 mm and the portal
// trunk it leaves 12 mm; the 2D width rule (1.3 * 2 d^0.72) drew it 12 % wider than its source. The ENGINE'S numbers are left as they are (the cards still say 14 mm); only the drawn width reads the smaller of the two,
// one rule for the vessel texture (vessel-data.ts), the clots that sit in the lumen (disease/host.ts) and the width the tube is built at (vessels/network.ts baseD).
/** Shunt id -> the engine edge of the vein it leaves. */
export const SHUNT_SOURCE: Readonly<Record<string, string>> = { S_PC: 'PV_TRUNK' };
/** The diameter (mm) a shunt is DRAWN at: its own, but never over its source vein's (both as the engine reports them). `dOf` gives an edge's diameter, undefined when unknown; a vessel with no source row keeps `d`. */
export function drawnShuntD(id: string, d: number | undefined, dOf: (edge: string) => number | undefined): number | undefined {
  const src = SHUNT_SOURCE[id];
  if (!src || d == null || !Number.isFinite(d)) return d;
  const s = dOf(src);
  return s != null && Number.isFinite(s) && s > 0 ? Math.min(d, s) : d;
}
