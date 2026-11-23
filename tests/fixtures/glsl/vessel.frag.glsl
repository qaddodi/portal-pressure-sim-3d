

uniform float fade;
bool fadedOut() { return fade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= fade; }
// A tube drawing on or retracting along its length (`reveal`, 0 to 1 over u): the front is a soft gradient, a tenth of the length, dissolved in the same screen pattern, never a hard cut.
bool frontOut(float u, float rv) {
  if (rv >= 0.9999) return false;
  float k = clamp((rv * 1.1 - u) / 0.1, 0.0, 1.0);
  return k < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= k;
}

const float WEDGE_A = 0.5;
float wedgeCover(float d, vec3 p) {
  return smoothstep(-max(p.x, 1e-4), 0.0, d) * (1.0 - smoothstep(p.y - max(p.z, 1e-4), p.y, d));
}

uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)

// the radius (device px) gate of the tones: 0 on a hairline, 1 from TONES_TO up; it follows the radius, never the position across
float celTubeHw(float rDev) { return smoothstep(1.0, 2.0, rDev); }
// the lens colour made saturated and deep (a pale end of a ramp is darkened, its hue kept): the one flat base every tone is cut from
float celTubeLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// (tubeDark: 1 on the dark looks (Dark, Navy, Black), the brighter caps; declared once by the program that includes this: vessels/shaders.ts, materials/shaders.ts)
// tubeRawK: how much of the colour about to be made is AUTHORED AS DRAWN (the pressure ramp, lenses/pressure-ramp.ts): 0 for every other colour (a lens's 2D ramp, an artery, the tone colours), 1 where the lens colour is the
// pressure ramp. Each program sets it where it mixes the lens colour into base (vessels/shaders.ts, skin/shaders.ts, blood/cells/shader.ts: la.a x lensRawA, lb.a x lensRawB, crossfaded by lensMix, so a lens switch eases
// from the transform to the raw colour with the colours themselves and nothing pops). celTubeBase reads it, so every consumer (tone, ink, dust, heads, streaks, glow) agrees.
float tubeRawK = 0.0;
vec3 celTubeBase(vec3 b) {
  float l = celTubeLum(b);
  vec3 c = clamp(mix(vec3(l), b, 1.5), 0.0, 1.0);
  float lcap = mix(0.62, 0.82, tubeDark), vcap = mix(0.78, 0.96, tubeDark);
  return mix(c * min(min(1.0, lcap / max(celTubeLum(c), 1e-3)), vcap / max(max(c.r, max(c.g, c.b)), 1e-3)), b, tubeRawK);
}
// OKLab lightness lift (the JS twin: cel-ink.ts celTubeLift): sRGB in and out as the scene writes it, hue and chroma kept, clamped to the gamut
vec3 celTubeLift(vec3 c, float dL) {
  vec3 q = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  vec3 lms = pow(max(vec3(dot(vec3(0.4122214708, 0.5363325363, 0.0514459929), q), dot(vec3(0.2119034982, 0.6806995451, 0.1073969566), q), dot(vec3(0.0883024619, 0.2817188376, 0.6299787005), q)), vec3(0.0)), vec3(1.0 / 3.0));
  vec3 lab = vec3(dot(vec3(0.2104542553, 0.793617785, -0.0040720468), lms), dot(vec3(1.9779984951, -2.428592205, 0.4505937099), lms), dot(vec3(0.0259040371, 0.7827717662, -0.808675766), lms));
  lab.x += dL;
  vec3 k = vec3(lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z, lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z, lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z);
  k = k * k * k;
  vec3 o = vec3(dot(vec3(4.0767416621, -3.3077115913, 0.2309699292), k), dot(vec3(-1.2684380046, 2.6097574011, -0.3413193965), k), dot(vec3(-0.0041960863, -0.7034186147, 1.707614701), k));
  o = clamp(o, 0.0, 1.0);
  return clamp(mix(12.92 * o, 1.055 * pow(o, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), o)), 0.0, 1.0);
}
// the fill: TWO flat tones across the tube, matte and opaque: the saturated base on the lit side, a hue-preserving darker step (a touch more saturated) on the other, one hard edge EDGE_PX device px across between them at
// VESSEL_STEP_AT. No highlight, no rim, no translucency. s the lit-side measure (n.L against the world light, celLightView), sw its change per device pixel (fwidth(s), taken
// outside any branch), rDev the radius in device px; a hairline (under TONES_FROM) is the base alone.
vec3 celTubeToneArt(vec3 base, float s, float sw, float rDev, float art) {
  float et = max(0.5 * 1.0 * sw, 1e-4), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(0.25 - et, 0.25 + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - 0.38);
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, 1.2), 0.0, 1.0);
  vec3 c = mix(b, sh, hw * shadowT);
  // an ARTERY's lumen is one tone step lighter (CEL_STYLE.ARTERY.LIFT_L in OKLab lightness, hue and chroma kept), both tones, easing in with the tones' own radius gate: a hairline is the base alone, and art 0 (a vein) takes no part
  float lift = art * hw * 0.07;
  return lift > 0.0 ? celTubeLift(c, lift) : c;
}
vec3 celTubeTone(vec3 base, float s, float sw, float rDev) { return celTubeToneArt(base, s, sw, rDev, 0.0); }


const vec3 CEL_LIGHT = vec3(-0.5014059075751371, 0.62174332539317, 0.6016870890901646);
vec3 celLightView() { return (viewMatrix * vec4(CEL_LIGHT, 0.0)).xyz; }


