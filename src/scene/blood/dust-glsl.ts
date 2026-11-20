// THE DUST, on the GPU (Mohammad, 20 Nov: "Yes GPU please"). The Dust Lab's particles drawn by the vessel's own fragment shader, so they are inside the lumen by construction and follow the tube's alpha, fades, the Circuit's change,
// the veil over the organs and the lens colours with no second mesh to keep in step (the retired sprite layer strayed past ends and fades, blood/cells/cells.ts). Nothing is placed on the CPU: a particle is a pure function of time and
// its cell, and the pixel finds the particles near it.
//
//   the cell       class k (a band of the lab's `rho`, the radius a particle keeps off the axis; its speed is the lab's flat profile at the band's middle, so the stream shears) x cell j along the vessel. The cell's hash gives the particle
//                  its place in the cell, its angle round the axis, its ring inside the band, its size, opacity and colour; the cell moves with the blood's own distance (the streams' texel w, the chevrons' speed), so the dust
//                  runs with the flow, back on a reversed one, still where there is none. The pixel scans 2N + 1 cells of each class: the grid is as fine as the sample budget allows (dust-spec.ts dustDerive).
//   the position   y = rho cos(theta), z = rho sin(theta): the pixel sees y (a particle stands where the tube's face stands at that across), z only dims the far side. theta = theta0 - swirl(a) x (1 - 0.4 rho) + wobble: the lab's
//                  helix. swirl(a) is a closed form (the turbulence is constant along a vessel but for a ramp at its two ends, so its integral is a cubic: dEnd), never a table.
//   the mark       a capsule of the lab's size along the flow's own direction (tilted by the swirl's slope), its alpha feathered at both ends by `feather`, its softness `soft`, its length the lab's |velocity| x `lenK` with the
//                  LOCAL velocity (the tube's narrowing: faster and longer through a stenosis, slow dots in a bulb), mixed by `stretch` between a dot and a streak.
//   junctions      every vessel carries dust to both of its ends (no fade at an end); where a branch lies in its trunk the marks fade as the chevrons do (markK) and the trunk's own dust is there, so the blood runs on through the
//                  junction. Vessel by vessel the cells are keyed by the vessel, the flow by its own stream.
//   cost           K classes x (2N + 1) cells, K <= DUST_KMAX, N <= DUST_NMAX, both runtime numbers (uniforms): the budget changes with the device and the canvas, no recompile.
import { STREAK } from './streak-glsl.ts';
import { DUST_KMAX, DUST_NMAX, DUST_UNIFORMS, DUST_VEC4, LAB_R } from './dust-spec.ts';

const F = (x: number): string => { const r = Number(x.toPrecision(6)); return Number.isInteger(r) ? r.toFixed(1) : String(r); };

/** `D_<name>`: the uniform's place in the vec4 array. */
export const DUST_MACROS: string = DUST_UNIFORMS.map((n, i) => `#define D_${n} dustP[${i >> 2}].${'xyzw'[i & 3]}`).join('\n');

