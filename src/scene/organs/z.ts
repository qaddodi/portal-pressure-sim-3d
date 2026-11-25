// The organs' depth (Mohammad, 20 Nov 2026: "give the organs Z depth ... the liver should be IN FRONT of the stomach; the renal vein and the kidney at the same depth as the IVC").
// With the approved placement (docs/approved/anatomy-placement.md) every organ mesh is built at its own depth already (the re-inflated organs at their zc, the gut tubes on their centrelines, the caudate egg
// about its centre: organs/placed-map.ts, gut-tubes.ts, caudate.ts). The 2D figure's per-organ shifts (the kidney on the cava's tier, the liver in front of the stomach) were last used at commit f17b151a.
import { PLACED_A } from './placed-map.ts';

const ORGAN_IDS = ['kidney-l', 'spleen', 'stomach', 'duodenum', 'bowel', 'colon', 'heart', 'heart-ra', 'liver', 'caudate'] as const;
/** How far each organ's mesh (organs/meshes.ts ORGAN_MESHES) is moved along z to its place: the shift every reader of a raw mesh adds (tests/organ-placed-depth.test.ts). Every mesh is built at its own
 *  depth, so nothing moves it again: 0 for every organ. */
export const ORGAN_Z: Readonly<Record<string, number>> = Object.fromEntries(ORGAN_IDS.map((id) => [id, 0]));
/** Where each organ lies in depth, for a reader that needs the organ's place and not its mesh's shift (a vessel that starts in it: vessels/network.ts, the splenic vein at the spleen): each re-inflated
 *  organ's own mid-depth (placed-map.ts zc), 0 for the others. */
export const ORGAN_DEPTH: Readonly<Record<string, number>> = { ...ORGAN_Z, ...Object.fromEntries(Object.entries(PLACED_A).filter(([, a]) => a.zc !== undefined).map(([id, a]) => [id, a.zc!])) };