#ifdef VDBG
uniform float dbgShade;
uniform float dbgDust;
uniform float dbgHeads;
uniform float dbgInk;
uniform float dbgTint;
uniform float dbgWhy;
// WHY A PIXEL IS DROPPED (a tube's discards, shaders.ts DROP(n)): with the switch on the pixel is painted in the reason's colour instead of dropped. 1 reveal front blue, 2 fade dither green, 3 map dither light green, 4 vFade yellow, 5 skin cut cyan,
// 6 map skin cut teal, 7 round cap orange, 8 back face red, 9 dotted white, 10 cava cut purple, 11 final alpha pink, 12 inside the other lumen (ink band cut) magenta
vec3 dbgWhyCol(float n) {
  if (n < 1.5) return vec3(0.1, 0.2, 1.0); if (n < 2.5) return vec3(0.0, 0.8, 0.0); if (n < 3.5) return vec3(0.6, 1.0, 0.5); if (n < 4.5) return vec3(1.0, 0.9, 0.0);
  if (n < 5.5) return vec3(0.0, 1.0, 1.0); if (n < 6.5) return vec3(0.0, 0.5, 0.5); if (n < 7.5) return vec3(1.0, 0.5, 0.0); if (n < 8.5) return vec3(1.0, 0.0, 0.0);
  if (n < 9.5) return vec3(1.0); if (n < 10.5) return vec3(0.6, 0.2, 0.9); if (n < 11.5) return vec3(1.0, 0.4, 0.7); return vec3(1.0, 0.0, 1.0);
}
#define DROP(n) { if (dbgWhy > 0.5) { gl_FragColor = vec4(dbgWhyCol(float(n)), 1.0); return; } discard; }
uniform vec4 dbgCol;
vec3 dbgBody(vec3 c, vec3 base, vec3 n) {
  if (dbgShade < 0.5) return c;
  if (dbgShade < 1.5) return celTubeBase(base);
  if (dbgShade < 2.5) return n * 0.5 + 0.5;
  return base;
}
vec3 dbgEnd(vec3 c, float id) {
  if (dbgTint > 0.5) c = mix(c, 0.5 + 0.5 * cos(6.2831853 * (fract(id * 0.61803399) + vec3(0.0, 0.33, 0.67))), 0.65);
  return mix(c, dbgCol.rgb, dbgCol.a);
}
#else
#define DROP(n) discard;
#endif

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
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform float lensRawA;
uniform float lensRawB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform float lensIndex;
uniform vec2 lensSpan;
uniform float lensSmooth;   // smooth joins on (1): the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3), not straight from one end's to the other's
uniform float smokeOn;
uniform vec3 hiColor;
uniform float shadowPx;   // the crossing shadow (cel-ink.ts SHADOW): the band's width beyond the line, CSS px
uniform float shadowA;   // its strength in this look
uniform vec3 shadowCol;   // its tone
uniform vec2 shadowEnd;   // the radii over which it fades out at each end that joins another vessel (0: a free end)
uniform float glowK;   // the glow's strength (1; a shunt's target under the pointer more: highlight.ts HOVER_GLOW)
uniform float inkOn;
uniform vec3 stump;   // (the vertex stage's: a divided vein's stump and its tie)
uniform vec4 seamA[2];   // a surgical shunt's stitches, its start's then its end's (seams.ts): the seam's distance in from the end as a quartic in the place across (c0..c3 here, c0 = 0: none)
uniform vec4 seamB[2];   // (c4, how many dashes (0: three ticks), one dash's share of the seam, one dash and its gap's share)
uniform vec4 stentWire;   // the stent's wire in the Circuit: rgb the Anatomy stent's own wire colour, a its strength (stent-look.ts, one source for both views)
uniform vec4 stentGoldC;  // the band's colour and strength, the same way
uniform vec4 stentU;   // a stent in this vessel, drawn on the tube in the Circuit (where the 3D device is faded out): x its share shown (0 none), y and z where it starts and ends along the course (0..1), w where its graft starts
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float cavaCut;   // 1 on a vein that opens into the cava (2: only its opacity ramp, where a skin has the end) (nbr is the cava's): it takes the cava's colour and alpha as it nears the wall and is not drawn inside the lumen, so it ends exactly at the wall with no step
uniform float solidK;    // a vessel drawn behind the organs: how much of its solid copy (drawn with the organs, hidden by one in front) shows: 1 for every other vessel (Settings > Hide vessels behind organs)
uniform float veilK;     // and of its veil copy (drawn over the organs, shown through them)
uniform float cavaA;     // the cava's opacity where the vein joins it: the vein's own comes to it at the wall (no step in alpha)
uniform vec2 cavaRef;    // the cava piece's lens index and the share along it where the vein joins: the colour the vein takes on
uniform vec2 skinCut;   // junction skins (skin/types.ts, WP4): the tube is drawn only between u = skinCut.x and u = skinCut.y; past either the skin (one welded mesh at the junction) takes over. (-1, 2): no cut, every branch it guards a no-op
uniform vec2 skinCutC;  // the same on the Circuit's MAP (circuit/skins.ts): the tube is cut at its map seams (u is the same share of the course in both views) and the map's own skin draws the junction; it takes effect over the end of the change (SKIN_CIRC_IN), the body's cut over its start. (-1, 2): none
uniform vec2 skinHole;   // a side-wall junction's HOLE (skin/types.ts, spec 10.1): the tube is not drawn between u = skinHole.x and u = skinHole.y, the skin draws that stretch. (2, -1): no hole (never true for any u)
uniform vec2 skinHole2; // a vessel has at most two
uniform vec2 skinWeldC;  // the same weld on the Circuit's MAP cut (circuit/skins.ts): per end, 1 the cut is whole (the map's skin has taken it), less and a growing arm's cut end is drawn at the pixels the skin does not draw
uniform vec3 skinWeld;  // how much of the tube's CUT end the skin has taken over, per end (x the start's, y the end's, z a hole's): 1 the cut is whole (every skinned end but a growing one's), less and the cut part is still drawn at the pixels the skin does not draw (the same screen pattern: a pixel is the skin's where the pattern is under this), so a growing arm's flared end goes as its welded skin comes in
uniform float nbrMap;   // 1 on a map-only tube: the union's rule holds on the map for it (nbr is its host's there)
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
uniform vec4 wedge;       // the wedged vein's static column as a tint on the vessels themselves (wedge-glsl.ts): x how much, y how softly it ends behind the balloon's distal edge (route distance), z how far the fade to the branch tip runs (u), w how much of it fades
uniform vec3 wedgeCol;
uniform vec4 wedgeD;       // the column's ONE field: x + y u is this vessel's route distance from the balloon's distal edge at u; z the front's distance (the column filling), w how softly it ends
uniform float quietK;       // quiet depth on a turn (camera/quiet.ts): the back tier eases toward the page by QUIET_BACK of this, 0 face on
uniform vec3 pageCol;       // the plate colour it eases toward
uniform vec4 rimInk;        // (kept for the palette's API: no light rim is drawn)
varying float vW;
varying float vR;
// ONE packed varying (a phone's floor is 15 vectors, and every one counts): x vU, the figure's units in one scene unit here (300 on the body, 1 / MAP_K on the map, the Circuit share of this vertex); y vArcLen, the vessel's
// length along the course it is drawn on now (the body course's len at rest, the map course's cl.y in the Circuit, by the same share); z vR0, the lumen's half width before a stenosis or the stent's waist pinches it (figure units:
// the stent's cells and bare length are sized from it); w vSkew, the stent's wires' shift along the tube here (figure units: the lateral offset in the map's plane times the bend turned since the stent began, so a cell keeps
// its length round a corner). Named by macros, so every use reads as before.
varying vec4 vUp;
#define vU vUp.x
#define vArcLen vUp.y
#define vR0 vUp.z
#define vSkew vUp.w
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
varying float vCircShare;
varying float circStay;
varying vec3 vNbr;
varying vec3 vCen;
varying float vHi;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;   // the figure's normal (model z) in the view's frame: the dust's section frame (blood/dust-glsl.ts dustFrame)
varying vec2 vUv;
varying vec2 vLensR;

// junction skins (skin/types.ts): the tube has a seam at either end
// (a divided vein's start is its tied, round end: no skin joins it there, so the tube is not cut at its start seam: the skin arm there is absent, arm-twins.ts liveFadeAt)
float skinStartCut() { return stump.x > 0.0 ? -1.0 : skinCut.x; }
bool inSkinHole(vec2 h) { return h.y > h.x && vUv.x > h.x + 0.00002 && vUv.x < h.y - 0.00002; }
// (a dotted thread, a closed potential collateral, is never cut: it runs on into the trunk's wall, and the skin there is a plain trunk, its growth 0: skin-set.ts sync, spec 10.2. A hole is the host's own and is never a dotted thread's)
bool skinPastC() { return circT > 0.0 && dotted < 0.5 && ((skinCutC.x >= 0.0 && vUv.x < skinCutC.x - 0.00002) || (skinCutC.y <= 1.0 && vUv.x > skinCutC.y + 0.00002)); }
bool skinCutOn() { return dotted < 0.5 && (skinStartCut() >= 0.0 || skinCut.y <= 1.0) || skinHole.y > skinHole.x || skinHole2.y > skinHole2.x; }
float skinWeldAtC() { return (dotted < 0.5 && skinCutC.x >= 0.0 && vUv.x < skinCutC.x - 0.00002) ? skinWeldC.x : (dotted < 0.5 && skinCutC.y <= 1.0 && vUv.x > skinCutC.y + 0.00002) ? skinWeldC.y : 1.0; }
float skinWeldAt() { return (dotted < 0.5 && skinStartCut() >= 0.0 && vUv.x < skinStartCut() - 0.00002) ? skinWeld.x : (dotted < 0.5 && skinCut.y <= 1.0 && vUv.x > skinCut.y + 0.00002) ? skinWeld.y : (inSkinHole(skinHole) || inSkinHole(skinHole2)) ? skinWeld.z : 1.0; }
bool skinPast() { return (dotted < 0.5 && ((skinStartCut() >= 0.0 && vUv.x < skinStartCut() - 0.00002) || (skinCut.y <= 1.0 && vUv.x > skinCut.y + 0.00002))) || inSkinHole(skinHole) || inSkinHole(skinHole2); }

// PLAN 12, THE OUTER EDGE ON THE TRUE CIRCLE. The tube is built wider than the circle of its lumen plus line (the ring is a 14-sided polygon built TUBE_SAG fatter so its flats stand on the circle and its corners outside it), so the outer edge of its
// hull wobbles up to a pixel or more past the circle. Where the tube is PLAIN the hull is wider than the circle for that one reason only, and the pixels past the circle go. The reasons the hull is legitimately wider are every one a "no" below, in this one
// place (tests/plain-here.test.ts reads the list): the Circuit, a highlighted line, a divided stump, a fork or a cava mouth (the union's outline, the neighbour's pull), a buried or run-on end, and the stretch the skin overlaps at a seam or a hole
// (the skin draws that edge, and its band is up to SKIN_SEAM_PAD_PX wider).
uniform float inflate;
bool plainHere(float wpc0) {
  if (circT > 0.0 || vHi > 0.001 || stump.x > 0.0 || dotted > 0.5 || inflate != 0.0 || nbrOn > 0.5 || cavaCut > 0.5) return false;
  if (vNbr.y > 0.0 || vNbr.x != 0.0 || vNbr.z != 0.0) return false;
  if (buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) < 0.9999) return false;
  float arcPx = vArcLen * vU / max(wpc0, 1e-6);   // CSS px along the course from u = 0 to 1
  float edgePx = 6.0;   // a joined or cut end's reach, CSS px
  if ((mate0.x >= 0.0 && vUv.x * arcPx < edgePx) || (mate1.x >= 0.0 && (1.0 - vUv.x) * arcPx < edgePx)) return false;
  if (skinStartCut() >= 0.0 && abs(vUv.x - skinStartCut()) * arcPx < edgePx) return false;
  if (skinCut.y <= 1.0 && abs(vUv.x - skinCut.y) * arcPx < edgePx) return false;
  if (skinHole.y > skinHole.x && (abs(vUv.x - skinHole.x) * arcPx < edgePx || abs(vUv.x - skinHole.y) * arcPx < edgePx)) return false;
  if (skinHole2.y > skinHole2.x && (abs(vUv.x - skinHole2.x) * arcPx < edgePx || abs(vUv.x - skinHole2.y) * arcPx < edgePx)) return false;
  return true;
}

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


