// The GLSL both vessel programs read, written once: the tube's (vessels/shaders.ts VESSEL_VS and VESSEL_FS) and the junction skin's (vessels/skin/shaders.ts SKIN_VS and SKIN_FS). A skin blends its arms' live widths,
// colours, fades and highlight, so the rules it blends must be the tube's own: a copy would drift, and the seam between an arm's tube and its skin would show it (rebuild-3d/junction-skin-spec.md sections 4.6 to 4.8).
//
// A chunk is a piece of GLSL spliced exactly where it stood, so the assembled VESSEL_VS and VESSEL_FS are byte for byte what they were before the move (tests/glsl-shared.test.ts holds them to a snapshot).
// A chunk names the uniforms it reads; the program that includes it declares them. The JS functions return an EXPRESSION (a string) for a rule that is one line at its call sites, in the caller's own variable names.
import { CHEV, CHEV_INK_ROW, CHEV_LEVEL_MIN } from '../blood/chevron-glsl.ts';
import { STREAK } from '../blood/streak-glsl.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { glslNum as F } from '../cel-glsl.ts';
import { TAPER_FROM, TAPER_TO } from './cel-ink.ts';

/** swellOf(idx, bD, kind): a vessel's live width against the one its tube was built at (the engine's diameter by the 2D figure's rule). Reads: useData, vdata, vdataSize. */
export const SWELL_OF_GLSL = /* glsl */ `// a vessel's live width against the one its tube was built at (the engine's diameter by the 2D figure's rule), as the body of main() reads it for this vessel
float swellOf(float idx, float bD, float kind) {
  if (useData < 0.5 || kind > 1.5) return 1.0;
  ivec2 tm = ivec2(int(mod(idx, vdataSize.x)), int(floor(idx / vdataSize.x)));
  float dm = texelFetch(vdata, tm, 0).b;
  float m1 = 1.3 * max(2.6, 2.0 * pow(max(dm, 0.1), 0.72)), m0 = 1.3 * max(2.6, 2.0 * pow(max(bD, 0.1), 0.72));
  if (kind > 0.5) { m1 = max(1.8, m1 * 0.5); m0 = max(1.8, m0 * 0.5); }
  return clamp(m1 / m0, 0.2, 8.0);
}`;

/** lensOfAt(lensIx, u, grad, lanes, mode, pal, across): the colour of one lens set at the place u along a vessel's ramp; .a says whether the lens colours it. Reads: lensUse, lensTail, lensSmooth. */
export const LENS_OF_AT_GLSL = /* glsl */ `// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
float lensAcrossFw = 0.0;   // fwidth of the lane position (across * 0.5 + 0.5): set by main BEFORE its first discard, because a derivative after a discard is garbage on a device that drops the lane
vec4 lensOfAt(float lensIx, float u, sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  if (mode < 0.5 || lensUse < 0.5) return vec4(0.0);
  ivec2 i0 = ivec2(int(lensIx), 0), i1 = ivec2(int(lensIx), 1);
  vec4 g0 = texelFetch(grad, i0, 0), g1 = texelFetch(grad, i1, 0);
  if (g0.a + g1.a < 0.5) return vec4(0.0);
  float t = lensTail > 0.5 ? smoothstep(0.55, 1.0, u) : u;
  if (mode < 1.5) {
    if (lensSmooth > 0.5) {
      // the ramp's own colours along the vessel (model.ts: the pressure a third and two thirds of the way along), so a vessel that crosses a threshold passes through amber and not through a blend of its ends
      vec3 g2 = texelFetch(grad, ivec2(int(lensIx), 2), 0).rgb, g3 = texelFetch(grad, ivec2(int(lensIx), 3), 0).rgb;
      float x = t * 3.0;
      return vec4(x < 1.0 ? mix(g0.rgb, g2, x) : (x < 2.0 ? mix(g2, g3, x - 1.0) : mix(g3, g1.rgb, x - 2.0)), 1.0);
    }
    return vec4(mix(g0.rgb, g1.rgb, t), 1.0);
  }
  vec4 c = mix(texelFetch(lanes, i0, 0), texelFetch(lanes, i1, 0), t);
  float f = across * 0.5 + 0.5;
  float w = max(lensAcrossFw * 1.2, 0.002);
  vec3 col = pal[4];
  col = mix(col, pal[3], 1.0 - smoothstep(c.w - w, c.w + w, f));
  col = mix(col, pal[2], 1.0 - smoothstep(c.z - w, c.z + w, f));
  col = mix(col, pal[1], 1.0 - smoothstep(c.y - w, c.y + w, f));
  col = mix(col, pal[0], 1.0 - smoothstep(c.x - w, c.x + w, f));
  return vec4(col, 1.0);
}`;

