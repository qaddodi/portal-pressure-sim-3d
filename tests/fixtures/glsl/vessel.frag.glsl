

uniform float fade;
bool fadedOut() { return fade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= fade; }
// A tube drawing on or retracting along its length (`reveal`, 0 to 1 over u): the front is a soft gradient, a tenth of the length, dissolved in the same screen pattern, never a hard cut.
bool frontOut(float u, float rv) {
  if (rv >= 0.9999) return false;
  float k = clamp((rv * 1.1 - u) / 0.1, 0.0, 1.0);
  return k < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= k;
}


uniform sampler2D tOrgCol;
uniform sampler2D tOrgDep;
uniform vec4 ovlP;   // x strength now (0: off), y gap where it starts, z gap where it is whole
uniform vec4 ovlC;   // x camera near, y camera far, z and w one over the target's size in device px
float ovlLin(float d) { return 2.0 * ovlC.x * ovlC.y / (ovlC.y + ovlC.x - (d * 2.0 - 1.0) * (ovlC.y - ovlC.x)); }
float ovlAmount(float zFrag, vec2 fragXY) {
  if (ovlP.x <= 0.0) return 0.0;
  vec2 uv = fragXY * ovlC.zw;
  float dO = textureLod(tOrgDep, uv, 0.0).r;
  if (dO >= 0.99999) return 0.0;
  float gap = ovlLin(zFrag) - ovlLin(dO);
  return ovlP.x * smoothstep(ovlP.y, ovlP.z, gap) * smoothstep(0.1, 0.45, textureLod(tOrgCol, uv, 0.0).a);
}
vec3 ovlMix(vec3 c, float v, vec2 fragXY) { return v > 0.0 ? mix(c, textureLod(tOrgCol, fragXY * ovlC.zw, 0.0).rgb, v) : c; }

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
// from the transform to the raw colour with the colours themselves and nothing pops). celTubeBase reads it, so every consumer (tone, ink, heads, glow) agrees.
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
// THE LIGHT A TUBE IS SHADED BY (CEL_STYLE.TUBE_LIGHT_MIN): the world light with its part square to the tube's axis never shorter than the floor,
// so a tube running along the light still has a lit stripe and a shade side. The argument is the tube's axis in view space (either way along it);
// a tube already past the floor gets the world light as it is. The JS twin: tubeLightFor below.
vec3 celTubeLight(vec3 a) {
  vec3 L = celLightView();
  float al = length(a);
  if (al < 1.0e-4) return L;
  vec3 u = a / al;
  float d = dot(L, u);
  vec3 lp = L - d * u;
  return d * u + lp * max(1.0, 0.6 / max(length(lp), 1.0e-3));
}


