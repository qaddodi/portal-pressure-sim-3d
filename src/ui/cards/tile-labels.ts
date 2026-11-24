// Which of a scale bar's cut-off numbers a narrow tile can print: each number stays inside the bar (the ones at the ends lean in) and keeps 8 px from the one before it. A number that would touch the
// one before it is left out, the others stay (Stiffness 4, capture 572259fd: two numbers 7 px too close hid the bar's every number, and the liver stiffness gauge stood with its zones and no scale).
export interface LabelBox { left: number; right: number; width: number }
export interface LabelFit { lean: 'lo' | 'hi' | null; off: boolean }
export function fitLabels(B: { left: number; right: number }, rs: readonly LabelBox[], gap = 8): LabelFit[] {
  let end = -Infinity;
  return rs.map((r) => {
    if (!r.width) return { lean: null, off: false };
    let left = r.left, right = r.right, lean: LabelFit['lean'] = null;
    if (r.left < B.left) { lean = 'lo'; left += r.width / 2; right += r.width / 2; } else if (r.right > B.right) { lean = 'hi'; left -= r.width / 2; right -= r.width / 2; }
    if (left < end + gap) return { lean, off: true };
    end = right;
    return { lean, off: false };
  });
}