/** chevCreamOf(la, grad, mode, idx, col): the flow heads' tone on a vessel (its lens index `idx`, its own colour `col`) under one lens set. Used by flowHeads below, so the tube and the skin's arms read one rule. Reads: chevCreamSoft (blood/chevron-glsl.ts), celTubeBase. */
export const CHEV_CREAM_GLSL = /* glsl */ `// the flow heads' tone on a vessel under one lens set (1 cream .. 0 dark ink): the vessel's latched, eased ink from the fifth row of the colour texture (lenses/chevron-ink.ts) where the lens runs a colour along it (la.a, a set of
// colours and not lanes), else the short eased step on the colour it is drawn in
float chevCreamOf(vec4 la, sampler2D grad, float mode, float idx, vec3 col) {
  if (la.a > 0.5 && mode < 1.5) return smoothstep(0.0, 1.0, texelFetch(grad, ivec2(int(idx), ${CHEV_INK_ROW}), 0).r);
  return chevCreamSoft(celTubeBase(mix(col, la.rgb, la.a)));
}`;

/** The ink's own colour on a body colour `base` (a GLSL expression): the look's casing ink taken INK_OWN of the way to a deep tone of the vessel's own colour (never black, never white). Reads: inkColor, tubeDark, celTubeBase. */
export const inkColourGlsl = (base: string): string =>
  `mix(inkColor, celTubeBase(${base}) * mix(${F(CEL_STYLE.TUBE.INK_TONE)}, ${F(CEL_STYLE.TUBE.INK_TONE_DARK)}, tubeDark), ${F(CEL_STYLE.TUBE.INK_OWN)})`;

/** A picked vessel's outline colour (Mohammad, 20 Nov: "i don't like the outline; the glow is ok; maybe make it the color of the vessel"): the ink of `inkColourGlsl(base)` taken HI_INK of the way (eased by `hi`, the pick's own weight 0..1: vHi on a tube, the blended arm weight on a
 *  junction skin) to the vessel's own colour as drawn: the lit tone x HI_DEEP on the light looks, lifted HI_LIFT toward white on the dark ones (the glow's own rule, highlight.ts). One expression for the tube and the skin, so a welded junction's line is the tube's. Reads: inkColor, tubeDark, celTubeBase. */
export const inkHiColourGlsl = (base: string, hi: string): string =>
  `mix(${inkColourGlsl(base)}, mix(celTubeBase(${base}) * ${F(CEL_STYLE.TUBE.HI_DEEP)}, mix(celTubeBase(${base}), vec3(1.0), ${F(CEL_STYLE.TUBE.HI_LIFT)}), tubeDark), ${F(CEL_STYLE.TUBE.HI_INK)} * smoothstep(0.0, 1.0, ${hi}))`;

/** The ink line's width in CSS px (a GLSL expression) for a lumen of `rCss` CSS px of radius: LINE_R of it held between LINE_MIN and LINE_MAX, thinned with a hairline lumen (cel-ink.ts inkTaper, judged on `taperR`). */
export const inkPxGlsl = (rCss: string, taperR: string): string =>
  `clamp(${F(CEL_STYLE.LINE_R)} * ${rCss}, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, ${taperR})`;

/** The figure's units under one CSS pixel at clip depth `w` (a GLSL expression): w * 2 / (res.y * the projection's y scale), times `scale` (the figure's units in one scene unit here, vU). Reads: res. */
export const wpcGlsl = (w: string, projY: string, scale: string): string => `${w} * 2.0 / (res.y * ${projY}) * ${scale}`;