#ifdef VDBG
uniform float dbgShade;
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
uniform float stentRev;   // how far the Circuit's stent has opened along its length, 0 to 1 (stent-deploy.ts: from its start, the portal end of a TIPS, to its end)
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
// no flow marks (chevrons) inside the vessel a tube leaves or opens into: where the tube lies in its parent's lumen its marks would be drawn over the parent's own (a torn chevron at every fork). They begin a little beyond where the ink does.
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
// a vessel's colour profile along it (a stent under the velocity or a pressure lens), mixed between the two nearest of its rows; .a 0: the vessel has none
vec4 lensProfileAt(sampler2D grad, int e, float u) {
  if (texelFetch(grad, ivec2(e, 5), 0).a < 0.5) return vec4(0.0);
  float f = clamp(u, 0.0, 1.0) * float(24);
  int i = min(int(floor(f)), 23);
  vec3 a = texelFetch(grad, ivec2(e, 5 + i), 0).rgb, b = texelFetch(grad, ivec2(e, 5 + i + 1), 0).rgb;
  return vec4(mix(a, b, f - float(i)), 1.0);
}
vec4 lensOfAt(float lensIx, float u, sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  if (mode < 0.5 || lensUse < 0.5) return vec4(0.0);
  ivec2 i0 = ivec2(int(lensIx), 0), i1 = ivec2(int(lensIx), 1);
  vec4 g0 = texelFetch(grad, i0, 0), g1 = texelFetch(grad, i1, 0);
  if (g0.a + g1.a < 0.5) return vec4(0.0);
  float t = g1.a > 1.5 ? smoothstep(0.55, 1.0, u) : u;
  if (mode < 1.5) {
    // a stent's colour runs along it as its own profile (the card's graph: the fast section at the waist), not as a blend of its ends
    vec4 pr = lensProfileAt(grad, int(lensIx), u);
    if (pr.a > 0.5) return pr;
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
// the lens colour a flow HEAD is judged by (its tone, one per head): a lane lens runs its lanes across the vessel and a head spans several, so the pixel's own lane would turn one head cream on one lane and dark on the next,
// a head cut in two, its tip black on a teal lane (Mohammad, 24 Nov: chevrons hiding behind joints). The head is judged by the lane at the vessel's middle, where it stands. A ramp lens has no lanes: the pixel's own colour, as ever.
vec4 lensHeadAt(float lensIx, float u, sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], vec4 pixelLens) {
  if (mode < 1.5) return pixelLens;
  float keep = lensAcrossFw; lensAcrossFw = 0.0;
  float middle = 0.0;   // (the lane under the head's axis)
  vec4 c = lensOfAt(lensIx, u, grad, lanes, mode, pal, middle);
  lensAcrossFw = keep;
  return vec4(c.rgb, max(c.a, 0.0) * step(0.5, pixelLens.a));
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
vec4 lensHead(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], vec4 pixelLens) {
  return lensHeadAt(lensIndex, (vLensR.y > 0.0 ? vLensR.x + vLensR.y * vUv.x : mix(lensSpan.x, lensSpan.y, vUv.x)), grad, lanes, mode, pal, pixelLens);
}
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
#define CLOT_FILL_FROM 0.82
#define CLOT_FILL_TO 1.0
#define CLOT_FILL_SLACK_MAX 0.25
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
  float tf = clamp((v - CLOT_FILL_FROM) / (CLOT_FILL_TO - CLOT_FILL_FROM), 0.0, 1.0);
  float kf = tf * tf * tf;
  float fl = 0.3 + 0.5 * v * v * v;
  float body = fl + (1.0 - fl) * sqrt(max(sin(3.14159265 * fc), 0.0));
  float lump = 1.0 + (1.0 - kf) * (0.08 * sin(fc * 18.85 + p.x) + 0.05 * sin(fc * 43.98 + p.y));
  float h0 = min(CLOT_INSIDE, CLOT_INSIDE * clamp(0.1 + 0.9 * v, 0.0, 1.0) * body * lump);
  float c0 = side * (CLOT_INSIDE - h0) + side * min(CLOT_WALL_SLACK_PX / max(rDev, 1.0), h0);
  float h = h0 + (CLOT_INSIDE + min(CLOT_WALL_SLACK_PX / max(rDev, 1.0), CLOT_FILL_SLACK_MAX) - h0) * kf;
  float c = c0 * (1.0 - kf);
  float along = f < 0.0 ? -f : (f > 1.0 ? f - 1.0 : 0.0);
  float dn = along * a.w / max(CLOT_CAP_LEN * vRf, 1e-6);
  float q = (lat - c) / h;
  float len = max(length(vec2(dn, q)), 1e-4);
  float F = len - 1.0;
  float gF = length(vec2(dn / (CLOT_CAP_LEN * max(rDev, 1e-3)), q / (h * max(rDev, 1e-3)))) / len;
  float distIn = -F / gF;
  float on = smoothstep(CLOT_V_FROM, CLOT_V_TO, v);
  float free = max((1.0 - smoothstep(CLOT_FREE_FROM, CLOT_FREE_TO, side * q)) * (1.0 - kf), smoothstep(CLOT_CAP_INK_FROM, CLOT_CAP_INK_TO, dn));
  return vec3(clamp(0.5 + distIn, 0.0, 1.0) * on, distIn, free);
}

