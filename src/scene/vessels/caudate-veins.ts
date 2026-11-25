// The caudate lobe's short hepatic veins (2D: anatomy.js CAUDATE.veins, stage.js `caud`; pin b3058ef3): three small veins that leave the lobe's tissue and open straight into the retrohepatic IVC's left wall, below the hepatic veins. In
// Budd-Chiari they are the liver's outflow, patent while the three main hepatic veins are clotted. They are one tributary group on the IVC piece they enter (`<host>~F:caudate`, three courses), drawn only while a slide is about the lobe
// and eased in and out by the scene (scene.ts setCaudate), and they open into the cava by the same rule as the hepatic veins (fades.ts CAVA_FEEDERS: the vein takes the cava's colour and its faint alpha at the wall and is cut away inside
// the lumen, so both have one fade at the junction). Each one rises out of the lobe's own tissue (fades in over its first stretch, no end to see).
import { PLACED_CAUDATE_HOST, PLACED_CAUDATE_VEINS, shareOn, to2D } from '../anatomy/placed-network.ts';
import { JOIN_SPAN, type BranchItem, type BranchSet } from './liver-branches.ts';

/** The IVC piece the veins enter (the piece their ends lie on: the DIPS lands at the lobe's foot, below them) and the `when` of their group. */
export const CAUDATE_HOST: string = PLACED_CAUDATE_HOST;
export const CAUDATE_WHEN = 'caudate-veins';
/** The group's vessel id (network.ts). */
export const CAUDATE_VEIN_ID = `${CAUDATE_HOST}~F:${CAUDATE_WHEN}`;
/** Each vein's width at the cava, 2D units: 2D draws 3, 3.6 and 2.8 (a 3-unit tube is 1.5 px on a phone, under the cel outline's own width); here about twice that, still a third of the cava's 16. */
export const CAUDATE_WIDTHS: readonly number[] = [5.6, 6.6, 5.2];
/** The group: three veins on the cava's piece. `hostW` is the cava's width in 2D units (network.ts NETWORK_HOST_W). */
/** The approved placement's three caudate veins (cv1 to cv3: out of the lobe on the liver's back into the cava's left wall), already joined into the cava's centreline (placed-network.ts), each at its own depth. */
export function caudateVeinSet(hostW: number): BranchSet {
  const list = PLACED_CAUDATE_VEINS.map((c, i): BranchItem => {
    const { pts, z } = to2D(c);
    return { k: CAUDATE_WIDTHS[i]! / hostW, fan: true, when: CAUDATE_WHEN, src: null, out: false, pts, dz: pts.map(() => 0), zs: z, taper: [0.5, 1], taperSpan: [1, JOIN_SPAN], join: 1 };
  });
  const at = PLACED_CAUDATE_VEINS.map((c) => Math.min(1, Math.max(0, shareOn(CAUDATE_HOST, c[c.length - 1]!))));
  return { host: CAUDATE_HOST, when: CAUDATE_WHEN, span: [Math.min(...at), Math.max(...at)], list };
}

/** The veins that carry the liver's outflow to the cava: a clot in any of them, or a narrowing of the cava where they open (the IVC web), obstructs it (docs/pathology-spec.md). */
const HV_OUTFLOW: readonly string[] = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
export const hepaticOutflowObstructed = (p: { thrombus?: Record<string, number>; stenosis?: Record<string, number> } | null | undefined): boolean =>
  HV_OUTFLOW.some((id) => (p?.thrombus?.[id] ?? 0) > 0) || (p?.stenosis?.IVCS_RA ?? 0) > 0;

/** Whether the anatomy shows the caudate lobe and its short veins (Mohammad, 22 Nov audit 4: Budd-Chiari "names the caudate and draws none of it"). Shown when a slide pins it, or when the hepatic outflow is
 *  obstructed (Budd-Chiari, the IVC web) and the caudate's veins carry more than twice the healthy flow (`live`: network.ts feederLive 'caudate', 0 to 1, which also sets how far the lobe has grown).
 *  Not in SOS: its obstruction is in the sinusoids and the hepatic veins are patent, though the feeder reads 1 there too. Pure; the scene calls it on every frame. */
export function caudateShownFor(live: number, params: Parameters<typeof hepaticOutflowObstructed>[0], pin: { lobe: boolean; veins: boolean }): { lobe: boolean; veins: boolean } {
  const auto = live > 0 && hepaticOutflowObstructed(params);
  return { lobe: pin.lobe || auto, veins: pin.veins || auto };
}