uniform vec4 dustP[14];
uniform sampler2D routeTex;
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
#define D_wLookB dustP[12].x
#define D_lanes dustP[12].y
#define D_laneJit dustP[12].z
#define D_cellLen dustP[12].w
#define D_fill dustP[13].x
#define D_trains dustP[13].y
#define D_dbg dustP[13].z
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
// THE HUE STAYS IN THE VESSEL'S FAMILY (Mohammad, 20 Nov: brown, yellow, periwinkle and white specks at the pale joints): HSL's hue and saturation are noise on a base with no colour in it, and HSL's saturation of a NEAR-WHITE one is
// large (d / (2 - max - min): a pale blue-grey of chroma 0.04 has s 0.75), so a lightness shift of it gave a vivid pastel of an arbitrary hue. What a base is worth is its CHROMA (max - min), which no lightness changes: the hue shift,
// the saturation added and the saturation itself are all scaled by how much chroma it has (dShiftK), so a grey or near-white base keeps only the lightness spread, and a coloured one is exactly as before.
float dShiftK(vec3 c) { return smoothstep(0.03, 0.15, max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))); }
// THE CHROMA IS KEPT, NOT HSL's SATURATION (Mohammad, 21 Nov: violet specks on the pale cava and confluence): a dark tone of a PALE base kept the base's HSL saturation, which is large near white (chroma 0.15 at l 0.8 is s 0.75), so
// lowering the lightness gave a vivid blue-violet far from the pale vessel it sits in. The tone's chroma is the base's (plus the saturation added), then re-expressed as the saturation of the new lightness.
vec3 dShift(vec3 c, float dh, float ds, float dl) {
  vec3 h = dRgb2Hsl(c); float k = dShiftK(c);
  float l1 = clamp(h.z + dl, 0.04, 0.96), ch0 = (h.y + ds * k) * k * (1.0 - abs(2.0 * h.z - 1.0));
  return dHsl2Rgb(vec3(fract(h.x + dh * k + 1.0), clamp(ch0 / max(1.0 - abs(2.0 * l1 - 1.0), 0.08), 0.0, 1.0), l1));
}
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
struct DPart { float alive; float h1; float h2; float h3; float h4; float h5; float h6; float h7; float rho; float yl; float zr; float se; float prof; float root; float cf; float sx; float sy; };
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
  float TcRaw = clamp(0.9 * (1.0 - smoothstep(0.5, 0.85, F.nar)), 0.0, 1.0);
  float T = clamp(D_turb * TcRaw, 0.0, 1.3) * smoothstep(0.0, 0.5 * Wd, d);
  vec2 tw = dTwist(ae, F.Lw, dTurns(F.edge));
  float qL = ae / max(F.rFix, 1e-4) * 5.5;   // (the lab's own units: its wobble's wavelengths)
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
  P.root = root; P.cf = 0.5; P.sx = 0.0; P.sy = 0.0;
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
float dFlow(float root) { return texelFetch(streamTex, ivec2(int(root), 0), 0).w; }

