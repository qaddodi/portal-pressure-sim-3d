// Mirror for paired parts (audit 16): the left and right hepatic, renal, hepatic-artery and portal-branch vessels, and the junctions between them. The body's midline is x = 0 of the plan
// (the patient's right is the viewer's left), so a mirrored edit moves the partner the other way along x and the same way in y and depth.
const SWAP: Readonly<Record<string, string>> = { R: 'L', L: 'R', RHV: 'LHV', LHV: 'RHV', RRV: 'LRV', LRV: 'RRV', HR: 'HL', HL: 'HR', RR: 'LL', LL: 'RR' };
/** The id of the opposite-side part (a junction or a vessel), or null when it has none that exists: each of its `_` words that names a side is swapped. */
export function mirrorId(id: string, exists: (id: string) => boolean): string | null {
  const parts = id.split('_');
  let swapped = false;
  const out = parts.map((p) => { const q = SWAP[p]; if (q) { swapped = true; return q; } return p; }).join('_');
  return swapped && out !== id && exists(out) ? out : null;
}
/** An offset as the opposite side wants it: x flipped across the midline, y and depth alike. */
export const mirrorOffset = (m: { dx: number; dy: number; dz: number }): { dx: number; dy: number; dz: number } => ({ dx: -m.dx, dy: m.dy, dz: m.dz });
