// How the lobule's vessels are shaded, as 2D's Tube draws them (tube-cel-glsl.js), on the cel objects the lobule already builds (WP5; owner, 19 Nov: "match 2D 1:1").
//
// A tube (a sinusoid, an inlet, the twig, a lymphatic, a bile duct) is the flat fill in exactly three tones lit from the top left of the SCREEN (celTones: shadow -17 %, the fill, lit
// +15 % toward white, each edge about a pixel soft, left out on hairlines) with no world light, no band and no specular; its line is clamp(0.14 R, 1.5, 3) device px (the 2D rule, as
// vessels/cel-ink.ts holds it). A disc (a vessel cut across: the central vein, the portal venule, the arteriole, the ductule, the lymphatic) is 2D's celDisc: one flat tone, a pale band
// just inside its wall (celRing), its wall line opened where a vessel joins (ringOpen on the mouth mask lobule-mouths.js works out), and, where nothing joins it, a second line inside.
//
// materials/shaders.ts is the world-lit toon shader every other cel part still wears, so it is left as it is and this file rewrites it for the lobule at the lines it must, at start-up; the
// text is checked in tests/scene-lobule-shading.test.ts (every anchor found once) and compiled by glslang with the rest (tests/glsl-compile.test.ts, via gl-registry.ts).
import { Color, type BufferGeometry, type IUniform, type ShaderMaterial } from 'three';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../materials/shaders.ts';
import type { CelObject } from '../materials/cel.ts';
import { DISC_GLSL, DISC_LINE } from './from2d/disc-glsl.generated.js';
import { CEL } from '../vessels/cel-ink.ts';
import { CEL_TUBE_GLSL } from '../cel-glsl.ts';