// THE TUBE: every lane segment the pixel can see, of the current layout and (while it fades out) the last one
// how much of the vessel's dust shows ("Key streaks only" eases a vessel's out: routes.ts KEEP_ROW)
// THE DUST FOLLOWS THE PIXEL'S FINAL ALPHA (Mohammad, 20 Nov: dark specks and torn blocks at junctions, only with Blood streaks on): the dust is a colour inside the vessel's own, so a faded, veiled or half-present vessel (the cava, a vein into it, a vessel behind an
// organ, a skin's seam) carries it at that alpha too; this holds it back further where the pixel is mostly gone, so a particle never stands out from a vessel that is not there (a plain ease, 0 below 0.05, whole from 0.6: nothing pops).
float dHold(float a) { return smoothstep(0.05, 0.6, a); }
// A NaN OR AN INFINITY from any term of the lattice (a degenerate route, a zero-width lane) becomes no dust, never a pixel of some other colour or a black one. IT IS TESTED ON THE BITS, NOT BY A COMPARISON: a phone GPU compiles with fast
// maths (no NaN is assumed to exist), so the comparison dot(v, v) < 64.0 is whatever the compiler makes of it for a NaN, and a NaN that got through wrote the pixel as 0 0 0 (the black blocks and specks at the junctions, Mohammad's iPhone, 20 and 23 Nov;
// the vertex NaN of 19 Nov drew the same). An exponent of all ones is NaN or infinity, an integer test no float mode can fold away (tests/dust-lanes.test.ts).
vec4 dustCover = vec4(0.0);   // (the dust as painted on this pixel, for the debug paint)
float dustBadSeen = 0.0;   // (the debug paint, ?dust: set when dSafe dropped a term, so a pixel that lost one can be shown)
bool dBad(vec4 v) { return any(equal(floatBitsToUint(v) & uvec4(0x7f800000u), uvec4(0x7f800000u))); }
vec4 dSafe(vec4 v) { bool bad = dBad(v) || dot(v, v) >= 64.0; dustBadSeen = max(dustBadSeen, bad ? 1.0 : 0.0); return bad ? vec4(0.0) : v; }
// ?dust > Paint the trouble (debug, off by default): magenta where a dust term was not a number or ran away, cyan where the vessel's own colour or alpha is not a number
vec3 dDbgPaint(vec3 c, float a) {
  if (D_dbg < 0.5) return c;
  if (D_dbg > 4.5) return dustCover.a > 0.02 ? vec3(0.0, 1.0, 0.0) : c;
  if (D_dbg > 3.5) return (a > 0.05 && max(c.r, max(c.g, c.b)) < 0.012) ? vec3(1.0, 1.0, 0.0) : c;
  if (D_dbg > 1.5 && D_dbg < 3.5 && dBad(vec4(c, a))) return vec3(0.0, 1.0, 1.0);
  if (mod(D_dbg, 2.0) > 0.5 && D_dbg < 3.5 && dustBadSeen > 0.5) return vec3(1.0, 0.0, 1.0);
  return c;
}
// the wall rule (DUST_WALL_FROM, DUST_WALL_TO): 1 inside, 0 at the ink
float dWall(float e) { return 1.0 - smoothstep(0.9, 0.96, abs(e)); }
float dKeep(float edge) { return texelFetch(routeTex, ivec2(int(edge), 33), 0).x; }
bool dEdgeOk(float edge) { return edge >= 0.0 && edge < float(textureSize(routeTex, 0).x); }   // (a fetch outside the table is undefined: garbage, or NaN, on some GPUs)
vec4 dustTubeA(DFrame F, vec3 lit, vec3 ink, float rev) {
  if (!dEdgeOk(F.edge)) return vec4(0.0);
  float keepT = dKeep(F.edge);
  if (keepT <= 0.001) return vec4(0.0);
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  vec4 hd = texelFetch(routeTex, ivec2(int(F.edge), 0), 0);
  vec2 win = dLaneWin(F);
  int K = min(int(D_nCls + 0.5), 4), N = min(int(D_win + 0.5), 9);   // (the loops' bounds are runtime numbers, GLSL ES 3.0: no compiler unrolls them into hundreds of copies)
  vec4 acc = vec4(0.0);
  for (int set = 0; set < 2; set++) {
    float wSet = set == 0 ? hd.y : 1.0 - hd.y;
    int nSeg = min(int((set == 0 ? hd.x : hd.z) + 0.5), 8);
    if (wSet < 0.002) continue;
    for (int i = 0; i < nSeg; i++) {
      DSeg g = dSeg(F.edge, 1 + 2 * i + set * 16);
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
          c = clamp(dSafe(c), 0.0, 1.0);   // (a particle that is not a number is no particle; one that is past 0 .. 1 would invert what it lies over)
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  // nothing past the lumen's edge: the dust stops short of the ink, with a soft fall (never a hard cut)
  return clamp(dSafe(acc), 0.0, 1.0) * keepT * dWall(F.across);   // (premultiplied: never past 0 .. 1, or the lumen under it would be inverted)
}
// the segment of edge edge (current layout) that carries the root's lane yl, if any: its index (-1 none) and the particle's lane there and membership
vec3 dFind(float edge, float root, float yl) {
  if (!dEdgeOk(edge)) return vec3(-1.0, 0.0, 0.0);
  vec4 hd = texelFetch(routeTex, ivec2(int(edge), 0), 0);
  int nSeg = min(int(hd.x + 0.5), 8);
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
vec4 dustSkinA(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev) {
  if (!dEdgeOk(F0.edge)) return vec4(0.0);
  if (!dEdgeOk(F1.edge)) w1 = 0.0;
  float keepS = mix(dKeep(F0.edge), w1 > 0.0 ? dKeep(F1.edge) : dKeep(F0.edge), w1);
  if (keepS <= 0.001) return vec4(0.0);
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  int K = min(int(D_nCls + 0.5), 4), N = min(int(D_win + 0.5), 9);   // (the loops' bounds are runtime numbers, GLSL ES 3.0: no compiler unrolls them into hundreds of copies)
  vec4 acc = vec4(0.0);
  for (int arm = 0; arm < 2; arm++) {
    DFrame Fa = F0, Fb = F1;
    if (arm == 1) { Fa = F1; Fb = F0; }
    float wa = arm == 0 ? 1.0 - w1 : w1, wb = 1.0 - wa;
    if (wa < 0.004 && arm == 1) break;
    vec4 hd = texelFetch(routeTex, ivec2(int(Fa.edge), 0), 0);
    int nSeg = min(int(hd.x + 0.5), 8);
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
          c = clamp(dSafe(c), 0.0, 1.0);   // (a particle that is not a number is no particle; one that is past 0 .. 1 would invert what it lies over)
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  return clamp(dSafe(acc), 0.0, 1.0) * keepS * dWall(mix(F0.across, F1.across, w1));
}
// =====================================================================================================================================================================================================================
// LOOK B, THE LANE STREAKS (Mohammad, 23 Nov: "rebuild the dust/streak"; the look A above is the lattice scan it replaces, kept switchable under ?dust). The same particles, the same route table, section frame, strip map, swirl,
// wobble, tones and wall rule (dMember, dPlace, dDraw, dWall are shared), found a different way. A pixel no longer scans a lattice of cells: the root's section is D_lanes LANES, and a lane is a one-dimensional train of streaks
// along the root's stream, up to D_trains (two) streaks trains, ONE streak at most in each cell of D_cellLen root radii, wholly inside its cell (its length is cut to what its cell holds in this vessel: a cell shortens in a slow, thin or fast-flowing branch, so the
// streak shortens with it, smoothly, and never overlaps its neighbour). So the pixel looks at the cell that holds it in each lane it can reach: a handful of candidates a segment, where the scan looked at K x (2N + 1) = 36.
//   the lane      its centre across the root's section (a hash jitters it by D_laneJit of its width), its speed the lab's flat profile at that centre, its phase a hash: all from (root, lane), nothing stored
//   the cell      u = (se - flow x speed) / Pf + phase, Pf the cell's length on the root's stream (D_cellLen x the root's radius); its streak's hashes are (cell, lane, root); D_fill x density of the cells hold one, thinned by a threshold
//                 so a density change fades single streaks in and out (nothing pops)
//   the reach     the lanes that can touch the pixel (dLaneWinB: the section seen at a slant shows more of it); a view wider than DUST_LANE_LOOK lanes takes every n-th
// =====================================================================================================================================================================================================================
// the lanes (vessel units, -1 .. 1) a pixel can reach: the section's width seen at a slant, plus a streak's own thickness
vec2 dLaneWinB(DFrame F) {
  float rm = max(D_rhoMax, 0.05), mg = 0.16;
  if (abs(F.cS.x) < 0.3) return vec2(-1.0, 1.0);
  float a = (F.across - abs(F.cS.y) * rm - mg) / F.cS.x / rm, b = (F.across + abs(F.cS.y) * rm + mg) / F.cS.x / rm;
  return vec2(min(a, b), max(a, b));
}
// the streak of lane li, in the cell of that lane which holds the pixel's place se on the root's stream (P.cf: where in its cell the streak is centred, 0 .. 1)
DPart dLanePart(DSeg g, float li, float tr, float nL, float Pf, float se, float flowFig) {
  DPart P = DPart(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, g.root, 0.5, 0.0, 0.0);
  float rk = fract(g.root * 0.6180339) * 50.0, rm = max(D_rhoMax, 0.05);
  float lid = li + 977.0 * tr;   // (a lane carries up to two trains of streaks, each its own phase and hashes, on the same centre)
  float lj = dHash(vec2(li * 1.37 + 0.5, rk + 3.1)), ph = dHash(vec2(lid * 2.17 + 7.7, rk + 11.0));
  float cy = (li + 0.5 + (lj - 0.5) * D_laneJit) / nL * 2.0 - 1.0;   // the lane's centre across the root's section (-1 .. 1)
  float rho = abs(cy) * rm;
  float prof = 1.0 + D_flat * (1.0 - 2.0 * rho * rho);                 // (the lab's flat profile: faster in the middle)
  float jj = floor((se - flowFig * prof * D_flowK) / Pf + ph);
  vec2 sd = vec2(mod(jj + lid * 131.0, 4093.0) + 0.5, lid * 7.13 + rk);
  P.alive = clamp((D_densK * D_fill - dHash(sd)) * 12.0, 0.0, 1.0);    // (a threshold: a density change fades single streaks in and out)
  if (P.alive <= 0.0) return P;                                          // (an empty cell costs the four hashes above and no more)
  P.h1 = dHash(sd + vec2(17.1, 3.7));
  P.rho = rho; P.yl = cy; P.sx = sd.x; P.sy = sd.y;
  P.cf = 0.5 + (P.h1 - 0.5) * 0.4;
  P.se = (jj - ph + P.cf) * Pf + flowFig * prof * D_flowK;
  P.prof = prof;
  return P;
}
// the rest of the streak's hashes and its depth, worked out only for a streak that is in this pixel's reach (the lane's lateral place and the cell are the cheap part above): the same numbers as before, found later
DPart dLaneFill(DPart P) {
  float rm = max(D_rhoMax, 0.05);
  vec2 sd = vec2(P.sx, P.sy);
  P.h2 = dHash(sd + vec2(5.3, 29.9)); P.h3 = dHash(sd + vec2(41.3, 11.1)); P.h4 = dHash(sd + vec2(23.7, 53.9));
  P.h5 = dHash(sd + vec2(61.3, 7.9)); P.h6 = dHash(sd + vec2(2.9, 71.7)); P.h7 = dHash(sd + vec2(37.7, 19.3));
  P.zr = (2.0 * P.h2 - 1.0) * sqrt(max(rm * rm - P.rho * P.rho, 0.0));    // (its depth in the chord at that lane)
  return P;
}
// half of the room its cell leaves it in frame F (lumen radii): the streak's length never exceeds twice this
float dCellExt(DFrame F, DSeg g, float cf) {
  float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
  return min(cf, 1.0 - cf) * max(D_cellLen * g.rLat * F.U, 1e-4) / (abs(Bs) * max(F.vRc, 1e-5));
}
// the lanes of the root that a segment carries and the pixel can reach: first index, last index, the stride and HOW MANY (at most DUST_LANE_LOOK), as whole numbers in floats. The count is a number the pixel works out, so the lane loop's bound is a
// runtime number: a loop with a constant bound (12 lanes x 2 trains) is unrolled by a driver into 24 copies of the particle's whole path in every segment of every arm, which is the size look A's comment on its own loops warns of
vec4 dLaneSpan(DSeg g, vec2 win, float nL) {
  float c1 = g.c1 < 0.0 ? min(g.c1, -1e-4) : max(g.c1, 1e-4);
  float ya = max(win.x, g.y0 - 0.05), yb = min(win.y, g.y1 + 0.05);
  if (yb < ya) return vec4(0.0, -1.0, 1.0, 0.0);
  float ra = g.c0 + c1 * ya, rb = g.c0 + c1 * yb;
  float lo = (min(ra, rb) + 1.0) * 0.5 * nL - 0.5 - 0.5 * D_laneJit - 1.0, hi = (max(ra, rb) + 1.0) * 0.5 * nL - 0.5 + 0.5 * D_laneJit + 1.0;
  float i0 = clamp(floor(lo), 0.0, nL - 1.0), i1 = clamp(ceil(hi), 0.0, nL - 1.0);
  float cnt = i1 - i0 + 1.0, stride = cnt > 12.0 ? 1.0 + floor((cnt - 1.0) / 12.0) : 1.0;
  return vec4(i0, i1, stride, cnt >= 1.0 ? min(floor((i1 - i0) / stride) + 1.0, 12.0) : 0.0);
}
vec4 dustTubeB(DFrame F, vec3 lit, vec3 ink, float rev) {
  if (!dEdgeOk(F.edge)) return vec4(0.0);
  float keepT = dKeep(F.edge);
  if (keepT <= 0.001) return vec4(0.0);
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  vec4 hd = texelFetch(routeTex, ivec2(int(F.edge), 0), 0);
  vec2 win = dLaneWinB(F);
  float nL = clamp(floor(D_lanes + 0.5), 4.0, 48.0);
  vec4 acc = vec4(0.0);
  for (int set = 0; set < 2; set++) {
    float wSet = set == 0 ? hd.y : 1.0 - hd.y;
    int nSeg = min(int((set == 0 ? hd.x : hd.z) + 0.5), 8);
    if (wSet < 0.002) continue;
    for (int i = 0; i < nSeg; i++) {
      DSeg g = dSeg(F.edge, 1 + 2 * i + set * 16);
      if (g.y1 < win.x || g.y0 > win.y) continue;
      float Pf = max(D_cellLen * g.rLat * F.U, 1e-4), flowFig = dFlow(g.root);
      float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
      float se = g.A + Bs * F.a;
      vec4 sp = dLaneSpan(g, win, nL);
      int nQ = int(sp.w + 0.5), nTr = D_trains < 1.5 ? 1 : 2;
      for (int q = 0; q < nQ; q++) {
        float ln = sp.x + float(q) * sp.z;
        for (int tr = 0; tr < nTr; tr++) {
          DPart P = dLanePart(g, ln, float(tr), nL, Pf, se, flowFig);
          if (P.alive <= 0.0) continue;
          vec2 mb = dMember(g, P.yl);
          if (mb.y <= 0.0 || !dNear(F, g, mb.x, P)) continue;
          P = dLaneFill(P);
          DMark M = dPlace(F, g, mb.x, P);
          M.len = min(M.len, max(2.0 * dCellExt(F, g, P.cf), M.dia));
          vec4 c = dDraw(M, P, t0, t1, t2, t3, ink, rev) * (mb.y * wSet);
          c = clamp(dSafe(c), 0.0, 1.0);   // (a particle that is not a number is no particle; one that is past 0 .. 1 would invert what it lies over)
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  return clamp(dSafe(acc), 0.0, 1.0) * keepT * dWall(F.across);
}
vec4 dustSkinB(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev) {
  if (!dEdgeOk(F0.edge)) return vec4(0.0);
  if (!dEdgeOk(F1.edge)) w1 = 0.0;
  float keepS = mix(dKeep(F0.edge), w1 > 0.0 ? dKeep(F1.edge) : dKeep(F0.edge), w1);
  if (keepS <= 0.001) return vec4(0.0);
  vec3 t0, t1, t2, t3; dTones(lit, t0, t1, t2, t3);
  float nL = clamp(floor(D_lanes + 0.5), 4.0, 48.0);
  vec4 acc = vec4(0.0);
  for (int arm = 0; arm < 2; arm++) {
    DFrame Fa = F0, Fb = F1;
    if (arm == 1) { Fa = F1; Fb = F0; }
    float wa = arm == 0 ? 1.0 - w1 : w1, wb = 1.0 - wa;
    if (wa < 0.004 && arm == 1) continue;
    vec4 hd = texelFetch(routeTex, ivec2(int(Fa.edge), 0), 0);
    int nSeg = min(int(hd.x + 0.5), 8);
    vec2 win = dLaneWinB(Fa);
    for (int i = 0; i < nSeg; i++) {
      DSeg g = dSeg(Fa.edge, 1 + 2 * i);
      float Pf = max(D_cellLen * g.rLat * Fa.U, 1e-4), flowFig = dFlow(g.root);
      float Bs = abs(g.B) < 0.05 ? (g.B < 0.0 ? -0.05 : 0.05) : g.B;
      float se = g.A + Bs * Fa.a;
      vec4 sp = dLaneSpan(g, win, nL);
      int nQ = int(sp.w + 0.5), nTr = D_trains < 1.5 ? 1 : 2;
      for (int q = 0; q < nQ; q++) {
        float ln = sp.x + float(q) * sp.z;
        for (int tr = 0; tr < nTr; tr++) {
          DPart P = dLanePart(g, ln, float(tr), nL, Pf, se, flowFig);
          if (P.alive <= 0.0) continue;
          vec2 ma = dMember(g, P.yl);
          if (ma.y <= 0.0) continue;
          vec3 fb = wb > 0.004 ? dFind(Fb.edge, g.root, P.yl) : vec3(-1.0, 0.0, 0.0);
          if (arm == 1 && fb.x >= 0.0) continue;   // (the first arm drew it)
          DSeg gb = dSeg(Fb.edge, 1 + 2 * int(max(fb.x, 0.0) + 0.5));
          if (!dNear(Fa, g, ma.x, P) && (fb.x < 0.0 || !dNear(Fb, gb, fb.y, P))) continue;
          P = dLaneFill(P);
          DMark M = dPlace(Fa, g, ma.x, P);
          M.len = min(M.len, max(2.0 * dCellExt(Fa, g, P.cf), M.dia));
          float sa = wa * ma.y, sb = 0.0;
          if (fb.x >= 0.0) {
            sb = wb * fb.z;
            DMark Mb = dPlace(Fb, gb, fb.y, P);
            Mb.len = min(Mb.len, max(2.0 * dCellExt(Fb, gb, P.cf), Mb.dia));
            M = dMix(M, Mb, sb / max(sa + sb, 1e-4));
          }
          vec4 c = dDraw(M, P, t0, t1, t2, t3, ink, rev) * (sa + sb);
          c = clamp(dSafe(c), 0.0, 1.0);   // (a particle that is not a number is no particle; one that is past 0 .. 1 would invert what it lies over)
          acc = c + acc * (1.0 - c.a);
        }
      }
    }
  }
  return clamp(dSafe(acc), 0.0, 1.0) * keepS * dWall(mix(F0.across, F1.across, w1));
}
// THE LOOK IS A WEIGHT (the ?dust panel's Look, eased like every setting): both looks are drawn only while the weight is between them, so switching crossfades and the settled look costs one scan
vec4 dustTube(DFrame F, vec3 lit, vec3 ink, float rev) {
  float wB = clamp(D_wLookB, 0.0, 1.0);
  vec4 a = wB < 0.999 ? dustTubeA(F, lit, ink, rev) : vec4(0.0);
  vec4 b = wB > 0.001 ? dustTubeB(F, lit, ink, rev) : vec4(0.0);
  return a * (1.0 - wB) + b * wB;
}
vec4 dustSkin(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev) {
  float wB = clamp(D_wLookB, 0.0, 1.0);
  vec4 a = wB < 0.999 ? dustSkinA(F0, F1, w1, lit, ink, rev) : vec4(0.0);
  vec4 b = wB > 0.001 ? dustSkinB(F0, F1, w1, lit, ink, rev) : vec4(0.0);
  return a * (1.0 - wB) + b * wB;
}

// (chevKeep, the lattice's keep, is in the one chevron chunk above: blood/chevron-glsl.ts)
// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
float chevCentreArc = 0.0;   // the arc (figure units) of the centre of the head the last chevOne call looked at: a skin hands a whole head to the one arm that owns its centre
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(-10.0, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  chevCentreArc = sc;
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
float lensAcrossFw = 0.0;   // fwidth of the lane position (across * 0.5 + 0.5): set by main BEFORE its first discard, because a derivative after a discard is garbage on a device that drops the lane
vec4 lensOfAt(float lensIx, float u, sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  if (mode < 0.5 || lensUse < 0.5) return vec4(0.0);
  ivec2 i0 = ivec2(int(lensIx), 0), i1 = ivec2(int(lensIx), 1);
  vec4 g0 = texelFetch(grad, i0, 0), g1 = texelFetch(grad, i1, 0);
  if (g0.a + g1.a < 0.5) return vec4(0.0);
  float t = g1.a > 1.5 ? smoothstep(0.55, 1.0, u) : u;
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
}
// the flow heads' tone on a vessel under one lens set (1 cream .. 0 dark ink): the vessel's latched, eased ink from the fifth row of the colour texture (lenses/chevron-ink.ts) where the lens runs a colour along it (la.a, a set of
// colours and not lanes), else the short eased step on the colour it is drawn in
float chevCreamOf(vec4 la, sampler2D grad, float mode, float idx, vec3 col, float raw) {
  if (la.a > 0.5 && mode < 1.5) return smoothstep(0.0, 1.0, texelFetch(grad, ivec2(int(idx), 4), 0).r);
  float rawKeep = tubeRawK;
  tubeRawK = la.a * raw;   // (this set's colour is the pressure ramp: drawn as authored, cel-glsl.ts tubeRawK)
  float cr = chevCreamSoft(celTubeBase(mix(col, la.rgb, la.a)));
  tubeRawK = rawKeep;
  return cr;
}
// the dust's frame for one vessel at this pixel (blood/dust-glsl.ts DFrame): fr the section frame (dustFrame), and the gate it shows by (the streak amount, the flow, the lumen's width), returned; rev its stream's eased reversed flag
float flowFrame(float across, vec4 fr, float s, float Lw, float rOwn, float vR, float rCss, float lensI, float dataI, float baseDv, float vUn, out DFrame F, out float rev) {
  vec4 smS = texelFetch(streamTex, ivec2(int(lensI), 0), 0);   // the blood's own distance and speed on this vessel: reversed runs back, none stands
  float nar = 1.0;
  if (useData > 0.5) { ivec2 tcn = ivec2(int(mod(dataI, vdataSize.x)), int(floor(dataI / vdataSize.x))); nar = texelFetch(vdata, tcn, 0).b / max(baseDv, 0.1); }
  F = DFrame(across, fr.xy, fr.zw, s, Lw, rOwn, vR, rCss, nar, smS.y, lensI, vUn);
  rev = smS.z;
  if (streakAmt <= 0.001 || vR <= 0.0 || abs(across) >= 0.97) return 0.0;
  // (none only where the flow is none: the particles ride the root's own distance, streams.ts texel w, through the route table, blood/routes.ts)
  return streakAmt * smoothstep(1.5, 2.1, rCss) * smoothstep(0.0, 2.0, abs(smS.y));
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
  float Pt = 130.0 * wpc;
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
  float fade = endK * flowAmt * smoothstep(1.5 * wpc, 2.1 * wpc, R) * (1.0 - smoothstep(1.0, 1.0 + acrossW, abs(across)));
  fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
  if (fade <= 0.0 || ch.x + ch.y <= 0.0) return vec4(0.0);
  float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
  // one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one. The tone is the VESSEL's own latched, eased value (lenses/chevron-ink.ts), read from the lens texture's fifth row
  float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
  float cream = mix(chevCreamOf(la, lensGradA, lensModeA, lensI, col, lensRawA), chevCreamOf(lb, lensGradB, lensModeB, lensI, col, lensRawB), lensMix);
  vec3 core = mix(mix(chevInk(cream, markDark, markLight), markRev, rk), markLight, warm);   // (the one chevron's tone: blood/chevron-glsl.ts)
  float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
  return vec4(core * ac + CHEV_RIM * ar * (1.0 - ac), ac + ar * (1.0 - ac));   // (the head's outline is always the dark ink: a flat head with a dark line, never a pale ring)
}
// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
vec4 lensOf(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  return lensOfAt(lensIndex, (vLensR.y > 0.0 ? vLensR.x + vLensR.y * vUv.x : mix(lensSpan.x, lensSpan.y, vUv.x)), grad, lanes, mode, pal, across);   // (a branch of a vessel wears the stretch of its host's ramp it leaves from: no step in colour at the branch point)
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
  float ink = min(3.0, clamp(0.3 * rCss, 1.6, 3.0) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCss))) * mix(1.0, 1.1, circT) * wpc * inkOn;
  float R = (vR + ink) * k, a = dd + ink * k;
  if (a >= R) return false;
  float q = 1.0 - a / R;
  return across * across + q * q > 1.0;
}
// the running stitch at a sewn end: the thread's coverage (x) and its halo's (y) at the distance sl in from the end and the place aa across (one rule for the tube's marks and a welded end's suture)
vec2 seamStitch(vec4 A, vec4 B, float sl, float aa, float rr, float fwAcr) {
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
  return vec2((1.0 - smoothstep(0.2, 0.36, dd)) * dsh, (1.0 - smoothstep(0.45, 0.8, dd)) * dsh);
}

uniform vec4 clotA;   // the vein's clot in this piece (disease/clot-field.ts): (f0, df, side * v, length); z 0: none, and the clot's code is never run
uniform vec4 clotP;   // its seed's lump phases
uniform vec3 clotShade;
uniform vec3 clotBase;
uniform vec3 clotLift;

#define CLOT_INSIDE 1.0
#define CLOT_WALL_SLACK_PX 1.0
#define CLOT_CAP_LEN 0.6
#define CLOT_V_FROM 0.003
#define CLOT_V_TO 0.08
#define CLOT_CAP_INK_FROM 0.0
#define CLOT_CAP_INK_TO 0.35
#define CLOT_FREE_FROM 0.1
#define CLOT_FREE_TO 0.7

// THE CLOT (disease/clot-field.ts, plan 26): coverage, distance inside the edge in device px, and the ink's free weight at a pixel. u: the share along the piece; lat: the signed lateral in lumen units (-1..1 across the lumen);
// vRf: the lumen's half width, figure units; rDev: in device px. a = (f0, df, side * v, the clot's length in figure units), p = the seed's lump phases. Pure: no derivative (they are garbage after a discard on some devices).
vec3 clotAt(vec4 a, vec2 p, float u, float lat, float vRf, float rDev) {
  float v = abs(a.z);
  float side = a.z < 0.0 ? -1.0 : 1.0;
  float f = a.x + a.y * u;
  float fc = clamp(f, 0.0, 1.0);
  float fl = 0.3 + 0.5 * v * v * v;
  float body = fl + (1.0 - fl) * sqrt(max(sin(3.14159265 * fc), 0.0));
  float lump = 1.0 + 0.08 * sin(fc * 18.85 + p.x) + 0.05 * sin(fc * 43.98 + p.y);
  float h = min(CLOT_INSIDE, CLOT_INSIDE * clamp(0.1 + 0.9 * v, 0.0, 1.0) * body * lump);
  float c = side * (CLOT_INSIDE - h) + side * (CLOT_WALL_SLACK_PX / max(rDev, 1.0));
  float along = f < 0.0 ? -f : (f > 1.0 ? f - 1.0 : 0.0);
  float dn = along * a.w / max(CLOT_CAP_LEN * vRf, 1e-6);
  float q = (lat - c) / h;
  float len = max(length(vec2(dn, q)), 1e-4);
  float F = len - 1.0;
  float gF = length(vec2(dn / (CLOT_CAP_LEN * max(rDev, 1e-3)), q / (h * max(rDev, 1e-3)))) / len;
  float distIn = -F / gF;
  float on = smoothstep(CLOT_V_FROM, CLOT_V_TO, v);
  float free = max(1.0 - smoothstep(CLOT_FREE_FROM, CLOT_FREE_TO, side * q), smoothstep(CLOT_CAP_INK_FROM, CLOT_CAP_INK_TO, dn));
  return vec3(clamp(0.5 + distIn, 0.0, 1.0) * on, distIn, free);
}

void main() {
  float streakCover = 0.0;   // (how much a streak covers this pixel: a chevron's pixel is never tinted by one)
  // THE DERIVATIVES, before any discard: a quad whose other pixels have been discarded (the cut, the dissolve, a cap, a back face) gives a garbage fwidth on a device that drops the lane (Apple's), and the flow heads, the shade band and the
  // marks of the pixels that stay came out as blocky, wrongly coloured specks along the seam rings (Mohammad, 20 Nov). So every one the body needs is taken here, in uniform control flow, and used below.
  vec3 nD = normalize(vN);
  vec3 sideD = cross(normalize(vT), normalize(vV));
  float sideDL = length(sideD);
  sideD = sideDL > 1e-4 ? sideD / sideDL : vec3(1.0, 0.0, 0.0);
  float fwSt = fwidth(dot(nD, celLightView())), fwPx = fwidth(vUv.x * vArcLen * vU), fwAw = max(fwidth(dot(nD, sideD)), 0.03);
  lensAcrossFw = fwidth(dot(nD, sideD) * 0.5 + 0.5);
  // (the stent crowns, the suture dashes and the smoke below each want one more: the across angle's, the raw across's and the smoke's own, taken here for the same reason)
  float acrossD = dot(nD, sideD), fwAcr = fwidth(acrossD), fwTh = fwidth(asin(clamp(acrossD, -0.999, 0.999)));
  float nzD = 0.0, fwNz = 0.0;
  if (smokeOn > 0.5) {   // (a uniform: every pixel takes the branch together)
    float driftD = time * 0.04;
    nzD = vnoise(vec2(vUv.x * len * 5.0 + driftD * 6.0, acrossD * 3.0 + driftD)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - driftD * 4.0, acrossD * 6.0)) * 0.35;
    fwNz = fwidth(nzD);
  }
  vec3 cBody = vec3(0.0);    // (the tube's tone before the streaks)
  if (frontOut(vUv.x, reveal)) DROP(1);
  if (fadedOut()) DROP(2);
  // a part with no map course (a fan, a strand) fades out over the first half of the Circuit's change in the same screen pattern as the dive's dissolve (circuit/shader.ts)
  if (circStay < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= circStay) DROP(3);
  if (vFade < 0.004) DROP(4);
  // past the seam the skin draws this junction. On the Circuit's map the tubes morph into flat lines and the map draws its own joins, so the cut part comes back as the skin goes (SKIN_CIRC_SPAN of the change), by the same screen pattern as circStay's; at rest it is a plain discard
  if (skinCutOn() && skinPast()) {
    float cutA = smoothstep(0.0, 0.35, circT);
    float cutH = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float weldW = skinWeldAt();
    // (a growing arm's cut end is drawn where the skin is not: the skin keeps the pixels whose pattern is under the weld, skin-object.ts setWeld, so each pixel is one or the other)
    if ((cutA <= 0.0 || cutH >= cutA) && (weldW > 0.9999 || cutH < weldW)) DROP(5);
  }
  // the map's own cut (circuit/skins.ts): past a seam of the Circuit the map's skin draws the junction, and it comes in over the end of the change as this goes (the same screen pattern again: both drawn on one pixel never)
  if (skinPastC()) {
    float keepC = 1.0 - smoothstep(0.98, 1.0, vCircShare);
    float cutHC = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), weldC = skinWeldAtC();
    // (a growing arm's cut end is drawn where the map's skin is not: the skin keeps the pixels whose pattern is under the weld, skin-object.ts setWeld, so each pixel is one or the other)
    if ((keepC <= 0.0 || cutHC >= keepC) && (weldC > 0.9999 || cutHC < weldC)) DROP(6);
  }
  vec3 n = normalize(vN);
  // (a tube seen end on has no sideways direction: a fixed one keeps the fragment finite, never a NaN, which a device draws black)
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across)) DROP(7);
  if (!gl_FrontFacing) DROP(8);
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) DROP(9);
  }

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);
  tubeRawK = mix(la.a * lensRawA, lb.a * lensRawB, lensMix);   // (the pressure ramp is authored as drawn: cel-glsl.ts tubeRawK)

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
  // (past the other tube's open end nothing of it is drawn: the ink and the drop give way over half a pixel either side of its end plane, by vNbr.z, which the GPU blends exactly where the radius ramped to 0 over a whole triangle)
  if (vNbr.y > 0.0) nbrK = smoothstep(-0.5, 0.5, (vNbr.y - abs(vNbr.x)) / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr) * mix(1.0 - circT, 1.0, nbrMap) * (1.0 - smoothstep(-0.5, 0.5, vNbr.z / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr));
  // THE CLOT'S OWN PIXELS (plan 34b): coverage and shape are computed here, before the cava opacity ramp and the fade discards, so the ramp is lifted under the clot (a thrombus is not the cava: it stays as solid as the vein's own fade, with no screen dither on its caps).
  float rDevC = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6) * dpr;
  vec3 ct = vec3(0.0);
  float covC = 0.0;
  if (clotA.z != 0.0 && dotted < 0.5) {
    float latC = tl > 1e-3 ? dot(dvPx, vec2(-tS.y, tS.x) / tl) / max(rDevC, 1e-3) : 0.0;
    ct = clotAt(clotA, clotP.xy, vUv.x, latC, vR, rDevC);
    covC = ct.x * (1.0 - smoothstep(rDevC + 0.5, rDevC + 1.5, dLat)) * (1.0 - smoothstep(0.0, 0.35, circT)) * (1.0 - nbrK);
  }
  // A VEIN INTO THE CAVA (a vessel that merges into a faded one: Mohammad, 20 Nov: "there should be a gradual fade into the target vessel, so that they both have the same fade at the point of junction") is one tube with the cava: as it nears the
  // wall it takes the cava's COLOUR (wB: 0 more than 1.6 cava radii before it, 1 at it) and eases its OPACITY down to the cava's (fadeHere: from 2.5 cava radii before the wall, by the pixel's own distance from the wall, never by a share of the vein's
  // length, so the ramp is the same across the vein's width and the wall's slant cannot make a diagonal), so at the wall both are the same colour and the same alpha and there is no step either way. It is drawn up to the wall and not inside the lumen, cut
  // along the wall's own line (cavA: a pixel wide, anti-aliased), so it opens into the cava with nothing hanging on the far side and the cava's own two tones carry on. Body and outline fade together, the vein is never a flat pale wedge.
  float cavA = 1.0, fadeHere = vFade;
  if (cavaCut > 0.5 && vNbr.y > 0.0) {
    float cd = vNbr.y - abs(vNbr.x);
    float wB = smoothstep(-1.6 * vNbr.y, 0.0, cd) * (1.0 - circT);
    float wA = smoothstep(-2.5 * vNbr.y, 0.0, cd) * (1.0 - circT);
    fadeHere = mix(vFade, cavaA, wA);
    // (cavaCut 2: a vein whose cava end a SKIN has taken over (skin/shaders.ts THE JUNCTION FADE RULE): the tube stops at its seam outside the wall, so no cut and no colour of the cava's here, but the same opacity ramp, which the skin carries on through the junction)
    if (cavaCut < 1.5) {
      vec4 la2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradA, lensLaneA, lensModeA, laneColA, across), lb2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradB, lensLaneB, lensModeB, laneColB, across);
      base = mix(base, mix(mix(color, la2.rgb, la2.a), mix(color, lb2.rgb, lb2.a), lensMix), wB);
      tubeRawK = mix(tubeRawK, mix(la2.a * lensRawA, lb2.a * lensRawB, lensMix), wB);
      float cdPx = cd / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr;
      cavA = mix(1.0 - smoothstep(-0.5, 0.5, cdPx), 1.0, circT);
    }
  }
  covC *= cavA;   // (plan 34e: a clot is never inside the cava: cut along the wall's own line with the vein, so its tone never paints over the wall's pixel of anti-aliasing)
  fadeHere = mix(fadeHere, vFade, covC);   // (plan 34b: the cava's opacity ramp is lifted in the clot's own pixels, before the dither and every fade discard: a thrombus is not the cava)
  if (cavA < 0.004) DROP(10);
