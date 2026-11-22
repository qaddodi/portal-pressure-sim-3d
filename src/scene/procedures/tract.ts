// The TIPS tract, drawn while the run makes it. The needle crosses the liver from the hepatic vein to the portal vein (the hit: portal blood flashes back up the needle), the wire follows, and the balloon dilates the
// track to the stent's width; the model takes the shunt only at `apply`, after the balloon is down. Before this the tract appeared at full width at `apply`, so the needle, wire and balloon crossed empty liver and
// the balloon inflated around nothing (owner, 22 Nov: "the tract doesn't dilate"). Here the TIPS vessel (the engine's own edge) is drawn from the needle's hit as a thin tract and widens with the balloon to the
// stent's diameter; at `apply` the engine's D takes over at that same width (src/engine/tract-override.ts draws the larger of the two), so nothing pops. A pure function of the run's clock: it seeks, rewinds and replays with it.
/** The tract the needle leaves, mm: a needle, a wire, a sheath's worth (the vein width rule floors a thin vessel, so this reads as a hairline track). */
export const TRACT_NEEDLE_MM = 1.5;
/** The stent's diameter when none is given, mm (SHUNT_BASE_D.TIPS). */
export const TRACT_STENT_MM = 8;
/** The edge the TIPS procedures dilate. */
export const TRACT_EDGE = 'TIPS';
/** The edge a procedure's tract is made on: the DIPS's own shunt for the DIPS, the TIPS's for every TIPS run. */
export const tractEdgeOf = (kind: string): string => (kind === 'dips' ? 'DIPS' : TRACT_EDGE);
const k01 = (t: number, a: number, b: number): number => (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : t >= b ? 1 : 0);
const smooth = (x: number): number => x * x * (3 - 2 * x);
const smoother = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10);
export interface TractTimes { flash0: number; inflate0: number; inflate1: number }
/** Whether a procedure's timeline is a TIPS one (needle hit, balloon): the table of `specOf(kind).T`. */
export const tractTimes = (T: unknown): TractTimes | null => {
  const q = T as Partial<TractTimes> | null | undefined;
  return q && typeof q.flash0 === 'number' && typeof q.inflate0 === 'number' && typeof q.inflate1 === 'number' ? (q as TractTimes) : null;
};
/** The tract's drawn diameter (mm) at run time `t` (ms): nothing before the hit, a needle's width as the hit lands, then the balloon's own inflation up to `stentMm`, held (the balloon's deflation never narrows it: it is dilated). */
export function tractDiameter(T: TractTimes, t: number, stentMm = TRACT_STENT_MM): number {
  if (!(t > T.flash0)) return 0;
  const thin = TRACT_NEEDLE_MM * Math.max(0.02, smooth(k01(t, T.flash0, T.flash0 + 600)));
  return thin + Math.max(0, stentMm - TRACT_NEEDLE_MM) * smoother(k01(t, T.inflate0, T.inflate1));
}
/** How fast a tract the run is no longer driving lets go (ms): it never snaps away when a slide is left or the run replays. */
export const TRACT_RELEASE_MS = 450;
