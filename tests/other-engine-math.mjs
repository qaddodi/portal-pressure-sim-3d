// Loaded with `node --import` (tests/fingerprint.test.ts): every transcendental Math result is moved by one ulp, up and down in turn, as another engine's libm may give it (Safari's sin, cos, pow and
// exp are not node's to the last bit). Whatever a baked file is recognised by must survive this.
const f64 = new Float64Array(1), u64 = new BigInt64Array(f64.buffer);
let k = 0;
const ulp = (x) => { if (!Number.isFinite(x) || x === 0) return x; f64[0] = x; u64[0] += (k++ & 1) ? 1n : -1n; return f64[0]; };
for (const n of ['sin', 'cos', 'tan', 'atan2', 'atan', 'asin', 'acos', 'exp', 'log', 'pow', 'hypot', 'cbrt', 'log2', 'log10', 'expm1', 'log1p', 'sinh', 'cosh', 'tanh']) {
  const o = Math[n];
  Math[n] = (...a) => ulp(o(...a));
}