#ifdef VEIL
  fadeHere *= veilK;
#elif defined(SHADOW)
  fadeHere *= max(solidK, veilK);   // (the band follows whichever copy of the vessel is showing)
#else
  fadeHere *= solidK;
#endif
#ifdef GLOW
  // THE GLOW'S MASK (glow.ts, glow-fx.ts): the picked vessel as it is drawn, in its colour as drawn, weighted by the pick's weight vHi (nothing at the vein's outer ends) and by its fades: premultiplied, painted into the mask texture
  // by max (so the pieces of a vein and the skins at its joins overlap without adding up). Only the lumen and its line: the blur makes the halo outside it.
  {
    float rCssG = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6);
    float lineG = min(3.0, clamp(0.3 * rCssG, 1.6, 3.0) * smoothstep(0.15, 1.6, rCssG) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCssG))) * mix(1.0, 1.1, circT) * inkOn;
    float sG = dLat / dpr - rCssG - lineG;   // CSS px past the line's outer edge
    float wG = (smoothstep(0.0, 1.0, vHi) * (1.0 - smoothstep(0.0, 0.15, circT))) * glowK * fadeHere * cavA * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    gl_FragColor = vec4(mix(celTubeBase(base), vec3(1.0), 0.25 * tubeDark) * wG, wG);
    return;
  }
