

uniform float fade;
bool fadedOut() { return fade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= fade; }
// A tube drawing on or retracting along its length (`reveal`, 0 to 1 over u): the front is a soft gradient, a tenth of the length, dissolved in the same screen pattern, never a hard cut.
bool frontOut(float u, float rv) {
  if (rv >= 0.9999) return false;
  float k = clamp((rv * 1.1 - u) / 0.1, 0.0, 1.0);
  return k < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= k;
}

uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)

// the radius (device px) gate of the tones: 0 on a hairline, 1 from TONES_TO up; it follows the radius, never the position across
float celTubeHw(float rDev) { return smoothstep(1.0, 2.0, rDev); }
// the lens colour made saturated and deep (a pale end of a ramp is darkened, its hue kept): the one flat base every tone is cut from
float celTubeLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// (tubeDark: 1 on the dark looks (Dark, Navy, Black), the brighter caps; declared once by the program that includes this: vessels/shaders.ts, materials/shaders.ts)
vec3 celTubeBase(vec3 b) {
  float l = celTubeLum(b);
  vec3 c = clamp(mix(vec3(l), b, 1.5), 0.0, 1.0);
  float lcap = mix(0.62, 0.82, tubeDark), vcap = mix(0.78, 0.96, tubeDark);
  return c * min(min(1.0, lcap / max(celTubeLum(c), 1e-3)), vcap / max(max(c.r, max(c.g, c.b)), 1e-3));
}
// the fill: TWO flat tones across the tube, matte and opaque: the saturated base on the lit side, a hue-preserving darker step (a touch more saturated) on the other, one hard edge EDGE_PX device px across between them at
// VESSEL_STEP_AT. No highlight, no rim, no translucency. s the lit-side measure (n.L against the world light, celLightView), sw its change per device pixel (fwidth(s), taken
// outside any branch), rDev the radius in device px; a hairline (under TONES_FROM) is the base alone.
vec3 celTubeTone(vec3 base, float s, float sw, float rDev) {
  float et = max(0.5 * 0.4 * sw, 1e-4), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(0.25 - et, 0.25 + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - 0.38);
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, 1.2), 0.0, 1.0);
  return mix(b, sh, hw * shadowT);
}


const vec3 CEL_LIGHT = vec3(-0.5014059075751371, 0.62174332539317, 0.6016870890901646);
vec3 celLightView() { return (viewMatrix * vec4(CEL_LIGHT, 0.0)).xyz; }

