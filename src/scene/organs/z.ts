// The organs' depth (Mohammad, 20 Nov 2026: "give the organs Z depth ... the liver should be IN FRONT of the stomach; the renal vein and the kidney at the same depth as the IVC").
// Each organ's mesh is moved along z by its value here, in scene units (the vessels' tiers are frame2d.ts TIER_Z: the cava, the renal veins and the other back-tier veins sit at -0.32; arteries at 0.30 and up). x and y are not touched.
// Vessels are drawn over the organs after a depth clear (scene.ts), so this decides only how the organs lie among themselves (the see-through wash's depth order, the gut's cut-away behind the others, the contact shade).
import { TIER_Z } from '../frame2d.ts';
import { PLACED } from '../anatomy/source.ts';

/** Where each organ's mesh centre lies. The kidney is at the cava's depth; the liver is in front of the stomach (and of the esophagus, which is part of the stomach's mesh) and of the heart; the gut lies behind the liver and stomach. */
const TODAY_Z: Readonly<Record<string, number>> = {
  'kidney-l': TIER_Z.back,
  spleen: -0.12,
  stomach: -0.06,
  duodenum: -0.12,   // (behind the colon: the transverse colon crosses in front of it)
  bowel: -0.04,
  colon: -0.04,
  heart: -0.03,
  'heart-ra': -0.13,   // (the atrium's mesh stands 0.02 to 0.20, centre 0.11: this puts its centre on the cava's plane, TIER_Z.back, so the IVC enters it level)
  liver: 0.03,
  caudate: TIER_Z.back,   // (the lobe hugs the retrohepatic cava and its three short veins, so it lies at the cava's depth, as the kidney does at the renal vein's: a depth gap shifts it sideways off the cava at every turn of the view. Its pillow is built about its own mid-plane, organs/caudate.ts LOBE_Z)
};
/** How far each organ's mesh (organs/meshes.ts ORGAN_MESHES) is moved along z to its place: the shift every reader of a raw mesh adds (tests/organ-placed-depth.test.ts). With the approved placement (anatomy/source.ts PLACED)
 *  every mesh is built at its own depth already (the re-inflated organs at their zc, the gut tubes on their centrelines, the caudate egg about its centre: organs/placed-map.ts, gut-tubes.ts, caudate.ts), so nothing moves it again. */
export const ORGAN_Z: Readonly<Record<string, number>> = PLACED ? Object.fromEntries(Object.keys(TODAY_Z).map((id) => [id, 0])) : TODAY_Z;