#endif
#ifdef SHADOW
  // THE CROSSING SHADOW (cel-ink.ts SHADOW): this vessel's hull, drawn after every tube with the depth test on and no depth write: it falls only on what is behind this tube, in the look's shadow tone, over the band
  // beyond the line (shadowFeather) and not at all over this tube itself. Where an end joins another vessel it fades out over that join (shadowEndK), so a junction never gaps.
  {
    if (dotted > 0.5) discard;
    float rCssS = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6);
    float lineS = min(3.0, clamp(0.3 * rCssS, 1.6, 3.0) * smoothstep(0.15, 1.6, rCssS) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCssS))) * mix(1.0, 1.1, circT) * inkOn;
    float sS = dLat / dpr - rCssS - lineS;   // CSS px past the line's outer edge
    float bandS = smoothstep(-0.5, 0.0, sS) * (1.0 - smoothstep(0.55 * shadowPx, shadowPx, sS));
    float d0S = vUv.x * len * vU, d1S = (1.0 - vUv.x) * len * vU, rS = max(vR, 1e-6);
    float endS = (shadowEnd.x > 0.0 ? smoothstep(0.5 * shadowEnd.x * rS, shadowEnd.x * rS, d0S) : 1.0) * (shadowEnd.y > 0.0 ? smoothstep(0.5 * shadowEnd.y * rS, shadowEnd.y * rS, d1S) : 1.0);
    float aS = shadowA * bandS * endS * fadeHere * cavA;
    if (aS < 0.004) discard;
    gl_FragColor = vec4(shadowCol, aS);
    return;
  }