/** chevOne (one vessel's heads placed by a stream's pattern) and chevOrange: the tube's rule, written once so the skin's per-arm heads are the tube's own. Reads: chevKeep, chevHw, chevSize, chevAlpha, chevHead (CHEVRON_GLSL). */
export const CHEV_ONE_GLSL = /* glsl */ `// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(${F(CHEV_LEVEL_MIN)}, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  float kp = chevKeep(j, n0, lv);
  float hw = chevHw(R, wpc) * chevSize(kp), L = ${(2 * CHEV.LEN_OF_W).toFixed(1)} * hw;   // (a head is 6 CSS px tall from a tube 6 px across, as tall as the tube on a narrower one)
  if (abs(x) > (0.6 + 0.4 * rv) * L + 0.15 * hw + 4.0 * px) return vec2(0.0);
  float lo = 0.6 * L, ramp = max(2.0 * L, 0.12 * Pt);
  float a0 = sc < lo ? 0.0 : smoothstep(lo, lo + ramp, sc), a1 = Lw - sc < lo ? 0.0 : smoothstep(lo, lo + ramp, Lw - sc);
  float fade = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0))) * chevAlpha(kp);
  if (fade <= 0.0) return vec2(0.0);
  float dir = vd != 0.0 ? sign(vd) : (rv > 0.5 ? -1.0 : 1.0);
  return chevHead(dir * x, abs(across) * R, hw, px, rv) * fade;
}
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}`;

/**
 * THE FLOW MARKS of one vessel at one pixel, written once: the tube (vessels/shaders.ts) calls them with its own arc and the skin (skin/shaders.ts) calls them once per ARM with that arm's arc, so a streak or a head is the same code on both
 * (Mohammad, 20 Nov: "the streaks still break between vessels"; the dust, chevrons and the stream chain's routes are drawn by these two functions and nowhere else).
 *   flowDust(across, fr, s, Lw, rOwn, vR, rCss, lensI, dataI, baseDv, lit, vUn)   (fr: the section frame, blood/dust-glsl.ts dustFrame; flowFrame gives a skin arm's frame and gate)   the dust, premultiplied (rgb, a), already scaled by the streak amount, the flow gate and the lumen's width gate. s the arc along the vessel (figure units), Lw its length,
 *                                                                        rOwn its rest radius, vR the lumen's radius now, rCss the same in CSS px, lensI its lens index (stream and chain texels), dataI and baseDv its data texel and built diameter, lit its lit tone, vUn the figure's units in a scene unit here (the chain hands a root's radius in scene units).
 *   flowHeads(across, acrossW, s, Lw, vR, wpc, pxArc, lensI, flowAmt, endK, la, lb, col, base)   the heads, premultiplied (rgb, coverage); endK the tube's end fade (1 where nothing buries the end), la/lb the lens colours of the two sets at this pixel, col the vessel's own colour, base the colour it is drawn in.
 * Reads: streakAmt, streamTex, chainTex, useData, vdata, vdataSize, markDark, markLight, markRev, lensMix, lensModeA/B, lensGradA/B, inkColor, and dustTube, dustSkin, DFrame, chevOne, chevOrange, chevInk, chevCreamOf, CHEV_RIM.
 */
