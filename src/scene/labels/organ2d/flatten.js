// A path of M, L, C and Z (what the organs' outlines are made of) flattened to polylines: the 2D app's flattenPath(d, tol) as organ-names.js asks it (shape-gl.js
// is the GPU drawer and has no place here). Each subpath comes back as { pts: [x0, y0, x1, y1, …] }; a curve is cut so no piece is longer than `tol` units.
export function flattenPath(d, tol = 2) {
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const out = [];
  let cur = null, i = 0, x = 0, y = 0, cmd = '';
  const num = () => parseFloat(toks[i++]);
  const push = (px, py) => { cur.pts.push(px, py); x = px; y = py; };
  while (i < toks.length) {
    const t = toks[i];
    if (/^[MLCZ]$/i.test(t)) { cmd = t.toUpperCase(); i++; if (cmd === 'Z') { if (cur) { cur.closed = true; out.push(cur); cur = null; } continue; } }
    if (cmd === 'M') { if (cur) out.push(cur); cur = { pts: [], closed: false }; push(num(), num()); cmd = 'L'; }
    else if (cmd === 'L') push(num(), num());
    else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num(), x0 = x, y0 = y;
      const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2), n = Math.max(2, Math.ceil(len / tol));
      for (let k = 1; k <= n; k++) {
        const u = k / n, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, e = u * u * u;
        push(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
      }
    } else i++;
  }
  if (cur) out.push(cur);
  return out;
}