/** The integral from 0 to x of the end ramp 1 - smoothstep(0, 1, u / W): the same cubic in the JS twin (dustEndIntegral). */
export const DUST_GLSL = /* glsl */ `
uniform vec4 dustP[${DUST_VEC4}];
${DUST_MACROS}
float dHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 dRgb2Hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), l = 0.5 * (mx + mn), d = mx - mn, h = 0.0, s = 0.0;
  if (d > 1e-5) {
    s = l > 0.5 ? d / max(2.0 - mx - mn, 1e-5) : d / max(mx + mn, 1e-5);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float dHue(float p, float q, float t) {
  t = fract(t);
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 dHsl2Rgb(vec3 h) {
  if (h.y <= 1e-5) return vec3(h.z);
  float q = h.z < 0.5 ? h.z * (1.0 + h.y) : h.z + h.y - h.z * h.y, p = 2.0 * h.z - q;
  return vec3(dHue(p, q, h.x + 1.0 / 3.0), dHue(p, q, h.x), dHue(p, q, h.x - 1.0 / 3.0));
}
// the lab's shift(): hue by dh (a turn is 1), saturation by ds, lightness by dl
vec3 dShift(vec3 c, float dh, float ds, float dl) { vec3 h = dRgb2Hsl(c); return dHsl2Rgb(vec3(fract(h.x + dh + 1.0), clamp(h.y + ds, 0.0, 1.0), clamp(h.z + dl, 0.04, 0.96))); }
// the integral from 0 to x of the end ramp (1 - smoothstep(0, 1, u / W)): x - W (t^3 - t^4 / 2) up to W, then W / 2
float dG(float x, float W) { float xx = clamp(x, 0.0, W), t = xx / W; return xx - W * (t * t * t - 0.5 * t * t * t * t); }
// the same along a vessel of length L whose two ends both carry the ramp
float dEnd(float a, float L, float W) { float x = clamp(a, 0.0, L); return x <= 0.5 * L ? dG(x, W) : 2.0 * dG(0.5 * L, W) - dG(L - x, W); }

// The dust at one pixel of a tube: premultiplied colour and alpha (0 outside the lumen). across -1 .. 1; aFig the arc from the vessel's start, figure units.
// THE ROUTE (Mohammad, 20 Nov: "the particles should cross at the junction, not disappear"; the lab's routes): the particles live on the STREAM's coordinate, se = A0 + Bm aFig (a vessel's own: A0 0, Bm 1; a vessel the
// blood runs on into from its parent: the chain's A and B, the same ones the chevrons use, blood/chain.ts), at the stream's distance flowFig (the root's), on a lattice of the ROOT's radius rLat: the same particle is
// at the same place in the next vessel, drawn there at that vessel's own width and at its own speed (the lattice is Bm times as fine where the blood slows, as flow is conserved), so it crosses the junction whole.
// rFix the vessel's own radius and vRc the lumen's radius now (figure units); rCss the lumen's radius in CSS px; Lw the vessel's length; nar the diameter against its healthy one; vd the display speed; rev 0 .. 1 reversed;
// seedV the stream's seed (the root's: a route's particles are one set); srcId the source vessel (the chain's root, else its own); lit the vessel's lit tone; ink the outline colour.
vec4 dustField(float across, float aFig, float A0, float Bm, float flowFig, float rFix, float rLat, float vRc, float rCss, float Lw, float nar, float vd, float rev, float seedV, float srcId, vec3 lit, vec3 ink) {
  const float TWO_PI = 6.2831853;
  int K = int(D_nCls + 0.5), N = int(D_win + 0.5);
  float Pf = max(D_cellP * rLat, 1e-4);
  float Bs = abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm;
  float se = A0 + Bs * aFig;
  float kR = vRc / max(rFix, 1e-4);
  float uLoc = mix(1.0, clamp(1.0 / max(kR * kR, 1e-3), D_uMin, D_uMax), D_velLocal);
  float aa = 0.6 / max(rCss, 0.5), minDia = 1.1 / max(rCss, 0.5), maxDia = 7.0 / max(rCss, 0.5);
  float shr = 1.0 - D_shrink * (1.0 - clamp(kR / 0.9 * 1.2, 0.55, 1.0));
  // turbulence: constant along the vessel but for the ramp at its two ends (a fork), so the swirl's phase is a closed form
  float Wd = max(18.0, 0.12 * Lw);
  float TcRaw = clamp(${F(STREAK.T_STENOSIS)} * (1.0 - smoothstep(0.5, 0.85, nar)) + ${F(STREAK.T_FLOW)} * smoothstep(25.0, 45.0, abs(vd)), 0.0, 1.0);
  float Hc = min(1.0, D_swirl * D_turb * TcRaw);
  float He = (1.0 - Hc) * min(1.0, D_swirl * D_turb * ${F(STREAK.T_END)});
  float rotK = TWO_PI / max(D_pitch * rFix, 1e-3);
  vec3 pc = mix(lit, vec3(D_cr, D_cg, D_cb), D_custom);
  vec3 t0 = dShift(pc, -0.2 * D_hue, D_satShift + 0.02, D_lightBias + D_lightSpread * 0.6);
  vec3 t1 = dShift(pc, 0.5 * D_hue, D_satShift + 0.04, D_lightBias + D_lightSpread * 0.27);
  vec3 t2 = dShift(pc, -0.55 * D_hue, D_satShift, D_lightBias);
  vec3 t3 = dShift(pc, 0.0, D_satShift + 0.03, D_lightBias - D_lightSpread * 0.67);
  float srcHue = dHash(vec2(srcId * 3.7 + 1.3, 9.1)) * 2.0 - 1.0;
  vec4 acc = vec4(0.0);
  for (int kk = 0; kk < ${DUST_KMAX}; kk++) {
    if (kk >= K) break;
    int k = K - 1 - kk;   // the outer rings first: the inner ones (nearer the axis, faster) lie over them
    float fk = float(k), fK = float(K);
    float rlo = D_rhoMax * pow(fk / fK, D_radExp), rhi = D_rhoMax * pow((fk + 1.0) / fK, D_radExp);
    float prof = 1.0 + D_flat * (1.0 - 2.0 * (0.5 * (rlo + rhi)) * (0.5 * (rlo + rhi)));
    float sp = prof * D_flowK;
    float xs = (se - flowFig * sp) / Pf + 0.37 * fk;
    float j0 = floor(xs);
    for (int n = -${DUST_NMAX}; n <= ${DUST_NMAX}; n++) {
      if (n < -N || n > N) continue;
      float jj = j0 + float(n);
      vec2 sd = vec2(mod(jj, 4093.0) + 0.5, fk * 7.13 + seedV);
      float alive = clamp((D_densK - dHash(sd)) * 12.0, 0.0, 1.0);   // (thinned by a threshold: a density change fades single particles in and out, nothing pops)
      if (alive <= 0.0) continue;
      float h1 = dHash(sd + vec2(17.1, 3.7)), h2 = dHash(sd + vec2(5.3, 29.9)), h3 = dHash(sd + vec2(41.3, 11.1)), h4 = dHash(sd + vec2(23.7, 53.9)), h5 = dHash(sd + vec2(61.3, 7.9)), h6 = dHash(sd + vec2(2.9, 71.7)), h7 = dHash(sd + vec2(37.7, 19.3));
      float ae = ((jj + 0.1 + 0.8 * h1 - 0.37 * fk) * Pf + flowFig * sp - A0) / Bs;   // where the particle is along the vessel now (from the stream's coordinate back to this vessel's arc)
      float rho = mix(rlo, rhi, h3);
      float d = min(ae, Lw - ae);
      float w = 1.0 - smoothstep(0.0, 1.0, clamp(d / Wd, 0.0, 1.0));
      float phase = rotK * (Hc * clamp(ae, 0.0, Lw) + He * dEnd(ae, Lw, Wd));
      float T = clamp(D_turb * (TcRaw + ${F(STREAK.T_END)} * w), 0.0, 1.3);
      float qL = ae / max(rFix, 1e-4) * ${F(LAB_R)};   // (the lab's own units: its wobble's wavelengths)
      float tt = time;
      float wob = T * D_wobble * (sin(TWO_PI * qL * D_turbFreq / 38.0 + h6 * TWO_PI + 0.8 * D_turbSpeed * tt) + 0.5 * sin(TWO_PI * qL * D_turbFreq / 17.0 + 2.0 * h6 * TWO_PI - 1.1 * D_turbSpeed * tt));
      float th = h2 * TWO_PI - phase * (1.0 - 0.4 * rho) + wob;
      float rhoE = clamp(rho + 0.15 * T * D_rhoJit * sin(TWO_PI * qL * D_turbFreq / 29.0 + h6 * 9.0 + 1.3 * D_turbSpeed * tt), 0.0, D_rhoMax);
      float yp = rhoE * cos(th), depth = rhoE * sin(th) / max(D_rhoMax, 0.1);
      float dia = clamp(D_size * (1.0 + D_sizeVar * (2.0 * h4 - 1.0)) * shr * (1.0 + D_depthSize * depth), minDia, maxDia);
      // its length: the lab's velocity (local: faster in a throat, slow in a bulb) x lenK, a dot under it; tilted by the swirl's slope
      float vLoc = D_speed * uLoc * prof;
      float len = mix(dia, clamp(vLoc * D_lenK, dia, D_lenCap), D_stretch);
      float slope = clamp(rhoE * sin(th) * rotK * (Hc + He * w) * (1.0 - 0.4 * rho) * vRc, -1.5, 1.5);
      vec2 dir = normalize(vec2(1.0, slope));
      vec2 dp = vec2((aFig - ae) / max(vRc, 1e-5), across - yp);
      float tl = dot(dp, dir), nl = dp.y * dir.x - dp.x * dir.y;
      float hl = max(len - dia, 0.0) * 0.5, rEl = 0.5 * dia;
      float dist = length(vec2(max(abs(tl) - hl, 0.0), nl));
      if (dist > rEl + aa) continue;
      float lo = min(rEl * (1.0 - max(D_soft, 0.03)), rEl - 2.0 * aa);
      float cov = 1.0 - smoothstep(lo, rEl, dist);
      float tA = tl / max(len, 1e-4) + 0.5;
      cov *= mix(1.0, smoothstep(0.0, 0.5, tA) * smoothstep(0.0, 0.5, 1.0 - tA), clamp(D_feather * hl / max(rEl, 0.09), 0.0, 1.0));
      float tw = 1.0 - D_twinkle + D_twinkle * (0.5 + 0.5 * sin(time * 3.0 + h5 * 40.0));
      float al = D_opacity * (1.0 - D_opVar + D_opVar * h7) * (1.0 - D_depthDim * (1.0 - smoothstep(-0.5, 0.5, depth))) * tw * alive * cov;
      float m = D_wRandom * h5 + D_wSpeed * clamp((uLoc * prof - 0.5) / 2.5, 0.0, 1.0) + D_wDepth * (depth * 0.5 + 0.5) + D_wRadius * clamp(rho / max(D_rhoMax, 0.1), 0.0, 1.0) + D_wSource * clamp(0.5 + 0.5 * srcHue + (h5 - 0.5) * 0.3, 0.0, 1.0);
      if (D_steps > 0.5) m = clamp(floor(m * D_steps * 0.9999) / max(D_steps - 1.0, 1.0), 0.0, 1.0);
      vec3 col = mix(mix(mix(t0, t1, clamp(m * 3.0, 0.0, 1.0)), t2, clamp(m * 3.0 - 1.0, 0.0, 1.0)), t3, clamp(m * 3.0 - 2.0, 0.0, 1.0));
      col = mix(col, vec3(1.0, 0.62, 0.28), D_warm * rev);
      col = mix(col, ink, D_ring * smoothstep(rEl * 0.45, rEl, dist));
      acc = vec4(col * al, al) + acc * (1.0 - al);
    }
  }
  // nothing past the lumen's edge: the dust stops short of the ink, with a soft fall (never a hard cut)
  return acc * (1.0 - smoothstep(0.90, 0.96, abs(across)));
}
`;