/** `text` with `from` replaced by `to`; `from` must be there, once (a change in the shared shader that moves an anchor fails here, in node, not on a phone). */
function patch(text: string, from: string, to: string): string {
  const i = text.indexOf(from);
  if (i < 0 || text.indexOf(from, i + 1) >= 0) throw new Error(`lobule shading: expected exactly one of: ${from}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

const num = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const LINE = `clamp(${num(CEL.LINE_R)} * rDev, ${num(CEL.LINE_MIN)}, ${num(CEL.LINE_MAX)})`;
void DISC_LINE;

const VS_DECL = /* glsl */ `
uniform float tubeR;     // the tube's radius in its own units (the share of it a pixel of line is held to is worked out from it)
uniform float dpr;       // device pixels to a CSS pixel
uniform vec2 res;        // the canvas in CSS pixels
varying float vRdev;     // the tube's radius in device pixels at this vertex
#ifdef DISC
attribute vec3 disc;     // the share of the radius (0 centre, 1 rim, -1 the wall) and the direction from the centre in the 2D plane
attribute vec2 dctr;     // the disc's centre
attribute vec3 mouth;    // the rim mask's three words (lobule-mouths.js)
uniform float discK;     // how much of its healthy radius the disc has now
varying vec3 vDisc;
flat varying vec3 vMouth;
#endif
`;
const VS_POS = /* glsl */ `
  vec3 pos0 = position;
#ifdef DISC
  pos0.xy = dctr + (position.xy - dctr) * discK;
  vDisc = disc; vMouth = mouth;
#endif`;
const VS_RDEV = /* glsl */ `
  vRdev = (tubeR + inflate) * length(modelMatrix[0].xyz) * projectionMatrix[1][1] * res.y * 0.5 * dpr / max(-mv.z, 1e-6);`;

export const LOBULE_TOON_VS: string = (() => {
  let t = patch(TOON_VS, 'varying vec2 vUv;\nvoid main() {', `varying vec2 vUv;${VS_DECL}\nvoid main() {${VS_POS}`);
  t = patch(t, 'vec3 p = position + normal * (inflate + radius * (swell - 1.0));', 'vec3 p = pos0 + normal * (inflate + radius * (swell - 1.0));');
  t = patch(t, '  vV = normalize(-mv.xyz);', `  vV = normalize(-mv.xyz);${VS_RDEV}`);
  return t;
})();

const FS_DECL = /* glsl */ `
${CEL_TUBE_GLSL}
varying float vRdev;
#ifdef DISC
uniform float discJoin;   // 1 where vessels join the disc (its wall opens at their mouths), 0 where nothing does (it keeps its own inner line)
uniform vec3 discInk;
varying vec3 vDisc;
flat varying vec3 vMouth;
${DISC_GLSL}
#endif
`;
// (the fill: 2D's celTones on the fill's own colour; a disc has no lit side, only its pale band)
const FS_TONES = /* glsl */ `
#ifdef TONES3
  c = base;
#ifdef DISC
  float fwR = fwidth(vDisc.x);
  if (vDisc.x >= 0.0 && fwR > 1e-6) {
    float Rpx = 1.0 / fwR, Dd = (vDisc.x - 1.0) * Rpx;
    float wl = clamp(${num(CEL.LINE_R)} * Rpx, ${num(CEL.LINE_MIN)}, ${num(CEL.LINE_MAX)});
    float open = discJoin > 0.5 ? smoothstep(0.15, 0.85, ringOpen(vMouth, vec2(vDisc.y, vDisc.z))) : 0.0;
    c = celDisc(c, discInk, Dd, Rpx, discLine(discJoin, wl), 1.0, open);
  }
#else
#ifndef FLATFILL
  {
    vec3 sideT = normalize(cross(normalize(vT), normalize(vV)));
    float acrossT = dot(n, sideT);
    vec2 sideS = sideT.xy;
    float sl = length(sideS);
    sideS = sl > 1e-4 ? sideS / sl : vec2(1.0, 0.0);
    c = celTubeTone(c, acrossT, celTubeK(sideS), vRdev);   // (the figure's one tube GLSL: three flat tones, a hard edge)
  }
#endif
#endif
#endif
`;

export const LOBULE_TOON_FS: string = (() => {
  let t = patch(TOON_FS, 'varying vec2 vUv;\n', `varying vec2 vUv;\n${FS_DECL}`);
  t = patch(t, '  vec3 c = mix(sh, base, clamp(b, 0.0, 1.0));\n', `  vec3 c = mix(sh, base, clamp(b, 0.0, 1.0));${FS_TONES}`);
  t = patch(t, '  c += rim * 0.10 + sp * 0.32;\n', '#ifndef TONES3\n  c += rim * 0.10 + sp * 0.32;\n#endif\n');
  return t;
})();

const INK_VS_DECL = /* glsl */ `
uniform float tubeR;
uniform float inkR;      // the radius the line's width is held to (a disc that vessels join: theirs, as 2D's discWall)
uniform float dpr;
#ifdef DISC
attribute vec3 disc;
attribute vec2 dctr;
attribute vec3 mouth;
uniform float discK;
varying vec3 vDisc;
flat varying vec3 vMouth;
#endif
`;
export const LOBULE_INK_VS: string = (() => {
  let t = patch(INK_VS, 'varying float vU;\nvoid main() {', `varying float vU;${INK_VS_DECL}\nvoid main() {\n  vec3 pos0 = position;\n#ifdef DISC\n  pos0.xy = dctr + (position.xy - dctr) * discK;\n  vDisc = disc; vMouth = mouth;\n#endif`);
  t = patch(t, 'vec3 p = position + normal * inflate;', 'vec3 p = pos0 + normal * inflate;');
  // the line is 2D's: clamp(0.14 R, 1.5, 3) device px; a part drawn with no line (px 0: the space of Disse's band) keeps none
  t = patch(t, '  c.xy += nd * (px + hiPx * vHi) * 2.0 / res * c.w;',
    `  float rDev = (inkR + inflate) * length(modelMatrix[0].xyz) * projectionMatrix[1][1] * res.y * 0.5 * dpr / max(c.w, 1e-6);
  float lineW = px > 0.0 ? ${LINE} / dpr : 0.0;
  c.xy += nd * (lineW + hiPx * vHi) * 2.0 / res * c.w;`);
  return t;
})();

export const LOBULE_INK_FS: string = (() => {
  let t = patch(INK_FS, 'varying float vU;\n', `varying float vU;\n#ifdef DISC\nuniform float discJoin;\nvarying vec3 vDisc;\nflat varying vec3 vMouth;\n${DISC_GLSL}\n#endif\n`);
  t = patch(t, 'if (fadedOut()) discard;', 'if (fadedOut()) discard;\n#ifdef DISC\n  if (discJoin > 0.5 && smoothstep(0.15, 0.85, ringOpen(vMouth, vec2(vDisc.y, vDisc.z))) > 0.5) discard;   // (the wall is one line, none where a vessel joins)\n#endif\n ');
  return t;
})();

/** What a lobule object's shading is given: the tube's (or the disc's) radius in its own units, and for a disc how much of its healthy radius it has and whether vessels join it. */
export interface LobuleShadeOpts { radius: number; disc?: boolean; join?: boolean; inkRadius?: number; /** 2D gives the arteriole's twig, the bile and the space of Disse no light or shadow: one flat fill. */ flat?: boolean }

/** Puts the lobule's shading on a cel object built from `geometry` (the cel shaders, rewritten above, a few uniforms). Call once, right after the CelObject is made. */
export function lobuleShade(o: CelObject, geometry: BufferGeometry, dpr: IUniform<number>, opts: LobuleShadeOpts): void {
  const disc = !!opts.disc && !!geometry.getAttribute('disc');
  const tone = o.toon, ink = o.ink;
  const defines: Record<string, string> = { TONES3: '' };
  if (disc) defines.DISC = '';
  if (opts.flat) defines.FLATFILL = '';
  const withVi = geometry.getAttribute('ink') ? { VERTEX_INK: '' } : {};
  tone.vertexShader = LOBULE_TOON_VS; tone.fragmentShader = LOBULE_TOON_FS;
  tone.defines = { ...withVi, ...defines };
  ink.vertexShader = LOBULE_INK_VS; ink.fragmentShader = LOBULE_INK_FS;
  ink.defines = disc ? { DISC: '' } : {};
  const tubeR: IUniform<number> = { value: opts.radius }, inkR: IUniform<number> = { value: opts.inkRadius ?? opts.radius };
  const res = ink.uniforms.res as IUniform;   // (the one the ink already reads: the canvas in CSS pixels)
  tone.uniforms.tubeR = tubeR; ink.uniforms.tubeR = tubeR; ink.uniforms.inkR = inkR;
  tone.uniforms.dpr = dpr; ink.uniforms.dpr = dpr;
  tone.uniforms.res = res;
  const join: IUniform<number> = { value: opts.join ? 1 : 0 }, discK: IUniform<number> = { value: 1 };
  tone.uniforms.discJoin = join; ink.uniforms.discJoin = join;
  tone.uniforms.discK = discK; ink.uniforms.discK = discK;
  tone.uniforms.discInk = ink.uniforms.color as IUniform<Color>;   // (the outline's own colour: the disc's inner line is drawn in it)
  tone.needsUpdate = ink.needsUpdate = true;
}

/** The shading uniforms of an object `lobuleShade` has dressed. */
export function shadeUniforms(o: CelObject): { tubeR: IUniform<number>; inkR: IUniform<number>; discJoin: IUniform<number>; discK: IUniform<number> } {
  const m = (x: ShaderMaterial, k: string) => x.uniforms[k] as IUniform<number>;
  return { tubeR: m(o.toon, 'tubeR'), inkR: m(o.ink, 'inkR'), discJoin: m(o.toon, 'discJoin'), discK: m(o.toon, 'discK') };
}
