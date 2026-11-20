// THE DUST, on the GPU (Mohammad, 20 Nov: "Yes GPU please"): the Dust Lab's particles drawn by the vessel's own fragment shader (and the junction skin's), so they are inside the lumen by construction and follow the tube's
// alpha, fades, the Circuit's change, the veil and the lens colours with no second mesh to keep in step. Nothing is placed on the CPU: a particle is a pure function of time and its cell, and the pixel finds the particles near it.
//
// REAL FLOW (Mohammad, 20 Nov: "the streaks still break between vessels, they don't flow"; "it has to be real, not like chevrons"). A particle has ONE identity through the whole network (blood/routes.ts): its ROOT (the
// vessel it came in by), its place in the root's cross-section, and its distance along the root's stream. The route table maps each range of a vessel's lanes to the root it carries (a branch takes the lanes of its
// parent whose share of the flow is its own; a merge stacks its inflows side by side), so the same particle is drawn in the next vessel exactly where it left the last. Nothing restarts at a joint:
//   the lattice    class k (a band of the lab's `rho`) x cell j along the ROOT's stream, the root's radius its pitch, the root's distance (streams.ts texel w) its motion, each ring at its own speed (the lab's flat profile)
//   the section    the particle's place across is in the vessel's own SECTION, not on the screen: N the figure's left of the course (the 2D lanes), B out of the figure (dustFrame). The pixel sees it through the frame's
//                  projection on the screen (cS) and toward the eye (cV), so the same particle is in the same lane from any camera, and a branch's dividing line is a line in the vessel, not on the glass.
//   the strip      a branch's lanes are a STRIP of its root's section: the particle's lane is mapped onto the branch's (yc = (yr - c0) / c1) and its depth kept in proportion to the section's chord there, so the strip
//                  fills the branch's round section with nothing doubled or lost
//   the twist      the swirl of a stenosis or a fast vessel turns a particle round the axis a WHOLE number of turns over the vessel (routes.ts turns), easing in from and out to each end, so at every joint it is back on its
//                  lane; the wobble (time) is held to nothing at the ends for the same reason. Both are as strong as the lab's in the middle.
//   the skin       a junction skin sees each particle in its two heaviest arms' frames and draws it at the BLEND of the two places by the pixel's weights (dustSkin): a streak bends through the fork, never two ghosts
//   cost           K classes x (2N + 1) cells for each lane segment the pixel can see (one away from a dividing line, two on it); a fading layout (routes.ts FADE_S) draws both for that while. Runtime numbers, no recompile.
import { STREAK } from './streak-glsl.ts';
import { DUST_KMAX, DUST_NMAX, DUST_UNIFORMS, DUST_VEC4, LAB_R } from './dust-spec.ts';
import { SEG_MAX } from './routes.ts';

const F = (x: number): string => { const r = Number(x.toPrecision(6)); return Number.isInteger(r) ? r.toFixed(1) : String(r); };

/** `D_<name>`: the uniform's place in the vec4 array. */
export const DUST_MACROS: string = DUST_UNIFORMS.map((n, i) => `#define D_${n} dustP[${i >> 2}].${'xyzw'[i & 3]}`).join('\n');