#endif
  if (fadeHere < 0.004) DROP(11);
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from (the surface's depth differs from it on a foreshortened tube near the camera, and the band would then start inside or outside the tube it was built for)
  // (plan 12: on a plain stretch the outer edge is the true circle of the lumen plus its line, half a pixel out as the skin's is, so the polygon's corners are gone and both sides of a seam stand on one curve)
  if (plainHere(wpc0)) {
    float rCssA = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6), rCssA0 = vR0 / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6);
    float outerPx = rDevAx + min(3.0, clamp(0.3 * rCssA, 1.6, 3.0) * smoothstep(0.15, 1.6, rCssA0) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCssA0))) * inkOn * dpr;
    if (dLat > outerPx + 0.5) DROP(13);
  }
  // (the shade band is not cut off at the other tube's wall: two tubes of a fork are one surface that blends, so the band thins and is gone by the time it reaches the other's lumen, over 0.8 of the other's radius: no ledge and no dash where the band would otherwise end)
  float nbrT = nbrK;
  if (vNbr.y > 0.0) nbrT = max(nbrK, smoothstep(-0.8, 0.0, (vNbr.y - abs(vNbr.x)) / vNbr.y) * mix(1.0 - circT, 1.0, nbrMap) * (1.0 - smoothstep(0.0, 0.8 * vNbr.y, vNbr.z)));   // (and the pull ends at the other's end plane, easing out over 0.8 of its radius past it: no pale step along the band where the other has ended)
  vec3 c = celTubeToneArt(base, mix(sT, 1.0, nbrT), fwSt * (1.0 - nbrT), rDev, 1.0 - lensUse);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, 0.080 * quietK);   // (0 for every tier but the back one)
#ifdef VDBG
  c = dbgBody(c, base, n);   // (the inspector's shade mode: debug-view.ts)
