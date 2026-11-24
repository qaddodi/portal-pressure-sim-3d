// Vessels that start, end or lie inside an organ follow the organ's edit (the anatomy editor, audit item 1): a vein's end in the liver, the splenic vein at the hilum, the renal vein at the kidney,
// the cava into the atrium, the varices on the stomach. The organ's edit is the one point map of the mesh (organ-apply.ts organPointMap), so a vessel end lands where the organ's tissue went.
// The ends are eased along the arm like a node move (vessel-apply.ts); an intrahepatic bed lies inside the organ and is carried whole. A leaf of the vessel modules (editor-anchors.ts imports
// network.ts, which builds on this, so the organ's outline centre is read here too, from the same outlines).
// @ts-ignore copied plain JS
import { ORGANS } from '../labels/organ2d/outlines.copied.js';
// @ts-ignore copied plain JS
import { flattenPath } from '../labels/organ2d/flatten.js';
import { organBoxes, organPointMap } from '../../editor/organ-apply.ts';
import { overrides } from '../../editor/store.ts';
import type { V3 } from '../../editor/types.ts';
import { ORGAN_Z } from '../organs/z.ts';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import type { Anchors, Disp } from '../../editor/vessel-apply.ts';

/** The organ each topology node lies in or on. */
export const NODE_ORGAN: Readonly<Record<string, string>> = {
  SPL: 'spleen', STO: 'stomach', VAR: 'stomach', GV: 'stomach', KID_L: 'kidney-l', LRV_S: 'kidney-l', RA: 'heart-ra', INT: 'bowel', COL: 'colon',
  SIN_R: 'liver', SIN_L: 'liver', CV_R: 'liver', CV_L: 'liver', W_R: 'liver', W_M: 'liver', W_L: 'liver', RHV: 'liver', MHV: 'liver', LHV: 'liver',
  PVH: 'liver', RPV: 'liver', LPV: 'liver', RPV_A: 'liver', RPV_T: 'liver', RHV_T: 'liver', LPV_A: 'liver',
};
/** The vessels drawn wholly inside the liver (the sinusoid, wedge and central-vein beds). */
export const INSIDE_LIVER_KINDS: ReadonlySet<string> = new Set(['liver', 'wedge']);
const OUTLINES: Readonly<Record<string, readonly string[]>> = { stomach: ['stomach', 'esophagus'] };

const centres = new Map<string, V3>();
function centreOf(organ: string): V3 {
  let c = centres.get(organ);
  if (!c) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, any = false;
    for (const id of OUTLINES[organ] ?? [organ]) {
      const o = (ORGANS as { id: string; d?: string; ring?: string }[]).find((q) => q.id === id);
      for (const p of o ? (flattenPath((o.ring ?? o.d)!, 4) as { pts: number[] }[]) : []) {
        for (let i = 0; i + 1 < p.pts.length; i += 2) { any = true; x0 = Math.min(x0, p.pts[i]!); x1 = Math.max(x1, p.pts[i]!); y0 = Math.min(y0, p.pts[i + 1]!); y1 = Math.max(y1, p.pts[i + 1]!); }
      }
    }
    centres.set(organ, c = any ? [x3((x0 + x1) / 2), y3((y0 + y1) / 2), ORGAN_Z[organ] ?? 0] : [0, 0, 0]);
  }
  return c;
}

let builtFor: unknown = null, disps = new Map<string, Disp | null>();
/** Where the organ's edit puts a 2D plan point of its tissue: the shift in plan units and in depth (scene units); null when the organ is not edited. */
export function organDisp(organ: string): Disp | null {
  const o = overrides();
  if (builtFor !== o) { builtFor = o; disps = new Map(); }
  if (!disps.has(organ)) {
    const m = o.organs?.[organ] ? organPointMap(o.organs[organ], centreOf(organ), organBoxes[organ]) : null, z0 = ORGAN_Z[organ] ?? 0;
    disps.set(organ, m ? (x, y) => { const q = m([x3(x), y3(y), z0]); return [x2d(q[0]) - x, y2d(q[1]) - y, q[2] - z0]; } : null);
  }
  return disps.get(organ)!;
}

/** How an edge follows the organs it lies in or on (undefined when none of them is edited). */
export function anchorsOf(e: { from: string; to: string; kind: string }): Anchors | undefined {
  if (!overrides().organs) return undefined;
  if (INSIDE_LIVER_KINDS.has(e.kind)) { const d = organDisp('liver'); return d ? { all: d } : undefined; }
  const a = NODE_ORGAN[e.from] ? organDisp(NODE_ORGAN[e.from]!) : null, b = NODE_ORGAN[e.to] ? organDisp(NODE_ORGAN[e.to]!) : null;
  return a || b ? { from: a ?? undefined, to: b ?? undefined } : undefined;
}
