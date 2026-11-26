// A vessel the procedure is MAKING is drawn before the engine has it: the TIPS tract the needle crosses and the balloon dilates (instrument run, 22 Nov: "the tract doesn't dilate"). The model takes the
// shunt only at the run's `apply` (D > 0, the stent's diameter); until then the tract is drawn from this table, and from then on at the larger of the two, so the hand-over from the run to the engine
// can never shrink or pop. Pure and tiny: the vessel-data texture (vessel-data.ts) and the presence rule (network.ts presenceOf) both read it, so they cannot disagree.
const mm = new Map<string, number>();
let version = 0;
/** Draw vessel `id` at least `d` mm wide (0 or less lets it go). */
export function setDrawnDiameter(id: string, d: number): void {
  const next = d > 0 ? d : 0;
  if ((mm.get(id) ?? 0) === next) return;
  if (next === 0) mm.delete(id); else mm.set(id, next);
  version++;
}
export const drawnDiameter = (id: string): number => mm.get(id) ?? 0;
/** The ONE width rule for a vessel the table may be drawing: the larger of the engine's diameter `d` (mm, undefined when unknown) and the table's, as the vessel texture draws it. Everything that sizes itself to the vein
 *  as drawn (the vessel shader's data, the catheters' balloons) reads the width through this, so a balloon in a tract the run is dilating sees the tract it is widening, not the engine's still-closed shunt. */
export function drawnWidthD(id: string, d: number | undefined): number | undefined {
  const o = mm.get(id) ?? 0;
  return o > 0 ? Math.max(o, d != null && Number.isFinite(d) ? d : 0) : d;
}
/** Bumps whenever a diameter changes (the texture refills when it moves). */
export const drawnDiameterVersion = (): number => version;
/** The ids with an override now (a texture fill walks only these). */
export const drawnDiameterIds = (): IterableIterator<[string, number]> => mm.entries();
/** Whether any vessel is drawn by the table (the presence rule asks before it asks the engine). */
export const hasDrawnDiameters = (): boolean => mm.size > 0;