// a vessel behind the organs (the cava) is drawn a second time over them with VEIL defined: OPAQUE, as every vessel is (no alpha at rest: two flat tones and the ink; Mohammad, 20 Nov: "Why is the venacava glassy")
uniform vec3 color;
uniform vec3 inkColor;
uniform float shadeK;
uniform vec3 light;
uniform float bands;
uniform float spec;
uniform float len;
uniform float radius;
uniform float time;
uniform float baseD;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float stubSpeed;
uniform float reveal;
uniform float flowAmount;
uniform float flowBands;
uniform float dotted;
uniform vec3 markDark;
uniform vec3 markLight;
uniform vec3 markRev;
uniform float lensUse;
uniform float lensMix;
uniform float lensTail;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform float lensIndex;
uniform vec2 lensSpan;
uniform float lensSmooth;   // smooth joins on (1): the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3), not straight from one end's to the other's
uniform float smokeOn;
uniform vec3 hiColor;
uniform float inkOn;
uniform vec3 stump;   // (the vertex stage's: a divided vein's stump and its tie)
uniform vec4 seamA[2];   // a surgical shunt's stitches, its start's then its end's (seams.ts): the seam's distance in from the end as a quartic in the place across (c0..c3 here, c0 = 0: none)
uniform vec4 seamB[2];   // (c4, how many dashes (0: three ticks), one dash's share of the seam, one dash and its gap's share)
uniform vec4 stentU;   // a stent in this vessel, drawn on the tube in the Circuit (where the 3D device is faded out): x its share shown (0 none), y and z where it starts and ends along the course (0..1), w where its graft starts
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float cavaCut;   // 1 on a vein that opens into the cava (nbr is the cava's): it takes the cava's colour and alpha as it nears the wall and is not drawn inside the lumen, so it ends exactly at the wall with no step
uniform float solidK;    // a vessel drawn behind the organs: how much of its solid copy (drawn with the organs, hidden by one in front) shows: 1 for every other vessel (Settings > Hide vessels behind organs)
uniform float veilK;     // and of its veil copy (drawn over the organs, shown through them)
uniform float cavaA;     // the cava's opacity where the vein joins it: the vein's own comes to it at the wall (no step in alpha)
uniform vec2 cavaRef;    // the cava piece's lens index and the share along it where the vein joins: the colour the vein takes on
uniform vec2 skinCut;   // junction skins (skin/types.ts, WP4): the tube is drawn only between u = skinCut.x and u = skinCut.y; past either the skin (one welded mesh at the junction) takes over. (-1, 2): no cut, every branch it guards a no-op
uniform float nbrOn;   // 1 on the two tubes of a fork: the outline is the union's (neighbour.ts), so the buried end does not hold the ink back
uniform sampler2D streamTex;
uniform sampler2D chainTex;
uniform float streakAmt;   // how much of the streak layer shows (the Blood streaks setting, the view, the Circuit): 0 none
uniform float projY;
uniform vec2 res;
uniform float dpr;
uniform float casingA;      // the look's casing alpha (2D --casing-a)
uniform float casingCircA;  // and in the Circuit (2D .stage-wrap.cmap), by circT
uniform vec3 inkColorCirc;
uniform float circT;
uniform vec2 circCap;       // the Circuit rounds this vessel's start / end (1): the ends nothing joins
uniform vec4 wedge;       // the wedged vein's static column as a tint on the vessels themselves: x how much, y the share of the course (u) it reaches up to (2 = all of it), z how far the fade to the branch tip runs, w how much of it fades
uniform vec3 wedgeCol;
uniform float quietK;       // quiet depth on a turn (camera/quiet.ts): the back tier eases toward the page by QUIET_BACK of this, 0 face on
uniform vec3 pageCol;       // the plate colour it eases toward
uniform vec4 rimInk;        // (kept for the palette's API: no light rim is drawn)
varying float vW;
varying float vR;
varying float vU;
float buryK(float d0, float d1) {   // d0, d1: the figure units from the start and from the end of the tube
  float k0 = bury.x > 0.0 ? smoothstep(0.5 * bury.x * vU, bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(0.5 * bury.y * vU, bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
// no flow marks (chevrons, streaks) inside the vessel a tube leaves or opens into: where the tube lies in its parent's lumen its marks would be drawn over the parent's own (a torn chevron at every fork). They begin a little beyond where the ink does.
float markK(float d0, float d1) {
  float k0 = bury.x > 0.0 ? smoothstep(2.0 * bury.x * vU, 3.6 * bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(2.0 * bury.y * vU, 3.6 * bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
varying float vFade;
varying float circStay;
varying vec2 vNbr;
varying vec3 vCen;
varying float vHi;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;

// junction skins (skin/types.ts): the tube has a seam at either end
bool skinCutOn() { return skinCut.x >= 0.0 || skinCut.y <= 1.0; }
bool skinPast() { return (skinCut.x >= 0.0 && vUv.x < skinCut.x - 0.00002) || (skinCut.y <= 1.0 && vUv.x > skinCut.y + 0.00002); }
// the figure's units from this pixel to the nearest seam along the tube
float skinSeamDist() {
  float Lw = len * vU, d = 1e9;
  if (skinCut.x >= 0.0) d = (vUv.x - skinCut.x) * Lw;
  if (skinCut.y <= 1.0) d = min(d, (skinCut.y - vUv.x) * Lw);
  return d;
}
// the flow marks (chevrons, streaks, dust) die away over MARK_FADE_R radii before the seam: the skin draws none, and the stream chain carries the heads on into the next vessel past the junction
float skinMarkK() { return skinCutOn() ? smoothstep(0.0, 1.5 * max(vR, 1e-3), skinSeamDist()) : 1.0; }

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Doppler-style mean velocity (cm/s, signed) from the engine's flow (mL/s) and diameter (mm): the lumen's area is pi r^2
float meanVelocity(float q, float dmm) {
  float r = max(dmm, 0.5) * 0.05;
  return q / (3.14159265 * r * r);
}
// ---- the 2D app's flow heads (chevron-glsl.js, blood-heads.js) ----

// a head's half width: SHARE of the lumen's radius, at least MIN_W_PX wide (wpc: the units under one CSS px), never over SHARE_MAX of the radius
float chevHw(float R, float wpc) { return min(0.6 * R, max(0.55 * R, 2.0 * wpc)); }
float chevD(float u, float ay, float hw) {
  float L = 2.8 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-0.35 * px, 0.35 * px, d);   // (an edge ramp of EDGE_PX px: crisp)
  float rw = 1.0 * px;   // the head's ring: a hard-edged outline this wide at most, never a halo
  float rim = 1.0 - smoothstep(rw - 0.35 * px, rw + 0.35 * px, d);
  if (rev > 0.0) {
    float d2 = 0.6 * chevD((u + 1.904 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.35 * px, 0.35 * px, d2)));
    rim = max(rim, rev * (1.0 - smoothstep(rw - 0.35 * px, rw + 0.35 * px, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}
// how much of head j of the lattice of level n0 shows at level lv (coarser heads are a subset of finer ones; nothing jumps)
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}
// the in-between heads of the finer octave leave by SHRINKING (chevSize: from whole to SIZE_MIN of themselves) and vanish in the last of their keep (chevAlpha), never by turning translucent: a half-faded head is a pale ghost
// chevron beside the dark ones (Mohammad, 20 Nov: "pale slabs"), a smaller one in the same ink is not
float chevSize(float keep) { return 0.4 + 0.60 * keep; }
float chevAlpha(float keep) { return smoothstep(0.0, 0.12, keep); }
// the head's ring: always the dark ink, never a pale ring
const vec3 CHEV_RIM = vec3(0.2314, 0.1725, 0.1333);
// the head's tone: dark ink on a light lumen, cream on a dark one, never a grey halfway. cream is 1 for cream and 0 for dark ink: the vessel's own latched, eased value (lenses/chevron-ink.ts, read from the lens texture's fifth row),
// or chevCreamSoft where it has none. (drawn is the lit tone the tube is DRAWN in, celTubeBase(lens colour): the dark looks cap it brighter, so the head's tone follows what is on screen)
float chevLum(vec3 c) { return dot(pow(max(c, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)); }
float chevCreamSoft(vec3 drawn) { return 1.0 - smoothstep(0.240, 0.280, chevLum(drawn)); }
vec3 chevInk(float cream, vec3 markDark, vec3 markLight) {
  return mix(markDark * 0.5, markLight, cream);
}
vec2 chevLattice(float arc, float across, float pitch, float px, float dir) {
  float hw = pitch / 5.5;
  float x = mod(arc + 0.5 * pitch, pitch) - 0.5 * pitch;
  return chevHead(dir * x, abs(across) * hw / 0.55, hw, px, 0.0);
}


uniform vec4 dustP[12];
#define D_size dustP[0].x
#define D_sizeVar dustP[0].y
#define D_soft dustP[0].z
#define D_opacity dustP[0].w
#define D_opVar dustP[1].x
#define D_stretch dustP[1].y
#define D_lenK dustP[1].z
#define D_feather dustP[1].w
#define D_ring dustP[2].x
#define D_twinkle dustP[2].y
#define D_depthSize dustP[2].z
#define D_depthDim dustP[2].w
#define D_hue dustP[3].x
#define D_lightSpread dustP[3].y
#define D_lightBias dustP[3].z
#define D_satShift dustP[3].w
#define D_steps dustP[4].x
#define D_warm dustP[4].y
#define D_flowK dustP[4].z
#define D_speed dustP[4].w
#define D_uMax dustP[5].x
#define D_uMin dustP[5].y
#define D_velLocal dustP[5].z
#define D_flat dustP[5].w
#define D_radExp dustP[6].x
#define D_rhoMax dustP[6].y
#define D_densK dustP[6].z
#define D_shrink dustP[6].w
#define D_turb dustP[7].x
#define D_swirl dustP[7].y
#define D_pitch dustP[7].z
#define D_wobble dustP[7].w
#define D_turbFreq dustP[8].x
#define D_turbSpeed dustP[8].y
#define D_rhoJit dustP[8].z
#define D_cellP dustP[8].w
#define D_wRandom dustP[9].x
#define D_wSpeed dustP[9].y
#define D_wDepth dustP[9].z
#define D_wRadius dustP[9].w
#define D_wSource dustP[10].x
#define D_custom dustP[10].y
#define D_nCls dustP[10].z
#define D_win dustP[10].w
#define D_cr dustP[11].x
#define D_cg dustP[11].y
#define D_cb dustP[11].z
#define D_lenCap dustP[11].w
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
  float TcRaw = clamp(0.9 * (1.0 - smoothstep(0.5, 0.85, nar)) + 0.5 * smoothstep(25.0, 45.0, abs(vd)), 0.0, 1.0);
  float Hc = min(1.0, D_swirl * D_turb * TcRaw);
  float He = (1.0 - Hc) * min(1.0, D_swirl * D_turb * 0.4);
  float rotK = TWO_PI / max(D_pitch * rFix, 1e-3);
  vec3 pc = mix(lit, vec3(D_cr, D_cg, D_cb), D_custom);
  vec3 t0 = dShift(pc, -0.2 * D_hue, D_satShift + 0.02, D_lightBias + D_lightSpread * 0.6);
  vec3 t1 = dShift(pc, 0.5 * D_hue, D_satShift + 0.04, D_lightBias + D_lightSpread * 0.27);
  vec3 t2 = dShift(pc, -0.55 * D_hue, D_satShift, D_lightBias);
  vec3 t3 = dShift(pc, 0.0, D_satShift + 0.03, D_lightBias - D_lightSpread * 0.67);
  float srcHue = dHash(vec2(srcId * 3.7 + 1.3, 9.1)) * 2.0 - 1.0;
  vec4 acc = vec4(0.0);
  for (int kk = 0; kk < 4; kk++) {
    if (kk >= K) break;
    int k = K - 1 - kk;   // the outer rings first: the inner ones (nearer the axis, faster) lie over them
    float fk = float(k), fK = float(K);
    float rlo = D_rhoMax * pow(fk / fK, D_radExp), rhi = D_rhoMax * pow((fk + 1.0) / fK, D_radExp);
    float prof = 1.0 + D_flat * (1.0 - 2.0 * (0.5 * (rlo + rhi)) * (0.5 * (rlo + rhi)));
    float sp = prof * D_flowK;
    float xs = (se - flowFig * sp) / Pf + 0.37 * fk;
    float j0 = floor(xs);
    for (int n = -9; n <= 9; n++) {
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
      float T = clamp(D_turb * (TcRaw + 0.4 * w), 0.0, 1.3);
      float qL = ae / max(rFix, 1e-4) * 5.5;   // (the lab's own units: its wobble's wavelengths)
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

// (chevKeep, the lattice's keep, is in the one chevron chunk above: blood/chevron-glsl.ts)
// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(-10.0, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  float kp = chevKeep(j, n0, lv);
  float hw = chevHw(R, wpc) * chevSize(kp), L = 2.8 * hw;   // (a head is 6 CSS px tall from a tube 6 px across, as tall as the tube on a narrower one)
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
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
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
  float w = max(fwidth(f) * 1.2, 0.002);
  vec3 col = pal[4];
  col = mix(col, pal[3], 1.0 - smoothstep(c.w - w, c.w + w, f));
  col = mix(col, pal[2], 1.0 - smoothstep(c.z - w, c.z + w, f));
  col = mix(col, pal[1], 1.0 - smoothstep(c.y - w, c.y + w, f));
  col = mix(col, pal[0], 1.0 - smoothstep(c.x - w, c.x + w, f));
  return vec4(col, 1.0);
}
// the flow heads' tone on this vessel under one lens set (1 cream .. 0 dark ink): the vessel's latched, eased ink from the fifth row of the colour texture (lenses/chevron-ink.ts) where the lens runs a colour along it (la.a, a set of
// colours and not lanes), else the short eased step on the colour it is drawn in
float chevCreamOf(vec4 la, sampler2D grad, float mode) {
  if (la.a > 0.5 && mode < 1.5) return smoothstep(0.0, 1.0, texelFetch(grad, ivec2(int(lensIndex), 4), 0).r);
  return chevCreamSoft(celTubeBase(mix(color, la.rgb, la.a)));
}
// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
vec4 lensOf(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  return lensOfAt(lensIndex, mix(lensSpan.x, lensSpan.y, vUv.x), grad, lanes, mode, pal, across);   // (a branch of a vessel wears the stretch of its host's ramp it leaves from: no step in colour at the branch point)
}

// A free end in the Circuit is round: the pixels outside a half circle of the tube's own radius at the end are carved away (the tube is the lumen plus its line, so the ink runs round the cap).
// Exact at any ring spacing, which a geometry dome is not (a tube has a ring every 1/24 of a scene unit, about a radius).
bool capCarved(float across) {
  float k = smoothstep(0.7, 1.0, circT);
  if (k <= 0.0 || circCap.x + circCap.y < 0.5) return false;
  float dd = 1e9;
  if (circCap.x > 0.5) dd = vUv.x * len * vU;
  if (circCap.y > 0.5) dd = min(dd, (1.0 - vUv.x) * len * vU);
  float wpc = vCen.z * 2.0 / (res.y * projY) * vU;   // (the axis's depth, the one the vertex stage built the line from)
  float rCss = vR / max(wpc, 1e-6);   // CSS px, as the vertex stage's line is (the same clamp)
  float ink = clamp(0.3 * rCss, 1.6, 3.0) * mix(1.0, 1.1, circT) * wpc * inkOn;
  float R = (vR + ink) * k, a = dd + ink * k;
  if (a >= R) return false;
  float q = 1.0 - a / R;
  return across * across + q * q > 1.0;
}

void main() {
  float streakCover = 0.0;   // (how much a streak covers this pixel: a chevron's pixel is never tinted by one)
  vec3 cBody = vec3(0.0);    // (the tube's tone before the streaks)
  if (frontOut(vUv.x, reveal)) discard;
  if (fadedOut()) discard;
  // a part with no map course (a fan, a strand) fades out over the first half of the Circuit's change in the same screen pattern as the dive's dissolve (circuit/shader.ts)
  if (circStay < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= circStay) discard;
  if (vFade < 0.004) discard;
  // past the seam the skin draws this junction. On the Circuit's map the tubes morph into flat lines and the map draws its own joins, so the cut part comes back as the skin goes (SKIN_CIRC_SPAN of the change), by the same screen pattern as circStay's; at rest it is a plain discard
  if (skinCutOn() && skinPast()) {
    float cutA = smoothstep(0.0, 0.35, circT);
    if (cutA <= 0.0 || fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= cutA) discard;
  }
  vec3 n = normalize(vN);
  // (a tube seen end on has no sideways direction: a fixed one keeps the fragment finite, never a NaN, which a device draws black)
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across)) discard;
  if (!gl_FrontFacing) discard;
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) discard;
  }

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);

  // the fill: exactly TWO flat tones, lit by the one world light (cel-glsl.ts: the base, a hard edge EDGE_PX device px across, the shade, no gradient), so two pieces of one vein shade alike at their join and a turned camera
  // changes nothing; no rim, no highlight. rDev: the tube's radius in device px; the tones fade in over the radius (never across the tube) and a hairline is one tone.
  float wpc0 = vW * 2.0 / (res.y * projY) * vU;
  float rDev = vR / max(wpc0, 1e-6) * dpr;
  // the screen's own frame at this pixel: the tube's heading on screen, the pixel's offset from its axis, and its distance from it (device px)
  vec2 tS = vT.xy;
  float tl = length(tS);
  vec2 dvPx = gl_FragCoord.xy - (vCen.xy / vCen.z * 0.5 + 0.5) * res * dpr;
  float dLat = tl > 1e-3 ? abs(dot(dvPx, vec2(-tS.y, tS.x) / tl)) : length(dvPx);
  // the outline of the two tubes of a fork together is the outline of their UNION (neighbour.ts): where this pixel lies inside the other tube's lumen this tube draws no line, no fill past its own lumen, and no shade band (the other's
  // lumen opens there, lit). nbrK: how far inside, in device px, from 0 (on the other's wall) to 1 (half a pixel in).
  float nbrK = 0.0;
  if (vNbr.y > 0.0) nbrK = smoothstep(-0.5, 0.5, (vNbr.y - abs(vNbr.x)) / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr) * (1.0 - circT);
  // A VEIN INTO THE CAVA (a vessel that merges into a faded one: Mohammad, 20 Nov: "there should be a gradual fade into the target vessel, so that they both have the same fade at the point of junction") is one tube with the cava: as it nears the
  // wall it takes the cava's COLOUR (wB: 0 more than 1.6 cava radii before it, 1 at it) and eases its OPACITY down to the cava's (fadeHere: from 2.5 cava radii before the wall, by the pixel's own distance from the wall, never by a share of the vein's
  // length, so the ramp is the same across the vein's width and the wall's slant cannot make a diagonal), so at the wall both are the same colour and the same alpha and there is no step either way. It is drawn up to the wall and not inside the lumen, cut
  // along the wall's own line (cavA: a pixel wide, anti-aliased), so it opens into the cava with nothing hanging on the far side and the cava's own two tones carry on. Body and outline fade together, the vein is never a flat pale wedge.
  float cavA = 1.0, fadeHere = vFade;
  if (cavaCut > 0.5 && vNbr.y > 0.0) {
    float cd = vNbr.y - abs(vNbr.x);
    float wB = smoothstep(-1.6 * vNbr.y, 0.0, cd) * (1.0 - circT);
    float wA = smoothstep(-2.5 * vNbr.y, 0.0, cd) * (1.0 - circT);
    vec4 la2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradA, lensLaneA, lensModeA, laneColA, across), lb2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradB, lensLaneB, lensModeB, laneColB, across);
    base = mix(base, mix(mix(color, la2.rgb, la2.a), mix(color, lb2.rgb, lb2.a), lensMix), wB);
    fadeHere = mix(vFade, cavaA, wA);
    float cdPx = cd / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr;
    cavA = mix(1.0 - smoothstep(-0.5, 0.5, cdPx), 1.0, circT);
  }
  if (cavA < 0.004) discard;
#ifdef VEIL
  fadeHere *= veilK;
#else
  fadeHere *= solidK;
#endif
  if (fadeHere < 0.004) discard;
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from (the surface's depth differs from it on a foreshortened tube near the camera, and the band would then start inside or outside the tube it was built for)
  // (the shade band is not cut off at the other tube's wall: two tubes of a fork are one surface that blends, so the band thins and is gone by the time it reaches the other's lumen, over 0.8 of the other's radius: no ledge and no dash where the band would otherwise end)
  float nbrT = nbrK;
  if (vNbr.y > 0.0) nbrT = max(nbrK, smoothstep(-0.8, 0.0, (vNbr.y - abs(vNbr.x)) / vNbr.y) * (1.0 - circT));
  vec3 c = celTubeTone(base, mix(sT, 1.0, nbrT), fwidth(sT) * (1.0 - nbrT), rDev);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, 0.080 * quietK);   // (0 for every tier but the back one)
  // THE DUST (blood/dust-glsl.ts, the Dust Lab's particles, Mohammad 20 Nov) is part of the tube: painted here, in its own fragment shader, so it is inside the lumen (dustField draws nothing past 0.96 of the half width,
  // never touching the ink) and follows the tube's own alpha and fade zones by construction: there is no second mesh to stray past a tube's end, a taper or a fade. Under the chevrons, which come after.
  if (streakAmt > 0.001 && vR > 0.0 && abs(across) < 0.97) {
    vec4 smS = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);   // the blood's own distance and speed on this vessel: reversed runs back, none stands
    float rCssD = vR / max(vW * 2.0 / (res.y * projY) * vU, 1e-6);
    float nar = 1.0;
    if (useData > 0.5) { ivec2 tcn = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x))); nar = texelFetch(vdata, tcn, 0).b / max(baseD, 0.1); }
    vec4 chD = texelFetch(chainTex, ivec2(int(lensIndex), 0), 0);
    float dOn = markK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) * skinMarkK() * streakAmt * smoothstep(1.5, 2.1, rCssD) * smoothstep(0.0, 2.0, abs(smS.y));
    if (dOn > 0.002) {
      // (the streak distance, texel w: the stream's distance D held to a speed no pattern wagon-wheels at, streams.ts; the same arc and gate the heads have, and none only where the flow is none)
      float sD = vUv.x * len * vU, rOwn = max(radius * vU, 1e-3), wl = chD.w;
      vec3 litD = celTubeBase(base);
      vec4 dust = vec4(0.0);
      if (wl < 1.0) dust = dustField(across, sD, 0.0, 1.0, smS.w, rOwn, rOwn, vR, rCssD, len * vU, nar, smS.y, smS.z, fract(lensIndex * 0.6180339) * 50.0, lensIndex + 1.0, litD, inkColor);
      if (wl > 0.0) {   // the blood runs on from the parent: the root's particles, at the root's distance, A + B s along its stream (the chevrons' own placing)
        int rootIx = int(chD.x + 0.5) - 1;
        vec4 dc = dustField(across, sD, chD.y, chD.z, texelFetch(streamTex, ivec2(rootIx, 0), 0).w, rOwn, max(texelFetch(chainTex, ivec2(int(lensIndex), 1), 0).w * vU, 1e-3), vR, rCssD, len * vU, nar, smS.y, smS.z, fract(float(rootIx) * 0.6180339) * 50.0, chD.x, litD, inkColor);
        dust = wl >= 1.0 ? dc : mix(dust, dc, wl);   // (a link forming or letting go cross-fades the two sets: nothing pops)
      }
      streakCover = dOn * dust.a;
      cBody = c;
      c = c * (1.0 - streakCover) + dust.rgb * dOn;
    }
  }

  float vel = 0.0;
  float dmm = 8.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    vec4 td = texelFetch(vdata, tc, 0);
    dmm = td.b;
    vel = meanVelocity(td.g, dmm);
  }

  // stagnant blood in a big vein: slow, but not none (FLOW_CUTS none 1, stasis 9 cm/s), drifts as smoke. OFF by default (vessel-object.ts smokeOn 0, setSmoke(true) for a slide that asks for stasis): inside a tube there
  // are only the three flat tones and the flow heads, never blobs. When on, the smoke is flat patches of one tone with a hard edge, never a soft cloud.
  if (smokeOn > 0.5 && useData > 0.5 && dmm > 5.0 && abs(vel) > 1.0 && abs(vel) < 9.0) {
    float drift = time * 0.04;
    float nz = vnoise(vec2(vUv.x * len * 5.0 + drift * 6.0, across * 3.0 + drift)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - drift * 4.0, across * 6.0)) * 0.35;
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    float nzW = max(fwidth(nz) * 0.75, 1e-3);
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), smoothstep(0.62 - amt - nzW, 0.62 - amt + nzW, nz) * 0.3);
  }

  // the flow heads, on the tube's surface as the 2D composite lays them
  float pxArc = fwidth(vUv.x * len * vU);   // (a derivative: taken outside any branch)
  float acrossW = max(fwidth(across), 0.03);
  if (flowAmount > 0.001 && vR > 0.0) {
    vec4 stm = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);
    float Dm = stm.x, vd = stm.y, rv = stm.z;
    float wpc = vW * 2.0 / (res.y * projY) * vU;      // the figure's units under one CSS px here
    float R = max(vR, 0.3), Lw = len * vU, s = vUv.x * Lw;
    float px = clamp(pxArc, 0.15 * wpc, 1.5 * wpc);   // (held to a CSS pixel: at a grazing silhouette the arc's derivative runs away and would smear a head)
    float Pt = 130.0 * wpc;
    vec4 c4 = texelFetch(chainTex, ivec2(int(lensIndex), 0), 0), c5 = texelFetch(chainTex, ivec2(int(lensIndex), 1), 0);
    vec2 ch = vec2(0.0);
    if (c4.w < 1.0) ch = chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px);
    if (c4.w > 0.0) {
      float rootD = texelFetch(streamTex, ivec2(int(c4.x + 0.5) - 1, 0), 0).x;
      vec2 cc = chevOne(s, Lw, c4.y + c4.z * s, c4.z, rootD, vd, rv, c5.xy, R, across, wpc, Pt, px);
      ch = c4.w >= 1.0 ? cc : mix(ch, cc, c4.w);
    }
    // heads are on every tube down to about 4 CSS px across (R 1.5 px: the spacing never depends on the width), and are cut at the wall (never on the ink)
    float fade = markK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) * skinMarkK() * flowAmount * smoothstep(1.5 * wpc, 2.1 * wpc, R) * (1.0 - smoothstep(1.0, 1.0 + acrossW, abs(across)));   // (a head stands inside the lumen, 55 percent of it: this is only the wall's own cut)
    fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
    if (fade > 0.0 && ch.x + ch.y > 0.0) {
      float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
      // one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one. The tone is the VESSEL's own latched, eased value (lenses/chevron-ink.ts: hysteresis, so a pressure at the threshold never flickers it,
      // and an ease, so it never pops), read from the lens texture's fifth row; where the lens runs no colour along the vessel it is a short eased step on the drawn luminance (blood/chevron-glsl.ts chevCreamSoft)
      float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
      float cream = mix(chevCreamOf(la, lensGradA, lensModeA), chevCreamOf(lb, lensGradB, lensModeB), lensMix);
      vec3 core = mix(mix(chevInk(cream, markDark, markLight), markRev, rk), markLight, warm);   // (the one chevron's tone: blood/chevron-glsl.ts)
      vec3 rimc = CHEV_RIM;   // the head's outline is always the dark ink: a flat head with a dark line, never a pale ring
      float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
      float ha = ac + ar * (1.0 - ac);
      if (streakCover > 0.0) c = mix(c, cBody, ha);   // the streaks lie UNDER the chevrons: a head's pixel is never tinted by one
      c = c * (1.0 - ha) + core * ac + rimc * ar * (1.0 - ac);
    }
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's (it is built INK wider, see the vertex stage). The exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius:
  // the line is continuous by construction (no second mesh, no stencil, no depth tie), constant in device pixels (the vertex stage widened the tube by the same line) and antialiased half a pixel each side. It follows the fade
  // (the same alpha as the body), is not drawn on a joined end's last stretch (a smooth join buries the cut) and is the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white).
  float endK = vHi > 0.001 || nbrOn > 0.5 ? 1.0 : buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU);
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * endK * inkOn;
  inkT *= 1.0 - nbrK;
  if (nbrK > 0.5 && dLat > rDevAx + 0.5) discard;
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads (the ink outside it is lost on the ground)
  float inDepth = clamp(0.35 * rDevAx, 1.0 * dpr, 3.5 * dpr);   // (CSS px set, held in device px here: the same share of the line on every screen)
  c = mix(c, inkColorCirc, circT * 0.55 * smoothstep(rDevAx - inDepth, rDevAx, dLat) * endK * inkOn);
  if (inkT > 0.0) {
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    vec3 inkH = mix(inkColor, celTubeBase(baseH) * mix(0.32, 0.55, tubeDark), 0.75);
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);   // (a selected vessel's line is its own: the glow is a separate halo, glow.ts)
  }
  // the stent in the Circuit (the 3D device is the body's; the map draws it on the shunt's own lane, as 2D does): the bare open cells (rings of five crowns, every other one turned half a crown), the gold band where the
  // graft starts, the nested rings along the graft and the graft's faint sleeve, all sized by the lumen (a twelfth of its half width is the mocks' unit, stent-build.ts), eased in with the morph
  if (stentU.x > 0.001 && circT > 0.001 && vUv.x > stentU.y && vUv.x < stentU.z) {
    float kS = stentU.x * circT, Lw = len * vU, s = vUv.x * Lw, un = max(vR, 0.3) / 12.0, s0 = stentU.y * Lw, sB = stentU.w * Lw, sE = stentU.z * Lw;
    float th = asin(clamp(across, -1.0, 1.0)), px = max(pxArc, 1e-4), cov = 0.0, gold = 0.0;
    float bEnd = sB > s0 + 6.0 * un ? sB : sE - 1.2 * un, t0 = s0 + 1.2 * un;
    float Nb = max(1.0, floor((bEnd - t0) / (17.0 * un) + 0.5)), Pb = (bEnd - t0) / Nb, Ab = 0.5 * Pb;
    float jb = floor((s - t0) / Pb);
    for (int i = -1; i <= 1; i++) {
      float j = jb + float(i), ok = (j < 0.0 || j >= Nb || s > bEnd + Ab) ? 0.0 : 1.0;
      float ph = mod(j, 2.0) > 0.5 ? 3.14159265 : 0.0;
      // (a wire's distance in SCREEN pixels, the distance over its own slope: a crown's steep flank stays one even line instead of breaking into dashes)
      float dv = s - (t0 + Ab + j * Pb + Ab * cos(5.0 * th + ph));
      cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwidth(dv), 1e-5))));
    }
    if (sB > s0 + 6.0 * un) {
      float Pc = 11.0 * un, Ac = 0.42 * Pc, c0 = sB + Ac + 2.5 * un, Kc = max(0.0, floor((sE - 1.2 * un - Ac - c0) / Pc));
      float jc = floor((s - c0) / Pc + 0.5);
      for (int i = -1; i <= 1; i++) {
        float j = jc + float(i), ok = (j < 0.0 || j > Kc) ? 0.0 : 1.0;
        float dv = s - (c0 + j * Pc + Ac * cos(5.0 * th));
        cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwidth(dv), 1e-5))));
      }
      c = mix(c, vec3(1.0), 0.16 * kS * smoothstep(sB - px, sB + px, s));
      gold = 1.0 - smoothstep(0.5 * px, 1.4 * px, abs(s - (sB + 1.5 * un * (1.0 - abs(cos(th))))));
    }
    c = mix(c, inkColor, 0.85 * cov * kS);
    c = mix(c, vec3(0.86, 0.66, 0.2), gold * kS);
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
        float tn = clamp((aa + 0.97) / 1.94, 0.0, 1.0), kd = floor(tn / B.w), q = tn - kd * B.w, ew = max(fwidth(tn), 1e-4);
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
    float wa = wedge.x * (1.0 - smoothstep(wedge.y - 0.08, wedge.y, vUv.x));
    wa *= mix(1.0, smoothstep(0.0, max(wedge.z, 0.001), vUv.x), wedge.w);
    c = mix(c, wedgeCol, 0.78 * wa);
  }
  gl_FragColor = vec4(c, fadeHere * cavA);
}