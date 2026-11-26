// The focus reveal's shader chunk (config.ts says what the effect is). A pure function of the PIXEL: every program that reads it (the occluder's fill, the hidden structure's fill and line)
// agrees at every pixel by construction. The segment and the band are in the figure target's pixels; `frvC` carries the target being drawn into (the organ veil's half-size map, or the figure
// itself) to those pixels, so the map and the figure fade the same place.
import { ShaderMaterial } from 'three';

export const FOCUS_REVEAL_DECL = /* glsl */ `
uniform vec4 frvSeg;  // the focus's segment on the screen: its two ends, in the figure target's pixels
uniform vec4 frvP;    // x the strength now (0: off), y the band's inner and z its outer radius (figure px), w the occluder's largest share taken
uniform vec4 frvC;    // xy one over the size of the target drawn into now, zw the figure target's size: gl_FragCoord to figure px
uniform float frvOcc; // 1 for an organ that hides the focus (its fill fades)
float frvAt(vec2 fragXY) {
  if (frvP.x <= 0.0) return 0.0;
  vec2 p = fragXY * frvC.xy * frvC.zw, a = frvSeg.xy, e = frvSeg.zw - frvSeg.xy;
  float t = clamp(dot(p - a, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
  return frvP.x * (1.0 - smoothstep(frvP.y, frvP.z, length(p - a - e * t)));
}
`;

/** The fragment shader of a hidden structure's see-through pass: the organ's own program, its result laid only as far as the reveal reaches here (and nothing at all where it does not). */
export function revealPassFs(fs: string): string {
  const decl = /\bfrvAt\b/.test(fs) ? '' : FOCUS_REVEAL_DECL;
  const end = fs.lastIndexOf('}');
  if (end < 0) throw new Error('focus reveal: a fragment shader with no main');
  return `${decl}${fs.slice(0, end)}  gl_FragColor.a *= frvAt(gl_FragCoord.xy);\n  if (gl_FragColor.a < 0.002) discard;\n}`;
}

/** A see-through pass of `m`: the same program (its source, defines and the SAME uniforms object, so everything the organ's paint and the clock write reaches it too) with the reveal laid
 *  over its result. */
export function revealPassOf(m: ShaderMaterial, name: string, extra: Record<string, { value: unknown }>): ShaderMaterial {
  Object.assign(m.uniforms, extra);
  const r = new ShaderMaterial({ name, vertexShader: m.vertexShader, fragmentShader: revealPassFs(m.fragmentShader), uniforms: m.uniforms, side: m.side, transparent: true, depthWrite: false });
  r.defines = { ...(m.defines ?? {}) };
  return r;
}
