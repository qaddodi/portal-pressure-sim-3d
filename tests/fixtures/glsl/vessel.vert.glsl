
const float RUN_ON_PX = 0.75;   // CSS px
attribute vec3 tang;
// a stent narrows its shunt's lumen (waist, end stenosis): the share of the tube taken off at this vertex, 0 on every vessel that has none (a missing attribute reads 0)
attribute float narrow;
attribute vec3 nbr;   // a fork's other tube: this vertex's distance from its axis, its radius there, and how far it lies past the tube's nearer end (negative inside its length), scene units (0: none; neighbour.ts)
attribute float tipK;   // a fan's free tip: the share of the alpha taken off here, 0 to 1 (a missing attribute reads 0)
attribute vec2 lensR;   // a fan's course: the stretch of the host's colour ramp it wears, (from, span) (0, 0: the vessel's own lensSpan)
attribute float rk;   // this vertex's tube radius as a share of the vessel's own (a strand is thinner than its trunk; a run-on eases to its neighbour's width)
attribute float rkc;   // the same on the Circuit's map: the course's own share only (a strand is thinner than its trunk), without the body's tapers, collars and beads, which belong to the 3D figure (the map draws a vessel one width along its length)
uniform float inflate;
uniform float frontDepth;   // how far toward the viewer this vessel is drawn in the depth buffer, scene units (the caput fan over every other vein): a depth offset only
uniform float mapDepth;   // the Circuit's over and under: how far toward the viewer this line stands on the map's plate, scene units (circuit/map-depth.ts); applied as a depth offset only, scaled by the change's share
uniform float shadowPx;   // the crossing shadow's band beyond the line, CSS px (cel-ink.ts SHADOW_PX): the SHADOW program's hull is the tube this much wider
uniform float shadowDepth;   // and how far behind its own tube it lies, scene units: on the body and on the map
uniform float shadowDepthC;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float radius;
uniform float baseD;
uniform float widthKind;
uniform float len;
uniform float stentT0;   // the map course's heading turned at the stent's start (the turn attribute there)
uniform float px;
uniform vec2 res;
// smooth joins (Settings > Figure depth): the vessel this one's start (mate0) and end (mate1) carries on into, as (its texel in the vessel data, the diameter its tube was built at, its width rule);
// x < 0 where nothing, which is every vessel with the switch off
uniform vec3 mate0;
uniform vec3 mate1;
// where each end's easing toward its mate is whole: 0 and 1 at the tube's own ends,
// the skin's cut (u) where a skin takes the tube's end and carries the same eased width on through the node
uniform vec2 mateCut;
uniform vec2 mateK;   // how far each mate counts (1: always, the tube beside it is there; a mate that is drawn on and off, the ascending lumbar vein into the azygos's start, counts as far as it is drawn)
uniform float nbrMap;   // 1 on a map-only tube (circuit/tubes.ts: a liver branch): its nbr is the host it lies in on the MAP, so the union rule holds there too; 0 on every vessel of the figure (their map joins are skins)
uniform vec4 nbrW0;   // a map-only tube's two tubes' width rules (the circW of the lane or branch each lies in): nbr.x is its distance from the first axis, nbr.y from the second (1000: none)
uniform vec4 nbrW1;
uniform vec3 nbrMate;   // the vessel nbr is measured against (a fork's other tube, the cava): its data index, the diameter it was built at, its width kind (-1: none)
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float hiOn;
uniform float hiDir;
uniform float hiOffset;
uniform float hiAhead;
uniform float hiBehind;
uniform vec2 hiEnds;   // the picked vein's distance to its outer start and outer end (materials/shaders.ts HI_NONE: no fade at that end)
uniform float hiFade;
uniform float hiPx;
uniform float inkOn;   // 0 on a dotted thread (no outline), else 1
uniform float lensUse;   // 0 on an ARTERY (it keeps its own colour), 1 on a vein: here it also says whose wall the line is built for (cel-style ARTERY)
uniform float liveW;   // a conditional tributary group's width share, 2D's 0.5 + 0.5 * live (feeders.ts): 1 for every other vessel
uniform float dpr;   // device pixels to a CSS pixel (the renderer's pixel ratio)
// the fade at a free end (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE): mode 1 runs along the vessel (uv.x), mode 2 down the figure (y), mode 3 along a line (the 2D linear mask, solid from the offset), mode 4 along a line with a dip (faintest at the offset, solid at the end); (from, to, alpha at from, alpha at to); fadeKeep 1: the Circuit does not let go of it
uniform float fadeMode;
uniform vec4 fadeA;
uniform vec2 cavaEnd;    // a hepatic vein: the share of its length at the cava end that eases to this alpha (fades.ts cavaEndSpan); 0 = none
uniform vec4 fadeLine;   // modes 3 and 4: a line across the figure, scene (x1, y1, x2, y2); fadeA is then (offset, -, alpha at the start, alpha at the end)
uniform float fadeKeep;
uniform vec3 mapFade;   // the Circuit's own fade of an artery's end: (from, to) along the map course, 1 in z if on (fades.ts MAP_ART_FADE); 0: none, the map holds every fade off
uniform vec3 stump;   // a vein divided at surgery (2D divideLen / stumpPinch): x the divided stretch's length from its start (figure units, 0: whole), y where the tie pinches it (units from the start), z the pinch's share
varying float vFade;
varying float vCircShare;   // this vertex's own share of the change (the flow peel on its rank): the map's cut takes the tube's end away as THIS point lands, not as the whole change ends
varying vec3 vNbr;
varying vec3 vCen;   // the tube's centreline point at this fragment, in clip space (x, y, w): the exact lateral distance to the axis, in device pixels, for the outline
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;
varying vec2 vLensR;
varying float vHi;