void main() {
  // THE DERIVATIVES, before any discard: a quad whose other pixels have been discarded (the cut, the dissolve, a cap, a back face) gives a garbage fwidth on a device that drops the lane (Apple's), and the flow heads, the shade band and the
  // marks of the pixels that stay came out as blocky, wrongly coloured specks along the seam rings (Mohammad, 20 Nov). So every one the body needs is taken here, in uniform control flow, and used below.
  vec3 nD = normalize(vN);
  vec3 sideD = cross(normalize(vT), normalize(vV));
  float sideDL = length(sideD);
  sideD = sideDL > 1e-4 ? sideD / sideDL : vec3(1.0, 0.0, 0.0);
  vec3 lightD = celTubeLight(vT);   // (the light this tube is shaded by: the world light, its part square to the axis never under CEL_STYLE.TUBE_LIGHT_MIN, cel-glsl.ts)
  float fwSt = fwidth(dot(nD, lightD)), fwPx = fwidth(vUv.x * vArcLen * vU), fwAw = max(fwidth(dot(nD, sideD)), 0.03);
  lensAcrossFw = fwidth(dot(nD, sideD) * 0.5 + 0.5);
  // (the stent crowns, the suture dashes and the smoke below each want one more: the across angle's, the raw across's and the smoke's own, taken here for the same reason)
  float acrossD = dot(nD, sideD), fwAcr = fwidth(acrossD), fwTh = fwidth(asin(clamp(acrossD, -0.999, 0.999)));
  float nzD = 0.0, fwNz = 0.0;
  if (smokeOn > 0.5) {   // (a uniform: every pixel takes the branch together)
    float driftD = time * 0.04;
    nzD = vnoise(vec2(vUv.x * len * 5.0 + driftD * 6.0, acrossD * 3.0 + driftD)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - driftD * 4.0, acrossD * 6.0)) * 0.35;
    fwNz = fwidth(nzD);
  }
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
  float sT = dot(n, lightD);   // n.L against the WORLD light (cel-glsl.ts celTubeLight), so the camera never changes a shade and a tube along the light still has its stripe
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
  // the blind end of a divided vein's stump (between its round end and its tie, and a head's length past the tie) holds no flow: no chevron, and so none half cut off by the cap or standing past the tie (Mohammad, 22 Nov); it eases in with the cut
  float sD = vUv.x * len * vU;
  float stumpMk = (stump.x > 0.0 && circT < 0.001) ? mix(1.0, smoothstep(stump.y + 2.5, stump.y + 2.5 + 1.6 * vR, sD), stump.z) : 1.0;

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
  // THE HEAD'S ARC ON THE SCREEN, not on the surface (25 Nov: heads bow when the tube tilts out of the screen). vUv.x is the arc of the AXIS point of this pixel's ring; the surface point sits a radius nearer the eye, so on a tilted tube its plane of constant arc
  // meets the screen along a curve (a head's back edge bowed by R x tan(tilt)). The head is placed by the pixel's offset from the axis point ALONG THE TUBE'S SCREEN HEADING over the heading's foreshortening (|vT.xy|): a straight line square to the lateral. Untilted
  // (|vT.xy| = 1, no depth offset) it is exactly vUv.x's arc. A tube nearly end-on has no heading to speak of: its heads fade out as the heading's screen length falls under HEAD_ENDON.
  float hxy = clamp(tl, 0.25, 1.0);
  float sHead = vUv.x * len * vU + (tl > 1e-3 ? dot(dvPx, tS / tl) : 0.0) / dpr * vCen.z * 2.0 / (res.y * projY) * vU / hxy;
  float endOn = smoothstep(0.12, 0.3, tl);
  vec4 hd = flowHeads(across, acrossW, sHead, len * vU, vR, vW * 2.0 / (res.y * projY) * vU, pxArc, lensIndex, flowAmount, markK(skinCut.x >= 0.0 ? 1e6 : vUv.x * len * vU, skinCut.y <= 1.0 ? 1e6 : (1.0 - vUv.x) * len * vU) * stumpMk * endOn, lensHead(lensGradA, lensLaneA, lensModeA, laneColA, la), lensHead(lensGradB, lensLaneB, lensModeB, laneColB, lb), color, base);   // (a head stands inside the lumen, 55 percent of it, and is cut at the wall: never on the ink)
  hd = clamp(hd, 0.0, 1.0);
#ifdef VDBG
  if (dbgHeads < 0.5) hd = vec4(0.0);
#endif
  if (hd.a > 0.0) {
    c = c * (1.0 - hd.a) + hd.rgb;
  }
  // THE CLOT (plan 26) is painted here, in the vein's own fragment: over the heads, inside the lumen (clipped at its edge, before the ink band below), lit by this pixel's own n.L, so it has the vein's depth, fades, cuts and
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
    // (it opens as a front from the stent's start to its end, as the 3D stent does: stent-deploy.ts)
    kS *= stentRev >= 0.9999 ? 1.0 : 1.0 - smoothstep(stentRev - 0.03, stentRev, (vUv.x - stentU.y) / max(stentU.z - stentU.y, 1e-4));
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
  // THE ORGAN VEIL (organ-veil/config.ts): where an organ lies in front of this pixel the vessel is taken toward the organ's own colour there (its shading and nodules), by how deep behind the organ's surface it is; the same function of the pixel
  // in the tube, its junction skin and the cells, so nothing steps at a junction. A picked vessel (vHi) and the Circuit's map (circT) are left whole. The vessel stays one opaque draw.
  c = ovlMix(c, ovlAmount(gl_FragCoord.z, gl_FragCoord.xy) * (1.0 - circT) * (1.0 - clamp(vHi, 0.0, 1.0)), gl_FragCoord.xy);
  gl_FragColor = vec4(c, fadeHere * cavA);
}