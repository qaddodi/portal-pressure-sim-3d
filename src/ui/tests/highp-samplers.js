// A fragment shader of GLSL ES 3.00 reads a `sampler2D` at LOWP unless it says otherwise, and `texelFetch` returns the sampler's precision: a float texture (the Doppler's RGBA32F columns, the FibroScan's R32F fields) is then
// clamped or rounded on a GPU that honours lowp (many Android Mali and Adreno parts). three.js says `precision highp sampler2D` for its own ShaderMaterials; a raw program must say it itself. The byte-copied 2D sources do not,
// and are never edited, so it is said where they are handed to the driver (spectrum-gl.ts, the FibroScan's gl-compile.shim.js) by this one function, which tests/shader-bindings.test.ts also runs on what the registry compiles.
/** `fs` with `precision highp sampler2D;` after its `precision highp float;` line (unchanged when it has one, or has no sampler). */
export function highpSamplers(fs) {
  if (/precision\s+highp\s+sampler2D\s*;/.test(fs) || !/\bsampler2D\b/.test(fs)) return fs;
  return fs.replace(/precision\s+highp\s+float\s*;/, (m) => `${m}\nprecision highp sampler2D;`);
}
