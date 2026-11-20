// How the lobule's vessels are shaded, as 2D's Tube draws them (tube-cel-glsl.js), on the cel objects the lobule already builds (WP5; owner, 19 Nov: "match 2D 1:1").
//
// A tube (a sinusoid, an inlet, the twig, a lymphatic, a bile duct) is the flat fill in exactly three tones lit from the top left of the SCREEN (celTones: shadow -17 %, the fill, lit
// +15 % toward white, each edge about a pixel soft, left out on hairlines) with no world light, no band and no specular; its line is clamp(0.14 R, 1.5, 3) device px (the 2D rule, as
// vessels/cel-ink.ts holds it). A disc (a vessel cut across: the central vein, the portal venule, the arteriole, the ductule, the lymphatic) is 2D's celDisc: one flat tone, a pale band
// just inside its wall (celRing), its wall line opened where a vessel joins (ringOpen on the mouth mask lobule-mouths.js works out), and, where nothing joins it, a second line inside.
//
// The flow marks are 2D's heads (from2d/chevron.generated.js, scripts/copy-chevrons.mjs): blood and the bile's slim filled arrowhead with the notched back (chevHead), spaced CHEV_PITCH CSS px by 2D's own lattice
// (chevLevel, chevKeep), inked near-black or cream by the lumen's luminance (orange, with the second small head, when reversed), the lymph's teal, the bile's leaf green. They are laid on AFTER the tones, so
// they are never banded or inked (owner, 20 Nov 2026: "Why is there stripe chevrons in the lobule wtf. Just use the normal chevrons similar to the 2D version"). The stripe mark of the shared shader is turned off here.
//
// materials/shaders.ts is the world-lit toon shader every other cel part still wears, so it is left as it is and this file rewrites it for the lobule at the lines it must, at start-up; the
// text is checked in tests/scene-lobule-shading.test.ts (every anchor found once) and compiled by glslang with the rest (tests/glsl-compile.test.ts, via gl-registry.ts).
import { Color, type BufferGeometry, type IUniform, type ShaderMaterial } from 'three';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../materials/shaders.ts';
import type { CelObject } from '../materials/cel.ts';
import { DISC_GLSL, DISC_LINE } from './from2d/disc-glsl.generated.js';
import { CEL } from '../vessels/cel-ink.ts';
import { BILE_HEADS, CHEV_FLIP, CHEV_GLSL, CHEV_ORANGE_GLSL, CHEV_PITCH_GLSL, LYMPH_INK, LY_OCT, LY_PITCH } from './from2d/chevron.generated.js';
import { LOBULE_R } from './shots.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../cel-glsl.ts';

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
varying float vRdev;     // the tube's (mean) radius in device pixels at this vertex
attribute float rad;     // the tube's own radius at this vertex, scene units (batch.ts)
varying float vRl;       // that radius in device pixels (the flow heads are sized by it)
varying float vPxU;      // device pixels to a scene unit here
#ifdef DISC
attribute vec3 disc;     // the share of the radius (0 centre, 1 rim, -1 the wall) and the direction from the centre in the 2D plane
attribute vec2 dctr;     // the disc's centre
attribute vec3 mouth;    // the rim mask's three words (lobule-mouths.js)
uniform float discK;     // how much of its healthy radius the disc has now
varying vec3 vDisc;
varying vec2 vDiscP;     // where in the unit disc this fragment is (the plane position over the radius, so length() is the exact share of the radius and atan() the exact direction: not a per-triangle slope)
flat varying vec3 vMouth;
#endif
`;
const VS_POS = /* glsl */ `
  vec3 pos0 = position;
#ifdef DISC
  pos0.xy = dctr + (position.xy - dctr) * discK;
  vDisc = disc; vMouth = mouth;
  vDiscP = disc.x >= 0.0 ? disc.x * disc.yz : disc.yz;   // (the cap: 0 at its centre, the unit direction at its rim, so the fan carries the plane position itself; the wall: its direction)
#endif`;
const VS_RDEV = /* glsl */ `
  float pxU = length(modelMatrix[0].xyz) * projectionMatrix[1][1] * res.y * 0.5 * dpr / max(-mv.z, 1e-6);
  vPxU = pxU;
  vRdev = (tubeR + inflate) * pxU;
  vRl = max(rad + inflate, 0.0) * pxU;`;

