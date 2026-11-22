// The GLSL both vessel programs read, written once: the tube's (vessels/shaders.ts VESSEL_VS and VESSEL_FS) and the junction skin's (vessels/skin/shaders.ts SKIN_VS and SKIN_FS). A skin blends its arms' live widths,
// colours, fades and highlight, so the rules it blends must be the tube's own: a copy would drift, and the seam between an arm's tube and its skin would show it (rebuild-3d/junction-skin-spec.md sections 4.6 to 4.8).
//
// A chunk is a piece of GLSL spliced exactly where it stood, so the assembled VESSEL_VS and VESSEL_FS are byte for byte what they were before the move (tests/glsl-shared.test.ts holds them to a snapshot).
// A chunk names the uniforms it reads; the program that includes it declares them. The JS functions return an EXPRESSION (a string) for a rule that is one line at its call sites, in the caller's own variable names.
import { CHEV, CHEV_INK_ROW, CHEV_LEVEL_MIN } from '../blood/chevron-glsl.ts';
import { STREAK } from '../blood/streak-glsl.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { glslNum as F } from '../cel-glsl.ts';
import { CIRC_INK_K, TAPER_FROM, TAPER_TO } from './cel-ink.ts';
import { GLOW_GATE_T, GLOW_LIFT } from '../glow.ts';

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

/** The glow mask's weight (a GLSL expression) for a pick weight `hi`: eased, and taken away by the Circuit's change: glow.ts glowWeight. Reads: circT. */
export const glowWeightGlsl = (hi: string): string => `(smoothstep(0.0, 1.0, ${hi}) * (1.0 - smoothstep(0.0, ${F(GLOW_GATE_T)}, circT)))`;

/** The halo's colour (a GLSL expression) on a body colour `base`: the vessel's own colour as drawn, lifted toward white on the dark looks. Reads: tubeDark, celTubeBase. */
export const glowToneGlsl = (base: string): string => `mix(celTubeBase(${base}), vec3(1.0), ${F(GLOW_LIFT)} * tubeDark)`;

/** The ink line's width in CSS px (a GLSL expression) for a lumen of `rCss` CSS px of radius: LINE_R of it held between LINE_MIN and LINE_MAX, thinned with a hairline lumen (cel-ink.ts inkTaper, judged on `taperR`). */
export const inkPxGlsl = (rCss: string, taperR: string): string =>
  `clamp(${F(CEL_STYLE.LINE_R)} * ${rCss}, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, ${taperR})`;

/** The figure's units under one CSS pixel at clip depth `w` (a GLSL expression): w * 2 / (res.y * the projection's y scale), times `scale` (the figure's units in one scene unit here, vU). Reads: res. */
export const wpcGlsl = (w: string, projY: string, scale: string): string => `${w} * 2.0 / (res.y * ${projY}) * ${scale}`;