export const FLOW_MARKS_GLSL = /* glsl */ `// the dust's frame for one vessel at this pixel (blood/dust-glsl.ts DFrame): fr the section frame (dustFrame), and the gate it shows by (the streak amount, the flow, the lumen's width), returned; rev its stream's eased reversed flag
float flowFrame(float across, vec4 fr, float s, float Lw, float rOwn, float vR, float rCss, float lensI, float dataI, float baseDv, float vUn, out DFrame F, out float rev) {
  vec4 smS = texelFetch(streamTex, ivec2(int(lensI), 0), 0);   // the blood's own distance and speed on this vessel: reversed runs back, none stands
  float nar = 1.0;
  if (useData > 0.5) { ivec2 tcn = ivec2(int(mod(dataI, vdataSize.x)), int(floor(dataI / vdataSize.x))); nar = texelFetch(vdata, tcn, 0).b / max(baseDv, 0.1); }
  F = DFrame(across, fr.xy, fr.zw, s, Lw, rOwn, vR, rCss, nar, smS.y, lensI, vUn);
  rev = smS.z;
  if (streakAmt <= 0.001 || vR <= 0.0 || abs(across) >= 0.97) return 0.0;
  // (none only where the flow is none: the particles ride the root's own distance, streams.ts texel w, through the route table, blood/routes.ts)
  return streakAmt * smoothstep(${F(CHEV.MIN_R_PX)}, ${F(CHEV.MIN_R_PX + 0.6)}, rCss) * smoothstep(0.0, ${F(STREAK.FLOW_ON)}, abs(smS.y));
}
// the dust of one vessel at this pixel (the tube's), premultiplied and gated: its roots' particles in its own section frame (dustTube). The skin blends its two heaviest arms' frames instead (dustSkin), from the same flowFrame.
vec4 flowDust(float across, vec4 fr, float s, float Lw, float rOwn, float vR, float rCss, float lensI, float dataI, float baseDv, vec3 lit, float vUn) {
  DFrame F; float rev;
  float dOn = flowFrame(across, fr, s, Lw, rOwn, vR, rCss, lensI, dataI, baseDv, vUn, F, rev);
  if (dOn <= 0.002) return vec4(0.0);
  vec4 dust = dustTube(F, lit, inkColor, rev);
  return vec4(dust.rgb * dOn, dOn * dust.a);
}
vec4 flowHeads(float across, float acrossW, float s, float Lw, float vR, float wpc, float pxArc, float lensI, float flowAmt, float endK, vec4 la, vec4 lb, vec3 col, vec3 base) {
  if (flowAmt <= 0.001 || vR <= 0.0) return vec4(0.0);
  vec4 stm = texelFetch(streamTex, ivec2(int(lensI), 0), 0);
  float Dm = stm.x, vd = stm.y, rv = stm.z;
  float R = max(vR, 0.3);
  float px = clamp(pxArc, 0.15 * wpc, 1.5 * wpc);   // (held to a CSS pixel: at a grazing silhouette the arc's derivative runs away and would smear a head)
  float Pt = ${F(CHEV.PITCH_PX)} * wpc;
  vec4 c4 = texelFetch(chainTex, ivec2(int(lensI), 0), 0), c5 = texelFetch(chainTex, ivec2(int(lensI), 1), 0);
  vec2 ch = vec2(0.0);
  if (c4.w < 1.0) ch = chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px);
  if (c4.w > 0.0) {
    float rootD = texelFetch(streamTex, ivec2(int(c4.x + 0.5) - 1, 0), 0).x;
    vec2 cc = chevOne(s, Lw, c4.y + c4.z * s, c4.z, rootD, vd, rv, c5.xy, R, across, wpc, Pt, px);
    ch = c4.w >= 1.0 ? cc : mix(ch, cc, c4.w);
  }
  // heads are on every tube down to about 4 CSS px across (R 1.5 px: the spacing never depends on the width), and are cut at the wall (never on the ink)
  float fade = endK * flowAmt * smoothstep(${F(CHEV.MIN_R_PX)} * wpc, ${F(CHEV.MIN_R_PX + 0.6)} * wpc, R) * (1.0 - smoothstep(1.0, 1.0 + acrossW, abs(across)));
  fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
  if (fade <= 0.0 || ch.x + ch.y <= 0.0) return vec4(0.0);
  float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
  // one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one. The tone is the VESSEL's own latched, eased value (lenses/chevron-ink.ts), read from the lens texture's fifth row
  float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
  float cream = mix(chevCreamOf(la, lensGradA, lensModeA, lensI, col), chevCreamOf(lb, lensGradB, lensModeB, lensI, col), lensMix);
  vec3 core = mix(mix(chevInk(cream, markDark, markLight), markRev, rk), markLight, warm);   // (the one chevron's tone: blood/chevron-glsl.ts)
  float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
  return vec4(core * ac + CHEV_RIM * ar * (1.0 - ac), ac + ar * (1.0 - ac));   // (the head's outline is always the dark ink: a flat head with a dark line, never a pale ring)
}`;