#endif
  // THE DUST (blood/dust-glsl.ts, the Dust Lab's particles, Mohammad 20 Nov) is part of the tube: painted here, in its own fragment shader, so it is inside the lumen (dustTube draws nothing past 0.96 of the half width,
  // never touching the ink) and follows the tube's own alpha and fade zones by construction: there is no second mesh to stray past a tube's end, a taper or a fade. Under the chevrons, which come after.
  float sD = vUv.x * len * vU;
  // the blind end of a divided vein's stump (between its round end and its tie, and a head's length past the tie) holds no flow: no dust, no chevron, and so none half cut off by the cap or standing past the tie (Mohammad, 22 Nov); it eases in with the cut
  float stumpMk = (stump.x > 0.0 && circT < 0.001) ? mix(1.0, smoothstep(stump.y + 2.5, stump.y + 2.5 + 1.6 * vR, sD), stump.z) : 1.0;
  // REAL FLOW (blood/routes.ts): the particles of the roots this vessel's lanes carry, in its own section, at their place on their root's stream. No fade at a skin's seam (the skin draws the same particles on); where tubes
  // still overlap at a joint with no skin they fade as the chevrons do (markK), the vessel it opens into drawing the same particles.
  vec4 fd = flowDust(across, dustFrame(vT, vZf, normalize(vV), side), sD, len * vU, max(radius * vU, 1e-3), vR, vR / max(vW * 2.0 / (res.y * projY) * vU, 1e-6), lensIndex, vindex, baseD, celTubeBase(base), vU) * markK(skinCut.x >= 0.0 ? 1e6 : sD, skinCut.y <= 1.0 ? 1e6 : (1.0 - vUv.x) * len * vU) * stumpMk;
  fd = dSafe(clamp(dSafe(fd), 0.0, 1.0) * dHold(fadeHere * cavA));   // (dSafe, on the bits: a NaN is no dust, dust-glsl.ts) (the dust follows this pixel's final alpha: dust-glsl.ts dHold; premultiplied marks are never past 0 .. 1: an alpha over 1 would invert the lumen under them, a blue one to yellow-green and a dark mark to black)
#ifdef VDBG
  if (dbgDust < 0.5) fd = vec4(0.0);
#endif
  dustCover = fd;
  cBody = c;
  streakCover = fd.a;
  c = c * (1.0 - fd.a) + fd.rgb;

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
    float nz = nzD;   // (and its derivative fwNz: taken at the top of main)
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    float nzW = max(fwNz * 0.75, 1e-3);
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), smoothstep(0.62 - amt - nzW, 0.62 - amt + nzW, nz) * 0.3);
  }

  // the flow heads, on the tube's surface as the 2D composite lays them
  float pxArc = fwPx;   // (derivatives taken at the top of main, before any discard)
  float acrossW = fwAw;
  vec4 hd = flowHeads(across, acrossW, vUv.x * len * vU, len * vU, vR, vW * 2.0 / (res.y * projY) * vU, pxArc, lensIndex, flowAmount, markK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) * stumpMk, la, lb, color, base);   // (a head stands inside the lumen, 55 percent of it, and is cut at the wall: never on the ink)
  hd = clamp(hd, 0.0, 1.0);
#ifdef VDBG
  if (dbgHeads < 0.5) hd = vec4(0.0);
#endif
  if (hd.a > 0.0) {
    if (streakCover > 0.0) c = mix(c, cBody, hd.a);   // the streaks lie UNDER the chevrons: a head's pixel is never tinted by one
    c = c * (1.0 - hd.a) + hd.rgb;
  }
  // THE CLOT (plan 26) is painted here, in the vein's own fragment: over the dust and the heads, inside the lumen (clipped at its edge, before the ink band below), lit by this pixel's own n.L, so it has the vein's depth, fades, cuts and
  // weights and looks the same from every angle. Its line is on its free edge and its caps only. A uniform branch: a vein with no clot runs none of this and is the same pixel as before.
  if (clotA.z != 0.0 && dotted < 0.5) {
    if (covC > 0.0) {
      float etC = max(0.5 * 1.0 * fwSt, 1e-4);
      vec3 toneC = mix(mix(clotShade, clotBase, smoothstep(-0.2 - etC, -0.2 + etC, sT)), clotLift, smoothstep(0.3 - etC, 0.3 + etC, sT));
      float rCssC = rDevC / dpr;
      float inkC = min(min(3.0, clamp(0.3 * rCssC, 1.6, 3.0) * smoothstep(0.15, 1.6, rCssC) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCssC))) * dpr, 0.5 * rDevC);
      vec3 lineC = mix(inkColor, clotShade * mix(0.32, 0.55, tubeDark), 0.75);
      c = mix(c, mix(toneC, lineC, ct.z * (1.0 - smoothstep(inkC - 0.5, inkC + 0.5, ct.y))), covC);
    }
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's (it is built INK wider, see the vertex stage). The exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius:
  // the line is continuous by construction (no second mesh, no stencil, no depth tie), constant in device pixels (the vertex stage widened the tube by the same line) and antialiased half a pixel each side. It follows the fade
  // (the same alpha as the body), is not drawn on a joined end's last stretch (a smooth join buries the cut) and is the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white).
  float endK = vHi > 0.001 || nbrOn > 0.5 ? 1.0 : buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU);
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * endK * inkOn;
#ifdef VDBG
  if (dbgInk < 0.5) inkT = 0.0;
#endif
  inkT *= 1.0 - nbrK;
  if (nbrK > 0.5 && dLat > rDevAx + 0.5) DROP(12);
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads (the ink outside it is lost on the ground)
  float inDepth = clamp(0.35 * rDevAx, 1.0 * dpr, 3.5 * dpr);   // (CSS px set, held in device px here: the same share of the line on every screen)
  c = mix(c, inkColorCirc, circT * 0.55 * smoothstep(rDevAx - inDepth, rDevAx, dLat) * endK * inkOn * (1.0 - nbrK));   // (not inside the other tube's lumen: the union's outline has no line there)
  if (inkT > 0.0) {
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    float rawKeep = tubeRawK;
    tubeRawK = mix(laH.a * lensRawA, lbH.a * lensRawB, lensMix);
    vec3 inkH = mix(inkColor, celTubeBase(baseH) * mix(0.32, 0.55, tubeDark), 0.75);
    tubeRawK = rawKeep;
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);   // (a selected vessel's line is its own: the glow is a separate halo, glow.ts)
  }
  const vec3 THREAD = vec3(0.953, 0.918, 0.816), THREAD_EDGE = vec3(0.145, 0.133, 0.20);   // (a pale suture and its dark edge, on every look)
  // the stent in the Circuit (the 3D device is the body's; the map draws it on the shunt's own lane, as 2D does): the bare open cells (rings of five crowns, every other one turned half a crown), the gold band where the
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
      vec2 st = seamStitch(A, B, sl, aa, rr, fwAcr);
      tw = max(tw, st.x);
      te = max(te, st.y);
    }
    c = mix(c, THREAD_EDGE, te * 0.4);
    c = mix(c, THREAD, tw);
  }
  // the tie on a divided vein's stump: a ligature of two fine turns a hair apart, leaning a little across the front of the vein (never a stripe round it), and the knot where the ends meet, in the one thread colour (THREAD, a pale suture, never orange)
  // with a faint dark edge. It lies on the pinch the tie makes (stumpK), and not past the vein's own outline.
  if (stump.z > 0.001 && circT < 0.001) {
    float aF = vUv.x * len * vU, aa = clamp(across, -1.0, 1.0), rr = max(vR, 0.3), tw = 0.0, te = 0.0;
    for (int j = 0; j < 2; j++) {
      float dd = abs(aF - (stump.y + (float(j) - 0.5) * 1.3 + 0.3 * aa));
      tw = max(tw, 1.0 - smoothstep(0.2, 0.36, dd));
      te = max(te, 1.0 - smoothstep(0.45, 0.8, dd));
    }
    float kd = length(vec2(aF - stump.y, (aa + 0.4) * rr)) / 0.7;   // (the knot: a small bead on the near side)
    tw = max(tw, 1.0 - smoothstep(0.7, 1.0, kd));
    te = max(te, 1.0 - smoothstep(1.2, 1.7, kd));
    float eK = smoothstep(1.0, 0.86, abs(aa)) * stump.z;
    c = mix(c, THREAD_EDGE, te * 0.4 * eK);
    c = mix(c, THREAD, tw * eK);
  }
  // the amber column of the wedge: everything upstream of the balloon in that vein and its branches, a tint on the tube itself that thins toward each branch's tip
  if (wedge.x > 0.001 && circT < 0.001) {
    // the distance from the balloon's distal edge at this point on this vessel (the same field the junction skins carry), against the one advancing front
    float wa = wedge.x * wedgeCover(wedgeD.x + wedgeD.y * vUv.x, vec3(wedge.y, wedgeD.z, wedgeD.w));
    wa *= mix(1.0, smoothstep(0.0, max(wedge.z, 0.001), vUv.x), wedge.w);
    c = mix(c, wedgeCol, WEDGE_A * wa * (1.0 - inkT));   // (under the outline: the vessel's line stays)
  }
#ifdef VDBG
  c = dbgEnd(c, vindex);
#endif
  c = dDbgPaint(c, fadeHere * cavA);   // (?dust, Paint the trouble: off unless asked)
  gl_FragColor = vec4(c, fadeHere * cavA);
}