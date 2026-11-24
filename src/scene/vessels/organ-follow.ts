// Vessels that start, end or lie inside an organ follow the organ's edit (the anatomy editor, audit item 1): a vein's end in the liver, the splenic vein at the hilum, the renal vein at the kidney,
// the cava into the atrium, the varices on the stomach. The organ's edit is the one point map of the mesh (organ-apply.ts organPointMap), so a vessel end lands where the organ's tissue went.
// The ends are eased along the arm like a node move (vessel-apply.ts); an intrahepatic bed lies inside the organ and is carried whole. A leaf of the vessel modules (editor-anchors.ts imports
// network.ts, which builds on this, so the organ's outline centre is read here too, from the same outlines).
// @ts-ignore copied plain JS
import { ORGANS } from '../labels/organ2d/outlines.copied.js';
// @ts-ignore copied plain JS
import { flattenPath } from '../labels/organ2d/flatten.js';
import { type Box, organBoxes, organCentroids, organPointMap } from '../../editor/organ-apply.ts';
import { overrides } from '../../editor/store.ts';
import type { Overrides, V3 } from '../../editor/types.ts';
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

const centres = new Map<string, { centre: V3; box: Box }>();
function outlineOf(organ: string): { centre: V3; box: Box } {
  let c = centres.get(organ);
  if (!c) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, any = false;
    for (const id of OUTLINES[organ] ?? [organ]) {
      const o = (ORGANS as { id: string; d?: string; ring?: string }[]).find((q) => q.id === id);
      for (const p of o ? (flattenPath((o.ring ?? o.d)!, 4) as { pts: number[] }[]) : []) {
        for (let i = 0; i + 1 < p.pts.length; i += 2) { any = true; x0 = Math.min(x0, p.pts[i]!); x1 = Math.max(x1, p.pts[i]!); y0 = Math.min(y0, p.pts[i + 1]!); y1 = Math.max(y1, p.pts[i + 1]!); }
      }
    }
    const z = ORGAN_Z[organ] ?? 0;
    // (the mesh is the outline extruded by the one map: its box middle is the outline's; before the mesh is made the cage frame is the outline's box and 0.1 each side in depth, as editor-anchors.ts takes it)
    centres.set(organ, c = any ? { centre: [x3((x0 + x1) / 2), y3((y0 + y1) / 2), z], box: { lo: [x3(x0), y3(y1), z - 0.1], hi: [x3(x1), y3(y0), z + 0.1] } } : { centre: [0, 0, 0], box: { lo: [0, 0, 0], hi: [0, 0, 0] } });
  }
  return c;
}

const memo = new WeakMap<Overrides, Map<string, Disp | null>>();
/** Where the organ's edit puts a 2D plan point of its tissue (move, turn, scale, liquify, cage and grid: the mesh's own arithmetic, organPointMap): the shift in plan units and in depth (scene units); null when the organ is not edited.
 *  `o` is the overrides it reads (the page's own by default; the live preview passes the draft). */
export function organDisp(organ: string, o: Overrides = overrides()): Disp | null {
  let m = memo.get(o);
  if (!m) memo.set(o, m = new Map());
  if (!m.has(organ)) {
    const e = o.organs?.[organ], ol = e ? outlineOf(organ) : null;
    const map = e && ol ? organPointMap(e, organCentroids[organ] ?? ol.centre, organBoxes[organ] ?? (e.cage ? ol.box : undefined)) : null, z0 = ORGAN_Z[organ] ?? 0;
    m.set(organ, map ? (x, y) => { const q = map([x3(x), y3(y), z0]); return [x2d(q[0]) - x, y2d(q[1]) - y, q[2] - z0]; } : null);
  }
  return m.get(organ)!;
}

/** The organs an edge lies in or on (its ends' nodes, or the liver for a bed inside it). */
export function organsOf(e: { from: string; to: string; kind: string }): string[] {
  if (INSIDE_LIVER_KINDS.has(e.kind)) return ['liver'];
  return [...new Set([NODE_ORGAN[e.from], NODE_ORGAN[e.to]].filter((x): x is string => !!x))];
}

/** How an edge follows the organs it lies in or on under overrides `o` (undefined when none of them is edited). */
export function anchorsOf(e: { from: string; to: string; kind: string }, o: Overrides = overrides()): Anchors | undefined {
  if (!o.organs) return undefined;
  if (INSIDE_LIVER_KINDS.has(e.kind)) { const d = organDisp('liver', o); return d ? { all: d } : undefined; }
  const a = NODE_ORGAN[e.from] ? organDisp(NODE_ORGAN[e.from]!, o) : null, b = NODE_ORGAN[e.to] ? organDisp(NODE_ORGAN[e.to]!, o) : null;
  return a || b ? { from: a ?? undefined, to: b ?? undefined } : undefined;
}
