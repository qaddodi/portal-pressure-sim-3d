// WHEN EACH PART OF THE SINUSOID ARRIVES in the dive from the lobule (owner, 27 Nov 2026: "zoom from anatomy to lobule to sinusoid ... every zoom out should feel like one continuous zoom; now the
// lobule disappears and the sinusoid view appears"). Before, one fade took every part in
// together under the blur, so everything but the target lumen changed in place at once. Now detail arrives by its
// size on screen, the big parts first, the way the lines already ramp (sinusoid3d rimK): the lumen, the hepatocyte plates and the ground (which match the lobule's, so they cross unseen), then the
// lining and Disse's space once a few pixels thick, then the fenestrae, the Kupffer and stellate cells, the red cells, and the albumin last.
// A part's size on screen grows with the camera's closeness, which the dive's share measures in log distance (sinusoid/view.ts diveShare), so a band of share IS a band of pixels, the same
// for every room, and every fade here is a pure function of the camera's distance: zooming out runs it backward and a move turned half way never jumps. Pure numbers, no GPU, no clock.

/**
 * The handoff's band in the dive's share (the owner's zoom plan, 27 Nov: widened from 0.45-0.68 so the crossing is local and longer):
 * every part arrives inside it and the sinusoid is whole at its end.
 */
export const HANDOFF = [0.25, 0.85] as const;

export type ArrivalTier = 'plates' | 'lining' | 'fine' | 'cells' | 'albumin';
/** Each tier's arrival: the share it starts at and is whole at (ordered: a later tier never starts before an earlier one and never ends before it). */
export const ARRIVAL: Readonly<Record<ArrivalTier, readonly [number, number]>> = {
  plates: [HANDOFF[0], 0.45],
  lining: [0.4, 0.6],
  fine: [0.5, 0.7],
  cells: [0.6, 0.8],
  albumin: [0.7, HANDOFF[1]],
};
export const ARRIVAL_ORDER: readonly ArrivalTier[] = ['plates', 'lining', 'fine', 'cells', 'albumin'];

/** The part names (sinusoid3d's `mk` names) and the tier each arrives with. Anything not listed arrives with the fine parts. */
export const TIER_OF: Readonly<Record<string, ArrivalTier>> = {
  ground: 'plates', lumen: 'plates', 'lumen-beyond': 'plates', hepatocytes: 'plates', nuclei: 'plates', nucleoli: 'plates',
  disse: 'lining', endothelium: 'lining', 'endothelium-cut': 'lining', 'endothelium-bores': 'lining', 'endothelial-nuclei': 'lining', basement: 'lining',
  canaliculi: 'fine', kupffer: 'fine', 'kupffer-nucleus': 'fine', stellate: 'fine', 'stellate-nucleus': 'fine', ends: 'fine', microvilli: 'fine', collagen: 'fine',
  'red-cells': 'cells',
  albumin: 'albumin',
};
export const tierOf = (name: string): ArrivalTier => TIER_OF[name] ?? 'fine';

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How whole a tier is at the dive's share `d`: 0 before its start, 1 from its end, a smooth rise between. Null (at rest): whole. */
export function arrival(tier: ArrivalTier, d: number | null): number {
  if (d == null) return 1;
  return smooth(ARRIVAL[tier][0], ARRIVAL[tier][1], d);
}
/** How whole the sinusoid's plates, lumen and ground are (the parts that match the lobule's): what the lobule's standing aside follows. */
export const plateArrival = (d: number | null): number => arrival('plates', d);

/** The share the 3D lobule starts to stand aside from under the sinusoid: where the sinusoid's plates are whole, so the lobule can never leave before the matching parts have landed. */
export const STAND_ASIDE_FROM = ARRIVAL.plates[1];
/** The share over which it stands aside. */
export const STAND_ASIDE_SPAN = 0.04;
/** How far the lobule has stood aside at share `d` (0 whole, 1 gone): a function of the same share the plates arrive by, never ahead of them. */
export function standAside(d: number | null): number {
  return d == null ? 1 : smooth(STAND_ASIDE_FROM, STAND_ASIDE_FROM + STAND_ASIDE_SPAN, d);
}