/** The dust's GLSL with the root's stream distance read by `flowBody` (the body of float dFlow(float root)): the Anatomy's reads the streams' texture (DUST_GLSL); the lobule's tubes, which share one flow, read their own (micro3d/cel3d.ts). */
export const dustGlsl = (flowBody: string): string => /* glsl */ `
uniform vec4 dustP[${DUST_VEC4}];
uniform sampler2D routeTex;
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
// THE FRAME a pixel of a vessel is seen in (the tube's own, or one arm's on a skin)
struct DFrame {
  float across;   // the pixel across the lumen on screen (-1 .. 1)
  vec2 cS;        // the section's N and B axes on the screen's sideways axis
  vec2 cV;        // ... and toward the eye
  float a;        // the pixel's arc along the vessel (figure units)
  float Lw;       // the vessel's length (figure units)
  float rFix;     // its built radius (figure units)
  float vRc;      // its lumen's radius now (figure units)
  float rCss;     // that in CSS px
  float nar;      // its diameter against its healthy one
  float vd;       // its display speed
  float edge;     // its column of the route table
  float U;        // figure units in one scene unit here (the route table's radii are scene units)
};
// one range of a vessel's lanes and the root it carries (routes.ts Seg)
struct DSeg { float y0; float y1; float root; float c0; float c1; float A; float B; float rLat; };
DSeg dSeg(float edge, int row) {
  vec4 p = texelFetch(routeTex, ivec2(int(edge), row), 0), q = texelFetch(routeTex, ivec2(int(edge), row + 1), 0);
  return DSeg(p.x, p.y, p.z - 1.0, p.w, q.x, q.y, q.z, q.w);
}
// the section's frame from the course's heading T, the figure's normal Z and the eye V (all in the view's frame) and the screen's sideways axis side: x, y the N and B axes on the side, z, w toward the eye
// Every input can be degenerate on some pixel (a skin arm's heading of zero length, a heading along the eye, a figure normal along the heading): normalize() of a zero vector is NaN, and a NaN particle is drawn as
// a speck of any colour (Mohammad, 20 Nov: green and dark blue specks on the joints). So nothing here is normalised without a length check, and the frame always comes out unit and finite.
vec4 dustFrame(vec3 T, vec3 Z, vec3 V, vec3 side) {
  float tl = length(T), zl = length(Z);
  if (tl < 1e-6) return vec4(1.0, 0.0, 0.0, 1.0);   // (no heading: a plain section seen square on)
  vec3 t = T / tl, N = zl > 1e-6 ? cross(t, Z / zl) : vec3(0.0);
  float nl = length(N);
  if (nl > 0.2) N /= nl;
  else { N = side - t * dot(side, t); float sl = length(N); N = sl > 1e-4 ? N / sl : vec3(-t.y, t.x, 0.0) / max(length(t.xy), 1e-4); }   // (a course heading out of the figure: the screen's own side, square to the heading, stands in)
  vec3 B = cross(t, N);
  return vec4(dot(N, side), dot(B, side), dot(N, V), dot(B, V));
}
// the twist (a whole number of turns over the vessel, none at either end) and its rate along the arc
vec2 dTwist(float ae, float Lw, float turns) {
  float u = clamp(ae / max(Lw, 1e-3), 0.0, 1.0);
  return vec2(6.2831853 * turns * u * u * (3.0 - 2.0 * u), 6.2831853 * turns * 6.0 * u * (1.0 - u) / max(Lw, 1e-3));
}
// a particle of a root's lattice
struct DPart { float alive; float h1; float h2; float h3; float h4; float h5; float h6; float h7; float rho; float yl; float zr; float se; float prof; float root; };
// its mark seen in one frame: the offset from the pixel (lumen radii, along and across), its tilt, depth, length and diameter, local speed, the edge's anti-aliasing
struct DMark { vec2 dp; float slope; float depth; float len; float dia; float spd; float aa; float rhoE; };
float dTurns(float edge) { return texelFetch(routeTex, ivec2(int(edge), 0), 0).w; }
// the particle's lane in this segment, and how much of it is there (soft at a dividing line; whole at a wall)
vec2 dMember(DSeg g, float yl) {
  float y = (yl - g.c0) / (g.c1 < 0.0 ? min(g.c1, -1e-4) : max(g.c1, 1e-4)), e = 0.04;   // (a strip of no width: never 0 / 0)
  float m = (g.y0 <= -0.999 ? 1.0 : smoothstep(g.y0 - e, g.y0 + e, y)) * (g.y1 >= 0.999 ? 1.0 : 1.0 - smoothstep(g.y1 - e, g.y1 + e, y));
  return vec2(y, m);
}
DMark dPlace(DFrame F, DSeg g, float yc, DPart P) {
  const float TWO_PI = 6.2831853;
  DMark M;
  float rm = max(D_rhoMax, 0.05);
  float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
  float ae = (P.se - g.A) / Bs;   // where it is along this vessel now (from the root's stream back to this vessel's arc)
  // the strip of the root's section this vessel carries, filled out to the vessel's round section: the lane mapped, the depth in proportion to the chord
  float yr = P.yl * rm, ycS = yc * rm;
  float zc = P.zr * sqrt(max(rm * rm - ycS * ycS, 0.0)) / sqrt(max(rm * rm - yr * yr, 1e-4));
  float rho = length(vec2(ycS, zc)), th0 = rho > 1e-5 ? atan(zc, ycS) : 0.0;   // (atan(0, 0) is undefined: a device can draw it black)
  float kR = F.vRc / max(F.rFix, 1e-4);
  float uLoc = mix(1.0, clamp(1.0 / max(kR * kR, 1e-3), D_uMin, D_uMax), D_velLocal);
  float shr = 1.0 - D_shrink * (1.0 - clamp(kR / 0.9 * 1.2, 0.55, 1.0));
  // turbulence, held to nothing at the ends (the wobble moves with time: at a joint the particle must be where its lane says)
  float Wd = max(18.0, 0.12 * F.Lw);
  float d = clamp(min(ae, F.Lw - ae), 0.0, F.Lw);
  // (a narrowing only: healthy blood is laminar, calm lanes along the wall, however fast it runs and however near a joint. Mohammad, 20 Nov: "the blood streaks seem to think there is stenoses everywhere")
  float TcRaw = clamp(${F(STREAK.T_STENOSIS)} * (1.0 - smoothstep(0.5, 0.85, F.nar)), 0.0, 1.0);
  float T = clamp(D_turb * TcRaw, 0.0, 1.3) * smoothstep(0.0, 0.5 * Wd, d);
  vec2 tw = dTwist(ae, F.Lw, dTurns(F.edge));
  float qL = ae / max(F.rFix, 1e-4) * ${F(LAB_R)};   // (the lab's own units: its wobble's wavelengths)
  float tt = time;
  float wob = T * D_wobble * (sin(TWO_PI * qL * D_turbFreq / 38.0 + P.h6 * TWO_PI + 0.8 * D_turbSpeed * tt) + 0.5 * sin(TWO_PI * qL * D_turbFreq / 17.0 + 2.0 * P.h6 * TWO_PI - 1.1 * D_turbSpeed * tt));
  float th = th0 - tw.x + wob;
  float rhoE = clamp(rho + 0.15 * T * D_rhoJit * sin(TWO_PI * qL * D_turbFreq / 29.0 + P.h6 * 9.0 + 1.3 * D_turbSpeed * tt), 0.0, rm);
  float cs = cos(th), sn = sin(th);
  float yp = rhoE * (cs * F.cS.x + sn * F.cS.y);
  M.depth = rhoE * (cs * F.cV.x + sn * F.cV.y) / max(rm, 0.1);
  M.dia = clamp(D_size * (1.0 + D_sizeVar * (2.0 * P.h4 - 1.0)) * shr * (1.0 + D_depthSize * M.depth), 1.1 / max(F.rCss, 0.5), 7.0 / max(F.rCss, 0.5));
  // its length: the lab's velocity (local: faster in a throat, slow in a bulb) x lenK, a dot under it; tilted by the twist's slope on the screen
  M.spd = uLoc * P.prof;
  M.len = mix(M.dia, clamp(D_speed * M.spd * D_lenK, M.dia, D_lenCap), D_stretch);
  M.slope = clamp(F.vRc * rhoE * (sn * F.cS.x - cs * F.cS.y) * tw.y, -1.5, 1.5);
  M.dp = vec2((F.a - ae) / max(F.vRc, 1e-5), F.across - yp);
  M.aa = 0.6 / max(F.rCss, 0.5);
  M.rhoE = rhoE;
  return M;
}
// whether the particle can reach the pixel at all (along: the longest mark; across: the section seen at a slant), before the full place is worked out
bool dNear(DFrame F, DSeg g, float yc, DPart P) {
  float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
  float rm = max(D_rhoMax, 0.05), vr = max(F.vRc, 1e-5);
  if (abs(F.a - (P.se - g.A) / Bs) / vr > D_lenCap * 3.0 + 8.0 / max(F.rCss, 0.5)) return false;
  return abs(F.across - yc * rm * F.cS.x) <= rm * abs(F.cS.y) + 0.35;
}
// the particle's colour and coverage at the pixel (premultiplied), from its mark
vec4 dDraw(DMark M, DPart P, vec3 t0, vec3 t1, vec3 t2, vec3 t3, vec3 ink, float rev) {
  vec2 dir = normalize(vec2(1.0, M.slope));
  float tl = dot(M.dp, dir), nl = M.dp.y * dir.x - M.dp.x * dir.y;
  float hl = max(M.len - M.dia, 0.0) * 0.5, rEl = 0.5 * M.dia;
  float dist = length(vec2(max(abs(tl) - hl, 0.0), nl));
  if (dist > rEl + M.aa) return vec4(0.0);
  float lo = min(rEl * (1.0 - max(D_soft, 0.03)), rEl - 2.0 * M.aa);
  float cov = 1.0 - smoothstep(lo, rEl, dist);
  float tA = tl / max(M.len, 1e-4) + 0.5;
  cov *= mix(1.0, smoothstep(0.0, 0.5, tA) * smoothstep(0.0, 0.5, 1.0 - tA), clamp(D_feather * hl / max(rEl, 0.09), 0.0, 1.0));
  float twk = 1.0 - D_twinkle + D_twinkle * (0.5 + 0.5 * sin(time * 3.0 + P.h5 * 40.0));
  float al = D_opacity * (1.0 - D_opVar + D_opVar * P.h7) * (1.0 - D_depthDim * (1.0 - smoothstep(-0.5, 0.5, M.depth))) * twk * P.alive * cov;
  float srcHue = dHash(vec2((P.root + 1.0) * 3.7 + 1.3, 9.1)) * 2.0 - 1.0;
  float m = D_wRandom * P.h5 + D_wSpeed * clamp((M.spd - 0.5) / 2.5, 0.0, 1.0) + D_wDepth * (M.depth * 0.5 + 0.5) + D_wRadius * clamp(P.rho / max(D_rhoMax, 0.1), 0.0, 1.0) + D_wSource * clamp(0.5 + 0.5 * srcHue + (P.h5 - 0.5) * 0.3, 0.0, 1.0);
  if (D_steps > 0.5) m = clamp(floor(m * D_steps * 0.9999) / max(D_steps - 1.0, 1.0), 0.0, 1.0);
  vec3 col = mix(mix(mix(t0, t1, clamp(m * 3.0, 0.0, 1.0)), t2, clamp(m * 3.0 - 1.0, 0.0, 1.0)), t3, clamp(m * 3.0 - 2.0, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.62, 0.28), D_warm * rev);
  col = mix(col, ink, D_ring * smoothstep(rEl * 0.45, rEl, dist));
  return vec4(col * al, al);
}
// the lab's four tones from the lumen's lit tone
void dTones(vec3 lit, out vec3 t0, out vec3 t1, out vec3 t2, out vec3 t3) {
  vec3 pc = mix(lit, vec3(D_cr, D_cg, D_cb), D_custom);
  t0 = dShift(pc, -0.2 * D_hue, D_satShift + 0.02, D_lightBias + D_lightSpread * 0.6);
  t1 = dShift(pc, 0.5 * D_hue, D_satShift + 0.04, D_lightBias + D_lightSpread * 0.27);
  t2 = dShift(pc, -0.55 * D_hue, D_satShift, D_lightBias);
  t3 = dShift(pc, 0.0, D_satShift + 0.03, D_lightBias - D_lightSpread * 0.67);
}
// the particle of class k, cell jj of root root's lattice (its hashes, its place in the root's section, where it is along the root's stream now)
DPart dPart(float root, int k, float jj, float Pf, float flowFig) {
  DPart P;
  float fk = float(k), fK = max(D_nCls, 1.0);
  float rlo = D_rhoMax * pow(fk / fK, D_radExp), rhi = D_rhoMax * pow((fk + 1.0) / fK, D_radExp);
  P.prof = 1.0 + D_flat * (1.0 - 2.0 * (0.5 * (rlo + rhi)) * (0.5 * (rlo + rhi)));
  vec2 sd = vec2(mod(jj, 4093.0) + 0.5, fk * 7.13 + fract(root * 0.6180339) * 50.0);
  P.alive = clamp((D_densK - dHash(sd)) * 12.0, 0.0, 1.0);   // (thinned by a threshold: a density change fades single particles in and out, nothing pops)
  P.h1 = dHash(sd + vec2(17.1, 3.7)); P.h2 = dHash(sd + vec2(5.3, 29.9)); P.h3 = dHash(sd + vec2(41.3, 11.1)); P.h4 = dHash(sd + vec2(23.7, 53.9));
  P.h5 = dHash(sd + vec2(61.3, 7.9)); P.h6 = dHash(sd + vec2(2.9, 71.7)); P.h7 = dHash(sd + vec2(37.7, 19.3));
  P.rho = mix(rlo, rhi, P.h3);
  float th = P.h2 * 6.2831853;
  P.yl = P.rho * cos(th) / max(D_rhoMax, 0.05);   // its lane in the root (-1 .. 1)
  P.zr = P.rho * sin(th);
  P.se = (jj + 0.1 + 0.8 * P.h1 - 0.37 * fk) * Pf + flowFig * P.prof * D_flowK;
  P.root = root;
  return P;
}
// the cell of class k nearest the pixel's place se on the root's stream
float dCell(float se, int k, float Pf, float flowFig) {
  float fk = float(k), fK = max(D_nCls, 1.0);
  float rlo = D_rhoMax * pow(fk / fK, D_radExp), rhi = D_rhoMax * pow((fk + 1.0) / fK, D_radExp);
  float prof = 1.0 + D_flat * (1.0 - 2.0 * (0.5 * (rlo + rhi)) * (0.5 * (rlo + rhi)));
  return floor((se - flowFig * prof * D_flowK) / Pf + 0.37 * fk);
}
// which lanes of the vessel can hold a particle the pixel sees (the section seen at a slant shows more of it)
vec2 dLaneWin(DFrame F) {
  float rm = max(D_rhoMax, 0.05), mg = 0.3;
  if (abs(F.cS.x) < 0.3) return vec2(-2.0, 2.0);
  float a = (F.across - abs(F.cS.y) * rm - mg) / F.cS.x / rm, b = (F.across + abs(F.cS.y) * rm + mg) / F.cS.x / rm;
  return vec2(min(a, b), max(a, b));
}
// the root's stream distance (streams.ts texel w) and the lattice's pitch (the root's radius)
float dFlow(float root) { ${flowBody} }

// THE TUBE: every lane segment the pixel can see, of the current layout and (while it fades out) the last one
vec4 dustTube(DFrame F, vec3 lit, vec3 ink, float rev) {
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  vec4 hd = texelFetch(routeTex, ivec2(int(F.edge), 0), 0);
  vec2 win = dLaneWin(F);
  int K = min(int(D_nCls + 0.5), ${DUST_KMAX}), N = min(int(D_win + 0.5), ${DUST_NMAX});   // (the loops' bounds are runtime numbers, GLSL ES 3.0: no compiler unrolls them into hundreds of copies)
  vec4 acc = vec4(0.0);
  for (int set = 0; set < 2; set++) {
    float wSet = set == 0 ? hd.y : 1.0 - hd.y;
    int nSeg = min(int((set == 0 ? hd.x : hd.z) + 0.5), ${SEG_MAX});
    if (wSet < 0.002) continue;
    for (int i = 0; i < nSeg; i++) {
      DSeg g = dSeg(F.edge, 1 + 2 * i + set * ${2 * SEG_MAX});
      if (g.y1 < win.x || g.y0 > win.y) continue;
      float Pf = max(D_cellP * g.rLat * F.U, 1e-4), flowFig = dFlow(g.root);
      float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
      float se = g.A + Bs * F.a;
      for (int kk = 0; kk < K; kk++) {
        int k = K - 1 - kk;   // the outer rings first: the inner ones (nearer the axis, faster) lie over them
        float j0 = dCell(se, k, Pf, flowFig);
        for (int n = -N; n <= N; n++) {
          DPart P = dPart(g.root, k, j0 + float(n), Pf, flowFig);
          if (P.alive <= 0.0) continue;
          vec2 mb = dMember(g, P.yl);
          if (mb.y <= 0.0 || !dNear(F, g, mb.x, P)) continue;
          vec4 c = dDraw(dPlace(F, g, mb.x, P), P, t0, t1, t2, t3, ink, rev) * (mb.y * wSet);
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  // nothing past the lumen's edge: the dust stops short of the ink, with a soft fall (never a hard cut)
  return clamp(acc, 0.0, 1.0) * (1.0 - smoothstep(0.90, 0.96, abs(F.across)));   // (premultiplied: never past 0 .. 1, or the lumen under it would be inverted)
}
// the segment of edge edge (current layout) that carries the root's lane yl, if any: its index (-1 none) and the particle's lane there and membership
vec3 dFind(float edge, float root, float yl) {
  vec4 hd = texelFetch(routeTex, ivec2(int(edge), 0), 0);
  int nSeg = min(int(hd.x + 0.5), ${SEG_MAX});
  for (int i = 0; i < nSeg; i++) {
    DSeg g = dSeg(edge, 1 + 2 * i);
    if (abs(g.root - root) > 0.5) continue;
    vec2 mb = dMember(g, yl);
    if (mb.y > 0.0) return vec3(float(i), mb);
  }
  return vec3(-1.0, 0.0, 0.0);
}
DMark dMix(DMark a, DMark b, float t) {
  DMark M;
  M.dp = mix(a.dp, b.dp, t); M.slope = mix(a.slope, b.slope, t); M.depth = mix(a.depth, b.depth, t); M.len = mix(a.len, b.len, t);
  M.dia = mix(a.dia, b.dia, t); M.spd = mix(a.spd, b.spd, t); M.aa = mix(a.aa, b.aa, t); M.rhoE = mix(a.rhoE, b.rhoE, t);
  return M;
}
// THE SKIN: a junction's pixel seen in its two heaviest arms' frames (F0, F1; w1 the share of the second). Each particle the first arm can see is drawn at the BLEND of its places in the two frames, by the share of each
// that carries it, and only as much as the arms that carry it weigh here (a particle bound for the other branch fades as the pixel nears this one). Then the particles only the second arm carries.
vec4 dustSkin(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev) {
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  int K = min(int(D_nCls + 0.5), ${DUST_KMAX}), N = min(int(D_win + 0.5), ${DUST_NMAX});   // (the loops' bounds are runtime numbers, GLSL ES 3.0: no compiler unrolls them into hundreds of copies)
  vec4 acc = vec4(0.0);
  for (int arm = 0; arm < 2; arm++) {
    DFrame Fa = F0, Fb = F1;
    if (arm == 1) { Fa = F1; Fb = F0; }
    float wa = arm == 0 ? 1.0 - w1 : w1, wb = 1.0 - wa;
    if (wa < 0.004 && arm == 1) break;
    vec4 hd = texelFetch(routeTex, ivec2(int(Fa.edge), 0), 0);
    int nSeg = min(int(hd.x + 0.5), ${SEG_MAX});
    for (int i = 0; i < nSeg; i++) {
      DSeg g = dSeg(Fa.edge, 1 + 2 * i);
      float Pf = max(D_cellP * g.rLat * Fa.U, 1e-4), flowFig = dFlow(g.root);
      float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
      float se = g.A + Bs * Fa.a;
      for (int kk = 0; kk < K; kk++) {
        int k = K - 1 - kk;
        float j0 = dCell(se, k, Pf, flowFig);
        for (int n = -N; n <= N; n++) {
          DPart P = dPart(g.root, k, j0 + float(n), Pf, flowFig);
          if (P.alive <= 0.0) continue;
          vec2 ma = dMember(g, P.yl);
          if (ma.y <= 0.0) continue;
          vec3 fb = wb > 0.004 ? dFind(Fb.edge, g.root, P.yl) : vec3(-1.0, 0.0, 0.0);
          if (arm == 1 && fb.x >= 0.0) continue;   // (the first arm drew it)
          DSeg gb = dSeg(Fb.edge, 1 + 2 * int(max(fb.x, 0.0) + 0.5));
          if (!dNear(Fa, g, ma.x, P) && (fb.x < 0.0 || !dNear(Fb, gb, fb.y, P))) continue;   // (out of reach in both frames: its blend is too)
          DMark M = dPlace(Fa, g, ma.x, P);
          float sa = wa * ma.y, sb = 0.0;
          if (fb.x >= 0.0) {
            sb = wb * fb.z;
            M = dMix(M, dPlace(Fb, gb, fb.y, P), sb / max(sa + sb, 1e-4));
          }
          vec4 c = dDraw(M, P, t0, t1, t2, t3, ink, rev) * (sa + sb);
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  return clamp(acc, 0.0, 1.0) * (1.0 - smoothstep(0.90, 0.96, abs(mix(F0.across, F1.across, w1))));
}
`;
/** The Anatomy's: the root's stream distance is texel w of the streams' texture (blood/streams.ts). */
export const DUST_GLSL: string = dustGlsl('return texelFetch(streamTex, ivec2(int(root), 0), 0).w;');