/** chevOne (one vessel's heads placed by a stream's pattern) and chevOrange: the tube's rule, written once so the skin's per-arm heads are the tube's own. Reads: chevKeep, chevHw, chevSize, chevAlpha, chevHead (CHEVRON_GLSL). */
export const CHEV_ONE_GLSL = /* glsl */ `// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
float chevCentreArc = 0.0;   // the arc (figure units) of the centre of the head the last chevOne call looked at: a skin hands a whole head to the one arm that owns its centre
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(${F(CHEV_LEVEL_MIN)}, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  chevCentreArc = sc;
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
  float scOwn = s;
  if (c4.w < 1.0) { ch = chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px); scOwn = chevCentreArc; }
  if (c4.w > 0.0) {
    float rootD = texelFetch(streamTex, ivec2(int(c4.x + 0.5) - 1, 0), 0).x;
    vec2 cc = chevOne(s, Lw, c4.y + c4.z * s, c4.z, rootD, vd, rv, c5.xy, R, across, wpc, Pt, px);
    ch = c4.w >= 1.0 ? cc : mix(ch, cc, c4.w);
    chevCentreArc = c4.w >= 1.0 ? chevCentreArc : mix(scOwn, chevCentreArc, c4.w);
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

/** A vessel's width on the map (map units, before the boost's floor on the screen) of this kind and diameter (width.ts circuitWidthMap). Reads: circBoost. Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const CIRC_WIDTH_OF_GLSL = /* glsl */ `float circWidthOf(float d, float kind) {
  if (kind > 1.5) return 8.0 * circBoost;
  if (kind > 0.5) return 3.0;
  return clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
}`;

/** The stump of a divided vein as a share of the radius at arc `a` (units from the start), `R` the radius there. Reads: stump. Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const STUMP_K_GLSL = /* glsl */ `float stumpK(float a, float R) {
  float q = clamp((a - stump.x) / max(R, 1e-3), 0.0, 1.0);
  float pq = (a - stump.y) / 5.5;
  return max(sqrt(max(0.0, 1.0 - (1.0 - q) * (1.0 - q))), 0.02) * (1.0 - 0.2 * stump.z * exp(-pq * pq));
}`;

/** A free end in the Circuit is round: the pixels outside a half circle at the end are carved away. Reads: circT, circCap, vUv, len, vU, vCen, projY, vR, inkOn. Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const CAP_CARVED_GLSL = /* glsl */ `bool capCarved(float across) {
  float k = smoothstep(0.7, 1.0, circT);
  if (k <= 0.0 || circCap.x + circCap.y < 0.5) return false;
  float dd = 1e9;
  if (circCap.x > 0.5) dd = vUv.x * len * vU;
  if (circCap.y > 0.5) dd = min(dd, (1.0 - vUv.x) * len * vU);
  float wpc = ${wpcGlsl('vCen.z', 'projY', 'vU')};   // (the axis's depth, the one the vertex stage built the line from)
  float rCss = vR / max(wpc, 1e-6);   // CSS px, as the vertex stage's line is (the same clamp)
  float ink = clamp(${F(CEL_STYLE.LINE_R)} * rCss, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * mix(1.0, ${F(CIRC_INK_K)}, circT) * wpc * inkOn;
  float R = (vR + ink) * k, a = dd + ink * k;
  if (a >= R) return false;
  float q = 1.0 - a / R;
  return across * across + q * q > 1.0;
}`;

/** The stent in the Circuit, the surgical stitches, the stump's tie and the wedge's amber column, painted on the tube (a part of main, in its own locals: c, across, pxArc, fwPx, fwTh, fwAcr, inkT; with stentU, stentWire, stentGoldC, seamA, seamB, stump, wedge, wedgeD, wedgeCol, circT, len, vU, vR, vR0, vArcLen, vUv, and what the stent's heading needs). Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const PROCEDURE_MARKS_GLSL = /* glsl */ `  // the stent in the Circuit (the 3D device is the body's; the map draws it on the shunt's own lane, as 2D does): the bare open cells (rings of five crowns, every other one turned half a crown), the gold band where the
  // graft starts, the nested rings along the graft and the graft's faint sleeve, all sized by the lumen (a twelfth of its half width is the mocks' unit, stent-build.ts), eased in with the morph
  if (stentU.x > 0.001 && circT > 0.001 && vUv.x > stentU.y && vUv.x < stentU.z) {
    float kS = stentU.x * circT, Lw = vArcLen * vU, s = vUv.x * Lw, un = max(vR0, 0.3) / 12.0, s0 = stentU.y * Lw, sE = stentU.z * Lw, sB = s0 + stentU.w * vR0;
    float sp = s - vSkew;
    float th = asin(clamp(across, -1.0, 1.0)), px = max(pxArc, 1e-4), cov = 0.0, gold = 0.0;
    bool hasG = stentU.w > 0.0 && sB > s0 + 6.0 * un && sB < sE - 4.0 * un;
    float bEnd = hasG ? sB : sE - 1.2 * un, t0 = s0 + 1.2 * un;
    float Nb = max(1.0, floor((bEnd - t0) / (17.0 * un) + 0.5)), Pb = (bEnd - t0) / Nb, Ab = 0.5 * Pb;
    float jb = floor((sp - t0) / Pb);
    for (int i = -1; i <= 1; i++) {
      float j = jb + float(i), ok = (j < 0.0 || j >= Nb || sp > bEnd + Ab) ? 0.0 : 1.0;
      float ph = mod(j, 2.0) > 0.5 ? 3.14159265 : 0.0;
      // (a wire's distance in SCREEN pixels, the distance over its own slope: a crown's steep flank stays one even line instead of breaking into dashes)
      float dv = sp - (t0 + Ab + j * Pb + Ab * cos(5.0 * th + ph));
      cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwPx + 5.0 * Ab * fwTh, 1e-5))) * (1.0 - smoothstep(0.35 * Pb, 0.7 * Pb, fwPx + 5.0 * Ab * fwTh)));
    }
    if (hasG) {
      float Pc = 11.0 * un, Ac = 0.42 * Pc, c0 = sB + Ac + 2.5 * un, Kc = max(0.0, floor((sE - 1.2 * un - Ac - c0) / Pc));
      float jc = floor((sp - c0) / Pc + 0.5);
      for (int i = -1; i <= 1; i++) {
        float j = jc + float(i), ok = (j < 0.0 || j > Kc) ? 0.0 : 1.0;
        float dv = sp - (c0 + j * Pc + Ac * cos(5.0 * th));
        cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwPx + 5.0 * Ac * fwTh, 1e-5))) * (1.0 - smoothstep(0.35 * Pc, 0.7 * Pc, fwPx + 5.0 * Ac * fwTh)));
      }
      c = mix(c, vec3(1.0), 0.10 * kS * smoothstep(sB - px, sB + px, s));
      gold = 1.0 - smoothstep(0.5 * px, 1.4 * px, abs(s - (sB + 1.5 * un * (1.0 - abs(cos(th))))));
    }
    c = mix(c, stentWire.rgb, stentWire.a * cov * kS);
    c = mix(c, stentGoldC.rgb, stentGoldC.a * gold * kS);
  }
  // the running stitch at a surgical shunt's sewn end (suture-marks.js seamDashes): dashes along the curve where the host's wall crosses the shunt (a slanted curve, found on the 2D courses), a dark halo under a thin thread,
  // with the 2D's thread and edge colours; a shunt in no host keeps 2D's three ticks. The distance to the curve is taken square to it (its slant against the tube's half width).
  if ((seamA[0].x > 0.0 || seamA[1].x > 0.0) && circT < 0.001) {
    float Lw = len * vU, aF = vUv.x * Lw, aa = clamp(across, -1.0, 1.0), rr = max(vR, 0.3), tw = 0.0, te = 0.0;
    for (int e = 0; e < 2; e++) {
      vec4 A = seamA[e], B = seamB[e];
      if (A.x <= 0.0) continue;
      float sl = e == 0 ? aF : Lw - aF;
      float s0 = A.x + aa * (A.y + aa * (A.z + aa * (A.w + aa * B.x)));
      float ds = (A.y + aa * (2.0 * A.z + aa * (3.0 * A.w + aa * 4.0 * B.x))) / rr;
      float dd = abs(sl - s0) / sqrt(1.0 + ds * ds), dsh = 1.0;
      if (B.y > 0.5) {
        float tn = clamp((aa + 0.97) / 1.94, 0.0, 1.0), kd = floor(tn / B.w), q = tn - kd * B.w, ew = max(fwAcr / 1.94, 1e-4);
        dsh = (1.0 - smoothstep(B.z - ew, B.z + ew, q)) * step(kd, B.y - 0.5) * smoothstep(0.97, 0.9, abs(aa));
      } else {
        dd = min(dd, min(abs(sl - s0 - 3.5), abs(sl - s0 + 3.5)));
        dsh = smoothstep(1.0, 0.92, abs(aa));
      }
      tw = max(tw, (1.0 - smoothstep(0.32, 0.5, dd)) * dsh);
      te = max(te, (1.0 - smoothstep(0.7, 1.0, dd)) * dsh);
    }
    c = mix(c, vec3(0.227, 0.114, 0.039), te * 0.4);
    c = mix(c, vec3(0.910, 0.455, 0.165), tw);
  }
  // the tie on a divided vein's stump (suture-marks.js woundTie): three turns of thread, 2.2 units apart, a little slanted across the vein, with the 2D's own thread and edge colours (--suture-thread, --suture-edge)
  if (stump.z > 0.001 && circT < 0.001) {
    float aF = vUv.x * len * vU, ph = vUv.y * 6.2831853, tw = 0.0, te = 0.0;
    for (int j = 0; j < 3; j++) {
      float dd = abs(aF - (stump.y + (float(j) - 1.0) * 2.2 + 0.5 * sin(ph)));
      tw = max(tw, 1.0 - smoothstep(0.32, 0.5, dd));
      te = max(te, 1.0 - smoothstep(0.7, 1.0, dd));
    }
    c = mix(c, vec3(0.227, 0.114, 0.039), te * 0.4 * stump.z);
    c = mix(c, vec3(0.910, 0.455, 0.165), tw * stump.z);
  }
  // the amber column of the wedge: everything upstream of the balloon in that vein and its branches, a tint on the tube itself that thins toward each branch's tip
  if (wedge.x > 0.001 && circT < 0.001) {
    // the distance from the balloon's distal edge at this point on this vessel (the same field the junction skins carry), against the one advancing front
    float wa = wedge.x * wedgeCover(wedgeD.x + wedgeD.y * vUv.x, vec3(wedge.y, wedgeD.z, wedgeD.w));
    wa *= mix(1.0, smoothstep(0.0, max(wedge.z, 0.001), vUv.x), wedge.w);
    c = mix(c, wedgeCol, WEDGE_A * wa * (1.0 - inkT));   // (under the outline: the vessel's line stays)
  }`;

/** A free end's fade at one place (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE) and the cava end's ease: `fa` in, `fa` out; at `uv.x` along the vessel, `position.xy` in the figure, with `mapFa` its Circuit fade. Reads: fadeMode, fadeA, fadeLine, circT, stump, circShare, len, vU, cavaEnd. Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const FADE_ALPHA_GLSL = /* glsl */ `  if (fadeMode > 2.5) {
    // tube-geo.js tubeAlpha: the projection of the point on the line
    vec2 fd = fadeLine.zw - fadeLine.xy;
    float fv = dot(position.xy - fadeLine.xy, fd) / max(dot(fd, fd), 1e-9);
    if (fadeMode > 3.5) {
      fv = clamp(fv, 0.0, 1.0);
      fa = fv < fadeA.x ? mix(fadeA.z, fadeA.w, smoothstep(0.0, max(fadeA.x, 1e-4), fv)) : mix(fadeA.w, 1.0, smoothstep(fadeA.x, 1.0, fv));
    } else {
      fa = mix(fadeA.z, fadeA.w, clamp((fv - fadeA.x) / max(1.0 - fadeA.x, 1e-4), 0.0, 1.0));
    }
    fa = mix(fa, mapFa, circT);
  } else if (fadeMode > 0.5) {
    float fs = fadeMode < 1.5 ? uv.x : position.y;
    float ft = clamp((fs - fadeA.x) / (abs(fadeA.y - fadeA.x) < 1e-5 ? 1e-5 : fadeA.y - fadeA.x), 0.0, 1.0);
    fa = mix(fadeA.z, fadeA.w, ft);
    fa = mix(fa, mapFa, circT);
  }
  // the fade zone (a tip into its organ, a bed through the lobe, a vein into the cava): the tube keeps its full width and fades by opacity, body and outline together (vFade, 1 outside a fade zone: opaque)
  if (stump.x > 0.0 && circShare < 0.001) fa *= step(stump.x, uv.x * len * vU);   // (the divided stretch is not there: body and outline)
  if (cavaEnd.x > 0.0) fa *= mix(mix(1.0, cavaEnd.y, smoothstep(1.0 - cavaEnd.x, 1.0, uv.x)), 1.0, circT);`;

/** How much of the picked vessel's line shows at `uv.x` along it (`vHi`): the highlight's own distance rule. Reads: hiOn, hiDir, hiOffset, hiAhead, hiBehind, hiEnds, hiFade, len. Spliced exactly where it stood in vessels/shaders.ts; ?geom=net (net/shaders.ts) splices the same text. */
export const HIGHLIGHT_ALONG_GLSL = /* glsl */ `  float aU = uv.x * len;
  float distH = hiDir > 0.5 ? hiOffset + aU : (hiDir < -0.5 ? hiOffset + (len - aU) : 0.0);
  float limitH = hiDir < -0.5 ? hiBehind : hiAhead;
  float ownH = smoothstep(0.0, max(hiFade, 0.0001), min(hiEnds.x + aU, hiEnds.y + (len - aU)));   // the picked vein's own line: nothing at its two outer ends, full a fade's length in
  vHi = hiOn * (abs(hiDir) > 0.5 ? 1.0 - smoothstep(0.0, max(limitH, 0.0001), distH) : ownH);`;