export const LOBULE_TOON_VS: string = (() => {
  let t = patch(TOON_VS, 'varying vec2 vUv;\nvoid main() {', `varying vec2 vUv;${VS_DECL}\nvoid main() {${VS_POS}`);
  t = patch(t, 'vec3 p = position + normal * (inflate + radius * (swell - 1.0));', 'vec3 p = pos0 + normal * (inflate + radius * (swell - 1.0));');
  t = patch(t, '  vV = normalize(-mv.xyz);', `  vV = normalize(-mv.xyz);${VS_RDEV}`);
  return t;
})();

/** The scene's units as the heads' lattice reads them: the lobule's radius is 400 of them (2D's chevLevel clamps its level at 14 units, a spacing the close zoom never asks for, so the lattice is never held up). */
export const HEAD_K = 400 / LOBULE_R;
/** The heads' phase wraps here (head-world units): a whole number of periods of every lattice (blood 28 * 2^n, lymph 8 * 2^n, bile 56), so a wrap never moves a head. */
export const HEAD_PERIOD = 28 * 4096;
const f4 = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const v3 = (a: readonly number[]) => `vec3(${a.map(f4).join(', ')})`;
/** What a head's `kind` uniform says: 0 blood (2D's lattice, inked by the lumen), 1 lymph (teal), 2 bile (leaf green). */
export const HEAD_KIND = { blood: 0, lymph: 1, bile: 2 } as const;

const HEADS_DECL = /* glsl */ `
uniform float dpr;          // device pixels to a CSS pixel (shared with the vertex shader)
uniform float headAmount;   // how much of the heads show: 0 none .. 1 all (the layer's fade)
uniform float headKind;
uniform float headPhase;    // the stream's distance along the flow, head-world units, signed (it advances on the CPU, as 2D's sm.D)
uniform float headDir;      // +1 the heads run toward larger uv.x, -1 toward smaller
uniform float headRev;      // 0 .. 1 the reversed flag (an orange head with a second small one behind it)
uniform float headArc;      // scene units to one unit of uv.x
uniform vec3 headDark;      // the near-black ink and the cream one (2D's chevInk, chevLight), and the reversed orange
uniform vec3 headLight;
uniform vec3 headRevCol;
varying float vRl;
varying float vPxU;
const float HEAD_K = ${f4(HEAD_K)};
${CHEV_GLSL}
${CHEV_PITCH_GLSL}
${CHEV_ORANGE_GLSL}
`;