// ---- the JS twins (tests/b3-dust.test.ts reads them against the numbers) -------------------------------------------------------------------------------------------------------------------------------------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** The twin of dG. */
export function dustG(x: number, W: number): number { const xx = Math.min(W, Math.max(0, x)), t = xx / W; return xx - W * (t ** 3 - 0.5 * t ** 4); }
/** The twin of dEnd: the integral along a vessel of length L of the ramp 1 - smoothstep(d / W), d the distance to the nearer end. */
export function dustEndIntegral(a: number, L: number, W: number): number {
  const x = Math.min(L, Math.max(0, a));
  return x <= 0.5 * L ? dustG(x, W) : 2 * dustG(0.5 * L, W) - dustG(L - x, W);
}
/** The ramp itself (the shader's w). */
export function dustEndRamp(a: number, L: number, W: number): number { const d = Math.min(a, L - a), t = clamp01(d / W); return 1 - t * t * (3 - 2 * t); }

/** The twin of the dust's place along a vessel (dustField's `ae`): the particle of lattice cell `jj` (a hash `h1` in it, ring offset `fk`), on a stream of lattice spacing `Pf` at distance `flowD`, ring pace `sp`,
 *  seen from a vessel whose arc is se = A0 + Bm s along the stream. A vessel the blood runs on into has A0 and Bm of the chain (blood/chain.ts), so its particle is the parent's, carried on. */
export function dustArc(jj: number, h1: number, fk: number, Pf: number, flowD: number, sp: number, A0: number, Bm: number): number {
  const Bs = Math.abs(Bm) < 0.05 ? (Bm < 0 ? -0.05 : 0.05) : Bm;
  return (((jj + 0.1 + 0.8 * h1 - 0.37 * fk) * Pf + flowD * sp) - A0) / Bs;
}