attribute vec3 cC;
attribute vec3 tC;
attribute vec3 fr;
attribute vec2 pk;
// the lengths of the vessel's two courses (body, map), scene units: the speed of each along the vessel's own 0 to 1
attribute vec2 cl;
// the map course's heading turned so far (rad, counter-clockwise, from the vessel's start): the stent's cells keep their size round a corner (vessels/shaders.ts vSkew)
attribute float turn;
uniform float circT;
// 1 on a vertex that stays where it is through the change, fading with 2D's clamp(1 - 2 * T0) (see circuitMorph), read by the fragment stage as a dither (vessels/shaders.ts)
varying float circStay;
float circShare = 0.0;   // this vertex's share of the change (the peel on its rank), kept for the width and the units the shader reads after the morph
uniform vec2 circRot;
uniform vec3 circM;
uniform float circRow;
// a liver branch growing with the change is drawn squeezed toward its own start (circFlat, 0 whole): its two courses' first points, body and map (grow.ts)
uniform float circFlat;
uniform vec3 circAnchA;
uniform vec3 circAnchC;
uniform vec2 circTrackSize;
uniform sampler2D circTrack;
const float CIRC_DL = 0.4000;
const float CIRC_MAPK = 0.006500;
const float CIRC_SPAN = 1300.0;
float circPeel(float t, float r) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  float x = (t - CIRC_DL * r) / (1.0 - CIRC_DL);
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return x * x * (3.0 - 2.0 * x);
}
// how fast the share of the change moves with the rank (peel.ts peelSlope)
float circPeelSlope(float t, float r) {
  if (t <= 0.0 || t >= 1.0) return 0.0;
  float x = (t - CIRC_DL * r) / (1.0 - CIRC_DL);
  if (x <= 0.0 || x >= 1.0) return 0.0;
  return 6.0 * x * (1.0 - x) * (-CIRC_DL / (1.0 - CIRC_DL));
}
vec3 circTurnPt(vec3 p) {
  vec2 d = p.xy - circM.xy;
  return vec3(circM.xy + vec2(circRot.x * d.x - circRot.y * d.y, circRot.y * d.x + circRot.x * d.y), p.z);
}
vec3 circTurnDir(vec3 v) { return vec3(circRot.x * v.x - circRot.y * v.y, circRot.y * v.x + circRot.x * v.y, v.z); }
vec3 circFrameN(vec3 T) {
  vec3 ref = abs(T.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  return normalize(ref - T * dot(ref, T));
}
void circuitMorph(inout vec3 P, inout vec3 Nn, inout vec3 Tn) {
  circStay = 1.0;
  if (circT <= 0.0) return;
  // A vertex with no map course (cl.y 0: the fans of tributaries, the liver's branching veins, a collateral's strands, which VesselObject gives zero course attributes: circuit/geometry.ts withCircuitAttributes) never
  // morphs: it stays on its anatomy point and fades by 2D's own clamp(1 - 2 * T0, 0, 1) (stage-vessels.js: gone by the change's half-way point, back over its second half), T0 being circT (eased as 2D's is).
  // Before, its missing course flew every vertex to the map's origin and it grew back out of a point on the way to the body.
  if (cl.y <= 0.0) { circStay = clamp(1.0 - 2.0 * circT, 0.0, 1.0); return; }
  // the body course's centre at this vertex, from the vertex's own offset (so w = 0 gives back the body's vertex exactly)
  vec3 N0 = circFrameN(tang);
  vec3 cA = position - radius * rk * (fr.x * N0 + fr.y * cross(tang, N0) + fr.z * tang);
  float w = circPeel(circT, pk.x);
  circShare = w;
  vec3 cT = circTurnPt(cC);
  vec3 cen = mix(cA, cT, w);
  if (circFlat > 0.0) { vec3 o0 = mix(circAnchA, circTurnPt(circAnchC), w); cen = o0 + (cen - o0) * (1.0 - circFlat); }
  // the direction of the moving centreline is its derivative along the vessel: (1 - w) A' + w C' + w' (C - A), the last term the flow peel's own gradient (the rank changes along the
  // vessel, so the share of the change does too); a plain blend of the two directions is up to a quarter off mid-change, this is exact (it is 'tang' and 'tC' at either end)
  float rs = (pk.x > 0.0 && pk.x < 1.0) ? cl.y * tC.x / CIRC_MAPK / CIRC_SPAN : 0.0;
  vec3 Tm = (1.0 - w) * (tang * cl.x) + w * (circTurnDir(tC) * cl.y) + circPeelSlope(circT, pk.x) * rs * (cT - cA);
  vec3 T = dot(Tm, Tm) > 1e-9 ? normalize(Tm) : tang;
  if (circRow >= 0.0) {
    float f = pk.y * (circTrackSize.x - 1.0);
    float i0 = floor(f);
    float u = f - i0;
    float i1 = min(i0 + 1.0, circTrackSize.x - 1.0);
    int row = int(circRow);
    cen += mix(texelFetch(circTrack, ivec2(int(i0), row), 0).xyz, texelFetch(circTrack, ivec2(int(i1), row), 0).xyz, u);
    vec3 Tt = mix(texelFetch(circTrack, ivec2(int(i0), row + 1), 0).xyz, texelFetch(circTrack, ivec2(int(i1), row + 1), 0).xyz, u);
    if (dot(Tt, Tt) > 1e-6) T = normalize(Tt);
  }
  vec3 N = circFrameN(T);
  vec3 B = cross(T, N);
  vec3 off = fr.x * N + fr.y * B + fr.z * T;
  P = cen + radius * mix(rk, rkc, w) * off;
  Nn = normalize(off);
  Tn = T;
}

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
uniform float circBoost;   // 2D's circBoost: the map's lines are drawn up to 1.75 times wide when it is zoomed out (stage-tubes.js)
uniform float circPerPx;   // map units under one CSS pixel here
uniform vec3 cmate0;   // the vessel this one's start and end carry on into on the MAP (circuit/mates.ts), as mate0 and mate1: x < 0 where nothing
uniform vec3 cmate1;
uniform vec2 cease;    // the half length (map units) of the taper at each of those ends
uniform vec4 circW;   // the vessel's width in the Circuit, map units: (fixed width or -1 for the engine's diameter, 1 if circBoost applies, the least width, the least width on the screen in CSS px)
// a vessel's live width against the one its tube was built at (the engine's diameter by the 2D figure's rule), as the body of main() reads it for this vessel
float swellOf(float idx, float bD, float kind) {
  if (useData < 0.5 || kind > 1.5) return 1.0;
  ivec2 tm = ivec2(int(mod(idx, vdataSize.x)), int(floor(idx / vdataSize.x)));
  float dm = texelFetch(vdata, tm, 0).b;
  float m1 = 1.3 * max(2.6, 2.0 * pow(max(dm, 0.1), 0.72)), m0 = 1.3 * max(2.6, 2.0 * pow(max(bD, 0.1), 0.72));
  if (kind > 0.5) { m1 = max(1.8, m1 * 0.5); m0 = max(1.8, m0 * 0.5); }
  return clamp(m1 / m0, 0.2, 8.0);
}
// the swell the tube has at the map's end (2D stage-tubes.js widthAt, t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) map units, an artery 3, a liver bed 8, the boost on veins and beds;
// as a share of the radius the tube was built at, so the shared morph can ease the width with the line (the map's units are MAP_K scene units, the body's 1 / 300)
// the width (map units, before the boost's floor on the screen) a vessel of this kind and diameter has on the map: a vein clamp(vesselPx(D) * 0.95, 6, 15) times the boost, an artery 3, a bed 8 times the boost (width.ts circuitWidthMap)
float circWidthOf(float d, float kind) {
  if (kind > 1.5) return 8.0 * circBoost;
  if (kind > 0.5) return 3.0;
  return clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
}
float circMateMin(vec3 m) { return m.z > 1.5 ? 4.5 : (m.z > 0.5 ? 3.0 : 5.0); }   // the least width on the screen of a mate's kind, CSS px (circuit/width.ts MIN_PX)
float circMateWidth(vec3 m) {   // a run-on mate's width on the map (m: its data index, its built diameter, its kind)
  float d = m.y;
  if (useData > 0.5) { ivec2 tc = ivec2(int(mod(m.x, vdataSize.x)), int(floor(m.x / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
  return circWidthOf(d, m.z);
}
float nbrHostR(vec4 hw) { return 0.5 * max(max(hw.z, hw.x * mix(1.0, circBoost, hw.y)), hw.w * circPerPx) * CIRC_MAPK; }   // (a map-only tube's neighbour: its radius now, scene units)
float circSwell() {
  float wc;
  if (circW.x >= 0.0) wc = max(circW.z, circW.x * mix(1.0, circBoost, circW.y));
  else {
    float d = baseD;
    if (useData > 0.5) { ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
    wc = clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
  }
  // WHERE THIS VESSEL CARRIES ON INTO ANOTHER (circuit/mates.ts: the map's own pairs) the two calibres are joined by ONE smoothstep through the node, over cease map units each way (the mean at the node): the 2D map blends a join over a fixed run, never over a share
  // of each vessel's length (that made a 6 unit step on a short stretch and a 36 unit taper on a long one, each ending flat at the node: a shoulder; Mohammad, 20 Nov: "why is this not smooth tapering?"). Both widths take the least width on the screen
  // before they are joined, so the two sides of a node agree whatever the zoom.
  wc = max(wc, circW.w * circPerPx);
  float circAt = uv.x * cl.y / CIRC_MAPK;   // map units from this vessel's start
  float circTo = (1.0 - uv.x) * cl.y / CIRC_MAPK;   // and from its end
  if (cmate0.x >= 0.0 && cease.x > 0.0) wc += (max(circMateWidth(cmate0), circMateMin(cmate0) * circPerPx) - wc) * (1.0 - smoothstep(-cease.x, cease.x, circAt));
  if (cmate1.x >= 0.0 && cease.y > 0.0) wc += (max(circMateWidth(cmate1), circMateMin(cmate1) * circPerPx) - wc) * (1.0 - smoothstep(-cease.y, cease.y, circTo));
  wc = max(wc, circW.w * circPerPx);
  return 0.5 * wc * CIRC_MAPK / max(radius, 1e-6);
}
// The stump of a divided vein: the first stump.x of it is not drawn, its end is round (a quarter circle over one radius) and it narrows a little at its tie (stage-tubes.js tubeRadius stumpPinch: 1 - 0.2 exp(-((a - tie) / 5.5)^2)).
float stumpK(float a, float R) {
  float q = clamp((a - stump.x) / max(R, 1e-3), 0.0, 1.0);
  float pq = (a - stump.y) / 3.2;
  return max(sqrt(max(0.0, 1.0 - (1.0 - q) * (1.0 - q))), 0.02) * (1.0 - 0.28 * stump.z * exp(-pq * pq));
}
void main() {

  vec3 aPos = position;
  vec3 aNor = normal;
  vec3 aTan = tang;
  circuitMorph(aPos, aNor, aTan);

  // the width follows the engine's diameter by the 2D figure's own rule (stage-tubes.js widthAt): a vein 1.3 * max(2.6, 2 d^0.72), an artery half of that (at
  // least 1.8), the liver's beds fixed; the ratio to the width the course was built at is the swell. The figure's own smallest radius is 0.35 units.
  float swell = 1.0;
  if (useData > 0.5 && widthKind < 1.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    float d = texelFetch(vdata, tc, 0).b;
    float w1 = 1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)), w0 = 1.3 * max(2.6, 2.0 * pow(max(baseD, 0.1), 0.72));
    if (widthKind > 0.5) { w1 = max(1.8, w1 * 0.5); w0 = max(1.8, w0 * 0.5); }
    swell = clamp(w1 / w0, 0.2, 8.0);
  }
  // smooth joins: where this vessel carries on into another, both ease to the mean of their two live widths over the same stretch the tube's own taper takes (tubes.ts factorAt: the first and
  // last 30 %), so the ring they share has one radius and no step or seam shows when the engine widens one of them and not the other (smooth-joins.ts joinSwell)
  if (mate0.x >= 0.0) {
    float k0 = (1.0 - smoothstep(mateCut.x, mateCut.x + 0.3, uv.x)) * (1.0 - stump.z) * mateK.x;   // (a divided vein's cut start carries on into nothing: it eases to its own width as the cut opens)
    if (k0 > 0.0) swell += k0 * (0.5 * (swell + swellOf(mate0.x, mate0.y, mate0.z)) - swell); }
  if (mate1.x >= 0.0) { float k1 = smoothstep(mateCut.y - 0.3, mateCut.y, uv.x) * mateK.y; if (k1 > 0.0) swell += k1 * (0.5 * (swell + swellOf(mate1.x, mate1.y, mate1.z)) - swell); }
  if (circShare > 0.0) swell = mix(swell, circSwell(), circShare);
  swell *= liveW;
  vCircShare = circShare;
  vU = mix(300.0, 1.0 / CIRC_MAPK, circShare);
  vArcLen = mix(len, cl.y, circShare);
  vSkew = 0.0;
  // THE STUMP'S ROUND END: the cut and one radius past it narrow as a quarter circle (stumpK), from the rings the tube has there. A divided vein is built with rings a twelfth of the usual distance apart (shape.ts tubularOf), so the quarter circle has
  // a dozen of them. (Laying the stretch's rings over the cap along each ring's own tangent was tried: on the vein's bend every ring went off its path and the end was a skewed spike; Mohammad, 22 Nov: "tied off the portal vein looks bad")
  if (stump.x > 0.0 && circShare < 0.001) swell *= stumpK(uv.x * len * vU, radius * swell * vU);
  float fa = 1.0;
  // the Circuit lets an artery's end go the same way (mapFade: from, to along the map course, on): it eases to nothing before it reaches the lane tip, never a blunt end; every other fade is off on the map
  float mapFa = mapFade.z > 0.5 ? 1.0 - smoothstep(mapFade.x, mapFade.y, uv.x) : 1.0;
  float rkE = mix(rk, rkc, circShare);   // (the tube's radius share here: on the map the course's own, not the body's tapers)
  if (fadeMode > 2.5) {
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
  if (cavaEnd.x > 0.0) fa *= mix(mix(1.0, cavaEnd.y, smoothstep(1.0 - cavaEnd.x, 1.0, uv.x)), 1.0, circT);
  fa *= 1.0 - tipK;   // (a fan's free tip eases to transparent: body and outline together)
  vFade = fa;
  // the other tube's radius is the one it is DRAWN at: its built radius times its own live swell (the engine's diameter). Its built radius put the cut and the union's outline inside the real wall wherever the engine widens it (Mohammad, 20 Nov: "a big gaping hole" at the hepatic veins' mouths)
  vNbr = vec3(nbr.x, nbr.y * (nbrMate.x >= 0.0 ? swellOf(nbrMate.x, nbrMate.y, nbrMate.z) : 1.0), nbr.z);   // (the swell is the mate's width; its end plane does not move with it)
  // (on the map a branch lies against up to two tubes of the map alone (the tube it leaves or reaches, and the sibling that leaves or reaches the same place): nbr is its distance from each axis (1000: none), and each radius is the one it is DRAWN at now, circSwell's own rule: the width before the boost's floor on the screen, times the boost where it applies, never under the least width or the least on the screen. The vertex carries how far inside the deeper one it stands)
  if (nbrMap > 0.5) {
    float r0 = nbrHostR(nbrW0), r1 = nbrHostR(nbrW1);
    float m0 = nbr.x < 100.0 ? r0 - nbr.x : -1.0, m1 = nbr.y < 100.0 ? r1 - nbr.y : -1.0;
    float rs = m0 >= m1 ? r0 : r1, ms = max(m0, m1);
    vNbr = ms > -0.5 ? vec3(rs - ms, rs, -1000.0) : vec3(0.0, 0.0, -1000.0);
  }
  // THE OUTLINE is part of the tube (no second mesh, no stencil, no depth tie): the tube is built INK wider than its lumen, and the fragment shader paints the outer ink band, so the line is continuous by construction.
  // Its width is the figure's line (cel-style.ts LINE_R, LINE_MIN, LINE_MAX; 2D's tube-cel-glsl.js CEL is 0.14, 1.5, 3): a share of the tube's radius held between two widths in CSS px (never device px: a device-px clamp drew
  // the line a third as heavy on a 3x iPhone as on a 1x screen), the same on a hairline and on the portal trunk, on a 1x Mac and a 3x iPhone; thinned with a lumen under LINE_MIN CSS px of radius (cel-ink.ts inkTaper), so the smallest branches keep their colour.
  // THE DRAWN LUMEN: the tube's half width AFTER a stenosis has pinched it (the narrow attribute, which the geometry below applies). Every width the fragment stage and the line are made from (the ink band's place, the heads' size, the dust, the
  // tones) is this one radius, so a narrowed stretch keeps its outline and its flow marks are sized to the lumen they are drawn in. They were made from the radius WITHOUT the pinch: the line was placed at the old wall, outside the pinched tube, so
  // the outline vanished through the narrowing, and the heads were built for a wide tube and spilled over a thin one (Mohammad, 20 Nov, the stenosed portal vein).
  float narrowK = 1.0 - clamp(narrow, 0.0, 0.97);
  vR = radius * rkE * swell * narrowK * vU;   // the lumen's half width in the 2D figure's units
  vR0 = radius * rkE * swell * vU;
  vec3 cenW = aPos - aNor * (radius * rkE);   // the ring's centre
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cenW, 1.0));
  vCen = vec3(cc.x, cc.y, cc.w);
  float wpcV = cc.w * 2.0 / (res.y * projectionMatrix[1][1]) * vU;   // the figure's units under one CSS px here
  float rCssV = vR / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float aU = uv.x * len;
  float distH = hiDir > 0.5 ? hiOffset + aU : (hiDir < -0.5 ? hiOffset + (len - aU) : 0.0);
  float limitH = hiDir < -0.5 ? hiBehind : hiAhead;
  float ownH = smoothstep(0.0, max(hiFade, 0.0001), min(hiEnds.x + aU, hiEnds.y + (len - aU)));   // the picked vein's own line: nothing at its two outer ends, full a fade's length in
  vHi = hiOn * (abs(hiDir) > 0.5 ? 1.0 - smoothstep(0.0, max(limitH, 0.0001), distH) : ownH);
  // the ink is held back ONLY on the part of a declared branch's end that lies inside its trunk (bury: the trunk's radius, per end): never along a vessel's own sides, never at a run-on's ring, never where vessels merely cross
  float endK = vHi > 0.001 ? 1.0 : buryK(uv.x * len * vU, (1.0 - uv.x) * len * vU);
  // (the line thins with a lumen that is hairline by NATURE, a small branch; a pinch is not one: the taper is judged on the radius the vessel would have without it, so the outline runs on through a stenosis at the figure's least weight)
  float inkPx = min(3.0, clamp(0.3 * rCssV, 1.6, 3.0) * smoothstep(0.15, 1.6, rCssV / narrowK) * (1.0 + 0.5 * (1.0 - lensUse) * smoothstep(0.15, 1.6, rCssV / narrowK)));   // CSS px
  inkPx *= mix(1.0, 1.1, circT);   // (the Circuit's line is bolder: its tubes are thick and its ground flat)
  float inkW = (inkPx * endK + hiPx * vHi) * inkOn * wpcV / vU;   // scene units
  float lumenW = radius * rkE * swell * narrowK;
  { vec2 tl = aTan.xy; float tn = length(tl); if (circShare > 0.0 && tn > 1e-5) { tl /= tn; vSkew = circShare * dot(aNor.xy, vec2(-tl.y, tl.x)) * lumenW * vU * (turn - stentT0); } }
  // (the ring is a polygon: its flats sit at the radius, its corners 0.025716863272553958 of the radius farther out, so the silhouette never falls inside the line)
  float shW = 0.0;
#ifdef SHADOW
  shW = shadowPx * wpcV / vU;   // (the crossing shadow's hull: the tube and its line, wider by the band)
#endif
  vec3 p = aPos + aNor * (inflate + radius * rkE * (swell * narrowK - 1.0) + inkW + shW + (lumenW + inkW + shW) * 0.025716863272553958);
  // where this tube carries on into another (a mate), its end ring runs on a hair (under a CSS px) into the next: two flat rings that meet exactly leave a light line between them where their edges are smoothed, along the whole of a straight join
  // (only where the tube is opaque: a faint tube (the cava at 0.45, a fading vein) drawn twice over those 1.5 px is a darker band, a faint dashed line across it at every join of its pieces; Mohammad, 20 Nov)
  float runOn = RUN_ON_PX * smoothstep(0.97, 1.0, fa);
  if (uv.x < 0.0001 && mate0.x >= 0.0) p -= aTan * (runOn * wpcV / vU);
  if (uv.x > 0.9999 && mate1.x >= 0.0) p += aTan * (runOn * wpcV / vU);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
  vV = normalize(-mv.xyz);
  vUv = uv;
  vLensR = lensR;
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, 0.15 * (1.0 - circT)) * c.w;   // depth by the tier of the axis (TUBE_DEPTH_SHARE): a fat tube at a lower tier never bulges over a thin one above it; on the Circuit's plate none at all (a flat line has no bulge: the lines' own depths, mapDepth, decide a crossing)
  // the Circuit's lines lie on one plate: each stands its own mapDepth in front of it (a depth offset, nothing moves), so a crossing has an over and an under (circuit/map-depth.ts)
  c.z -= mapDepth * circT * (-projectionMatrix[3][2]) / c.w;
  c.z -= frontDepth * (-projectionMatrix[3][2]) / c.w;
#ifdef SHADOW
  c.z += mix(shadowDepth, shadowDepthC, circT) * (-projectionMatrix[3][2]) / c.w;   // (the hull lies behind its own tube: a neighbour at the same tier is nearer, so it is never shadowed)
#endif
  vW = c.w;
  gl_Position = c;
  // a tube of no radius HERE (a strand a band has closed, a channel not yet grown; on the Circuit's map the strands of a drawn trunk, whose map share rkc is 0 while the body's rk is not) is not drawn: not even its ink or its crossing
  // shadow, which have a width of their own on screen (they drew a ragged dark seam down the sinusoid lane and the trunk to the central vein). The radius share is the one this view draws (rkE), not the body's.
  if (rkE <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}