// (the heads: laid on the finished tones, so no band or line ever touches them; a tube too thin to carry one shows none, as 2D's)
const FS_HEADS = /* glsl */ `
#ifndef DISC
  if (headAmount > 0.001) {
    float pxW = vPxU / HEAD_K;                       // device px to a head-world unit
    float cpx = dpr / pxW;                           // head-world units to a CSS px
    float S = vUv.x * headArc * HEAD_K;
    float R = max(vRl, 0.01);                        // the tube's radius here, device px
    float ay = abs(cos(6.28318530718 * vUv.y)) * R;  // across the tube (uv.y is the angle round it, the tube's frame lies in the plate)
    float x = 0.0, keep = 1.0, hw = 1.0, gate = 1.0;
    if (headKind < 0.5) {
      vec2 cl = chevLevel(1.0 / pxW, dpr, 1.0, -1.0);
      float n0 = floor(cl.x), P = 28.0 * exp2(n0);
      float j = floor((S - headPhase) / P + 0.5);
      x = S - (headPhase + j * P);
      keep = chevKeep(j, n0, cl.x);
      hw = min(0.8 * R, clamp(0.5 * R, 4.0 * dpr, 8.0 * dpr));
      gate = smoothstep(1.5 * dpr, 2.5 * dpr, R) * smoothstep(0.85 * hw, 1.15 * hw, R);
    } else if (headKind < 1.5) {
      float base = ${f4(LY_PITCH * 400)};
      float lv = clamp(log2(max(${f4(LYMPH_INK.gapCss)} * cpx / base, 1.0)), 0.0, ${f4(LYMPH_INK.octaves)});
      float oc = floor(lv), P = base * exp2(oc), qq = (S - headPhase) / P, jj = floor(qq);
      keep = mod(jj, 2.0) < 0.5 || oc >= ${f4(LYMPH_INK.octaves)} ? 1.0 : 1.0 - (lv - oc);
      x = (qq - jj - 0.5) * P;
      hw = min(${f4(LYMPH_INK.size[1])} * R, min(${f4(LYMPH_INK.size[3])} * dpr, max(${f4(LYMPH_INK.size[0])} * R, ${f4(LYMPH_INK.size[2])} * dpr)));
      gate = smoothstep(${f4(LYMPH_INK.across[0])}, ${f4(LYMPH_INK.across[1])}, R);
    } else {
      float P = ${f4(BILE_HEADS.pitch * 400)};
      x = (fract((S - headPhase) / P) - 0.5) * P;
      hw = min(${f4(BILE_HEADS.hw[0])} * R, clamp(${f4(BILE_HEADS.hw[1])} * R, ${f4(BILE_HEADS.hw[2])} * dpr, ${f4(BILE_HEADS.hw[3])} * dpr));
      gate = smoothstep(${f4(BILE_HEADS.gate[0])}, ${f4(BILE_HEADS.gate[1])}, R);
    }
    vec2 h = chevHead(headDir * x * pxW, ay, hw, 1.0, headKind < 0.5 ? headRev : 0.0) * keep * gate * headAmount;
    vec3 core, rimc;
    if (headKind < 0.5) {
      float dk = 1.0 - smoothstep(${f4(CHEV_FLIP[0])}, ${f4(CHEV_FLIP[1])}, dot(pow(max(base, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)));
      float warm = headRev * chevOrange(base);
      vec3 ink = mix(headDark, base * 0.3, 0.2);
      core = mix(mix(mix(ink, headLight, dk), headRevCol, headRev), headLight, warm);
      rimc = mix(vec3(0.2314, 0.1725, 0.1333), headLight, dk);
    } else if (headKind < 1.5) {
      float onLight = smoothstep(${f4(LYMPH_INK.luma[0])}, ${f4(LYMPH_INK.luma[1])}, dot(base, vec3(0.299, 0.587, 0.114)));
      core = mix(${v3(LYMPH_INK.onDark)}, ${v3(LYMPH_INK.onLight)}, onLight);
      rimc = core;
      h.y = 0.0;
    } else {
      core = ${v3(BILE_HEADS.core)};
      rimc = ${v3(BILE_HEADS.rim)};
    }
    float ac = clamp(h.x * ${f4(LYMPH_INK.strength)}, 0.0, 1.0), ar = clamp(h.y * (headKind > 1.5 ? ${f4(BILE_HEADS.rimStrength)} : 0.75), 0.0, 1.0);
    c = c * (1.0 - (ac + ar * (1.0 - ac))) + core * ac + rimc * ar * (1.0 - ac);
  }
#endif
`;
const FS_DECL = /* glsl */ `
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
varying float vRdev;
${HEADS_DECL}
#ifdef DISC
uniform float discJoin;   // 1 where vessels join the disc (its wall opens at their mouths), 0 where nothing does (it keeps its own inner line)
uniform vec3 discInk;
uniform float discK;
varying vec3 vDisc;
varying vec2 vDiscP;
flat varying vec3 vMouth;
${DISC_GLSL}
#endif
`;
// (the fill: 2D's celTones on the fill's own colour; a disc has no lit side, only its pale band)
const FS_TONES = /* glsl */ `
#ifdef TONES3
  c = base;
#ifdef DISC
  // (the radius in device pixels is the one the vertex stage works out from the camera, not fwidth(): fwidth is |dx|+|dy|, 1.0 to 1.41 times the slope by direction, and flat per triangle of the fan: a star-shaped, faceted vein)
  float Rpx = vRdev * discK;
  if (vDisc.x >= 0.0 && Rpx > 1e-3) {
    float Dd = (length(vDiscP) - 1.0) * Rpx;
    float wl = clamp(${num(CEL.LINE_R)} * Rpx, ${num(CEL.LINE_MIN)}, ${num(CEL.LINE_MAX)});
    float open = discJoin > 0.5 ? smoothstep(0.15, 0.85, ringOpen(vMouth, vDiscP)) : 0.0;
    c = celDisc(c, discInk, Dd, Rpx, discLine(discJoin, wl), 1.0, open);
  }
#else
#ifndef FLATFILL
  {
    float sT = dot(n, celLightView());
    float sTw = fwidth(sT);
    c = celTubeTone(c, sT, sTw, vRdev);   // (the figure's one tube GLSL: two flat tones lit by the world light, a hard edge)
  }
#endif
#endif
#endif
`;

