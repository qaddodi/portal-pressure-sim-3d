// The caudate lobe's short hepatic veins (2D: anatomy.js CAUDATE.veins, stage.js `caud`; pin b3058ef3): three small veins that leave the lobe's tissue and open straight into the retrohepatic IVC's left wall, below the hepatic veins. In
// Budd-Chiari they are the liver's outflow, patent while the three main hepatic veins are clotted. They are one tributary group on the IVC piece they enter (`<host>~F:caudate`, three courses), drawn only while a slide is about the lobe
// and eased in and out by the scene (scene.ts setCaudate), and they open into the cava by the same rule as the hepatic veins (fades.ts CAVA_FEEDERS: the vein takes the cava's colour and its faint alpha at the wall and is cut away inside
// the lumen, so both have one fade at the junction). Each one rises out of the lobe's own tissue (fades in over its first stretch, no end to see).
import { editedPlan } from '../../editor/vessel-plan.ts';
import { CAUDATE_VEINS } from '../organs/caudate.ts';
import { JOIN_SPAN, type BranchItem, type BranchSet } from './liver-branches.ts';

/** The IVC piece the veins enter (the cava below the TIPS/DIPS junction at y 306: the lobe lies at y 300 to 418) and the `when` of their group. */
export const CAUDATE_HOST = 'IVC_IS_1';
export const CAUDATE_WHEN = 'caudate-veins';
/** The group's vessel id (network.ts). */
export const CAUDATE_VEIN_ID = `${CAUDATE_HOST}~F:${CAUDATE_WHEN}`;
/** Each vein's width at the cava, 2D units: 2D draws 3, 3.6 and 2.8 (a 3-unit tube is 1.5 px on a phone, under the cel outline's own width); here about twice that, still a third of the cava's 16. */
export const CAUDATE_WIDTHS: readonly number[] = [5.6, 6.6, 5.2];
const N = 48;
type P2 = readonly [number, number];

const nums = (d: string): number[] => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
/** The cava's centreline x at `y` on its piece (2D plane). */
function cavaX(y: number): number {
  const p = editedPlan()[CAUDATE_HOST]!;
  let best = p[0]!, bd = Infinity;
  for (const q of p) { const d = Math.abs(q[1] - y); if (d < bd) { bd = d; best = q; } }
  return best[0];
}
/** Where along the cava's piece (0 at its start, 1 at its end) the veins enter: the stretch of its colour ramp they wear, so they begin in the colour the cava has there. */
function entrySpan(): readonly [number, number] {
  const p = editedPlan()[CAUDATE_HOST]!, s = [0];
  for (let i = 1; i < p.length; i++) s.push(s[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const at = (y: number): number => { let k = 0, bd = Infinity; p.forEach((q, i) => { const d = Math.abs(q[1] - y); if (d < bd) { bd = d; k = i; } }); return s[k]! / s[s.length - 1]!; };
  const ys = CAUDATE_VEINS.map(([d]) => nums(d)[5]!), a = at(Math.max(...ys)), b = at(Math.min(...ys));
  return [Math.min(a, b), Math.max(a, b)];
}

/** One vein: 2D's quadratic from inside the lobe to the cava's wall, carried on to the cava's axis (the shader cuts it away inside the lumen), flow order (lobe to cava). */
function vein([d]: readonly [string, number], width: number, hostW: number): BranchItem {
  const [x0, y0, cx, cy, , y1] = nums(d) as [number, number, number, number, number, number], ex = cavaX(y1), ey = y1 - 1.5;
  const pts: P2[] = [];
  for (let i = 0; i < N; i++) { const t = i / (N - 1), u = 1 - t; pts.push([u * u * x0 + 2 * u * t * cx + t * t * ex, u * u * y0 + 2 * u * t * cy + t * t * ey]); }
  // (the end goes into the cava level with its axis: the cava's wall covers it, and its cut and ink hold-back are the hepatic veins' own)
  return { k: width / hostW, fan: true, when: CAUDATE_WHEN, src: null, out: false, pts, dz: pts.map(() => 0), taper: [0.5, 1], taperSpan: [1, JOIN_SPAN], join: 1 };
}

/** The group: three veins on the cava's piece. `hostW` is the cava's width in 2D units (network.ts NETWORK_HOST_W). */
export function caudateVeinSet(hostW: number): BranchSet {
  return { host: CAUDATE_HOST, when: CAUDATE_WHEN, span: entrySpan(), list: CAUDATE_VEINS.map((c, i) => vein(c, CAUDATE_WIDTHS[i]!, hostW)) };
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