type V3 = readonly [number, number, number];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const sc3 = (a: V3, k: number): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k];
/** The twin of dustFrame: the section's N and B axes on the screen's side and toward the eye. Finite and unit for every input, degenerate ones included (tests/b3-dust.test.ts). */
export function dustFrameJs(T: V3, Z: V3, V: V3, side: V3): [number, number, number, number] {
  const tl = len3(T), zl = len3(Z);
  if (tl < 1e-6) return [1, 0, 0, 1];
  const t = sc3(T, 1 / tl);
  let N: [number, number, number] = zl > 1e-6 ? cross3(t, sc3(Z, 1 / zl)) : [0, 0, 0];
  const nl = len3(N);
  if (nl > 0.2) N = sc3(N, 1 / nl);
  else {
    const d = dot3(side, t), q: [number, number, number] = [side[0] - t[0] * d, side[1] - t[1] * d, side[2] - t[2] * d], sl = len3(q);
    N = sl > 1e-4 ? sc3(q, 1 / sl) : sc3([-t[1], t[0], 0], 1 / Math.max(Math.hypot(t[0], t[1]), 1e-4));
  }
  const B = cross3(t, N);
  return [dot3(N, side), dot3(B, side), dot3(N, V), dot3(B, V)];
}

/** The twin of dTwist: the swirl's angle at arc `ae` of a vessel of length `Lw` that turns `turns` times, and its rate. A whole number of turns puts every particle back on its lane at both ends; the rate is 0 there. */
export function dustTwist(ae: number, Lw: number, turns: number): [number, number] {
  const u = Math.min(1, Math.max(0, ae / Math.max(Lw, 1e-3)));
  return [2 * Math.PI * turns * u * u * (3 - 2 * u), 2 * Math.PI * turns * 6 * u * (1 - u) / Math.max(Lw, 1e-3)];
}
/** The twin of the strip map (dPlace): a particle at (yr, zr) of its root's section (radius rm) seen in a vessel that carries its lane as yc (of rm): the depth kept in proportion to the section's chord. */
export function dustStrip(yr: number, zr: number, yc: number, rm: number): [number, number] {
  const ycS = yc * rm;
  return [ycS, zr * Math.sqrt(Math.max(rm * rm - ycS * ycS, 0)) / Math.sqrt(Math.max(rm * rm - yr * yr, 1e-4))];
}

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