export const LOBULE_TOON_FS: string = (() => {
  let t = patch(TOON_FS, 'varying vec2 vUv;\n', `varying vec2 vUv;\n${FS_DECL}`);
  t = patch(t, '  vec3 c = mix(sh, base, clamp(b, 0.0, 1.0));\n', `  vec3 c = mix(sh, base, clamp(b, 0.0, 1.0));${FS_TONES}`);
  t = patch(t, '  c += rim * 0.10 + sp * 0.32;\n', `${FS_HEADS}#ifndef TONES3\n  c += rim * 0.10 + sp * 0.32;\n#endif\n`);
  // the stripe chevron of the shared shader is gone from the lobule: only the stagnant blood's soft smoke bands (flowBands) are drawn by that block
  t = patch(t, 'm * (flowBands > 0.5 ? 0.30 : 0.85)', 'm * (flowBands > 0.5 ? 0.30 : 0.0)');
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
varying vec2 vDiscP;
flat varying vec3 vMouth;
#endif
`;
export const LOBULE_INK_VS: string = (() => {
  let t = patch(INK_VS, 'varying float vU;\nvoid main() {', `varying float vU;${INK_VS_DECL}\nvoid main() {\n  vec3 pos0 = position;\n#ifdef DISC\n  pos0.xy = dctr + (position.xy - dctr) * discK;\n  vDisc = disc; vMouth = mouth;\n  vDiscP = disc.x >= 0.0 ? disc.x * disc.yz : disc.yz;\n#endif`);
  t = patch(t, 'vec3 p = position + normal * inflate;', 'vec3 p = pos0 + normal * inflate;');
  // the line is 2D's: clamp(0.14 R, 1.5, 3) device px; a part drawn with no line (px 0: the space of Disse's band) keeps none
  t = patch(t, '  c.xy += nd * (px + hiPx * vHi) * 2.0 / res * c.w;',
    `  float rDev = (inkR + inflate) * length(modelMatrix[0].xyz) * projectionMatrix[1][1] * res.y * 0.5 * dpr / max(c.w, 1e-6);
  float lineW = px > 0.0 ? ${LINE} / dpr : 0.0;
  c.xy += nd * (lineW + hiPx * vHi) * 2.0 / res * c.w;`);
  return t;
})();

export const LOBULE_INK_FS: string = (() => {
  let t = patch(INK_FS, 'varying float vU;\n', `varying float vU;\n#ifdef DISC\nuniform float discJoin;\nvarying vec3 vDisc;\nvarying vec2 vDiscP;\nflat varying vec3 vMouth;\n${DISC_GLSL}\n#endif\n`);
  t = patch(t, 'if (fadedOut()) discard;', 'if (fadedOut()) discard;\n#ifdef DISC\n  if (discJoin > 0.5 && smoothstep(0.15, 0.85, ringOpen(vMouth, vDiscP)) > 0.5) discard;   // (the wall is one line, none where a vessel joins)\n#endif\n ');
  return t;
})();

/** What a lobule object's shading is given: the tube's (or the disc's) radius in its own units, and for a disc how much of its healthy radius it has and whether vessels join it. */
export interface LobuleShadeOpts { /** The flow heads this object carries: their kind and the scene units to one unit of uv.x (view.ts). */ heads?: { kind: number; arc: number }; radius: number; disc?: boolean; join?: boolean; inkRadius?: number; /** 2D gives the arteriole's twig, the bile and the space of Disse no light or shadow: one flat fill. */ flat?: boolean }

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
  // the flow heads' own uniforms (an object that carries none keeps headAmount at 0 and the block off)
  Object.assign(tone.uniforms, {
    headAmount: { value: 0 }, headKind: { value: opts.heads?.kind ?? 0 }, headPhase: { value: 0 }, headDir: { value: 1 }, headRev: { value: 0 }, headArc: { value: opts.heads?.arc ?? 1 },
    headDark: { value: new Color() }, headLight: { value: new Color() }, headRevCol: { value: new Color() },
  });
  tone.uniforms.discInk = ink.uniforms.color as IUniform<Color>;   // (the outline's own colour: the disc's inner line is drawn in it)
  tone.needsUpdate = ink.needsUpdate = true;
}

/** The shading uniforms of an object `lobuleShade` has dressed. */
export function shadeUniforms(o: CelObject): { tubeR: IUniform<number>; inkR: IUniform<number>; discJoin: IUniform<number>; discK: IUniform<number> } {
  const m = (x: ShaderMaterial, k: string) => x.uniforms[k] as IUniform<number>;
  return { tubeR: m(o.toon, 'tubeR'), inkR: m(o.ink, 'inkR'), discJoin: m(o.toon, 'discJoin'), discK: m(o.toon, 'discK') };
}
