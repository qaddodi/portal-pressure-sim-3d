// The blood cells' shader: one vertex a cell, drawn as a point sprite (one draw call for every cell of the figure). Nothing is placed on the CPU: the vertex shader finds its vessel's
// place from the textures the figure already keeps on the GPU, slides along the vessel's course with the blood's own distance, and lays itself on the tube's front like the chevrons.
//
//   position (attribute)  x edge index, y phase along the course (0 to 1), z thinning order (0 to 1)
//   aB (attribute)        slots on the vessel, lateral place across the tube (-1 to 1), size jitter (0 to 1)
//   streamTex   the blood's streams (blood/streams.ts), the chevrons' own: x distance D (2D units, runs backwards when the flow is reversed, stands when there is none)
//   vdata       the engine's per-vessel texture: g the flow (mL/s), b the diameter (mm), the same texel the vessel's own shader reads
//   courseTex   CELL_SAMPLES points of every vessel's course (its row is its engine edge index), taken from the tube's own vertices
//   edgeTex     5 rows a vessel: length, radius, base diameter, design flow | width kind + 4 tone, taper, veil | fade numbers | fade line | reveal, drawn, fade mode
//   lens*       the colour lenses' textures, shared with the vessels: a cell wears the colour its vessel shows at its place
//
// Depth: a cell sits on the tube's centre line and is drawn in front of the tube's own surface by the tube's radius (along the view ray, so it does not move on screen): it is
// painted on the lumen like the chevrons, inside the silhouette, and a vessel that really lies in front still hides it.
import { CELL_SAMPLES, MAX_CELL_CSS, NO_FLOW } from './core.ts';

export const CELLS_VS = /* glsl */ `
attribute vec4 aB;
uniform sampler2D streamTex;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform sampler2D courseTex;
uniform sampler2D edgeTex;
uniform float amount;
uniform float projY;
uniform vec2 res;
uniform float dpr;
uniform vec3 colPortal;
uniform vec3 colSys;
uniform vec3 colArt;
uniform float lensMix;
uniform float lensTail;
uniform float lensModeA;
uniform float lensModeB;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
varying vec3 vFill;
varying float vA;
varying float vSize;

const int SAMPLES = ${CELL_SAMPLES};
const float MAX_CSS = ${MAX_CELL_CSS.toFixed(1)};
const float NO_FLOW = ${NO_FLOW.toFixed(2)};
#define CULL { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; vA = 0.0; vSize = 1.0; vFill = vec3(0.0); return; }

float smooth01(float x) { float t = clamp(x, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

// the colour of one lens set for the vessel e at u along it; .a says whether the lens colours it (the vessel shader's lensOf, for one point)
vec4 lensOf(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], int e, float u, float across) {
  if (mode < 0.5) return vec4(0.0);
  ivec2 i0 = ivec2(e, 0), i1 = ivec2(e, 1);
  vec4 g0 = texelFetch(grad, i0, 0), g1 = texelFetch(grad, i1, 0);
  if (g0.a + g1.a < 0.5) return vec4(0.0);
  float t = lensTail > 0.5 ? smoothstep(0.55, 1.0, u) : u;
  if (mode < 1.5) return vec4(mix(g0.rgb, g1.rgb, t), 1.0);
  vec4 c = mix(texelFetch(lanes, i0, 0), texelFetch(lanes, i1, 0), t);
  float f = across * 0.5 + 0.5, w = 0.02;
  vec3 col = pal[4];
  col = mix(col, pal[3], 1.0 - smoothstep(c.w - w, c.w + w, f));
  col = mix(col, pal[2], 1.0 - smoothstep(c.z - w, c.z + w, f));
  col = mix(col, pal[1], 1.0 - smoothstep(c.y - w, c.y + w, f));
  col = mix(col, pal[0], 1.0 - smoothstep(c.x - w, c.x + w, f));
  return vec4(col, 1.0);
}

void main() {
  int e = int(position.x + 0.5);
  vec4 r0 = texelFetch(edgeTex, ivec2(e, 0), 0);   // length (2D units), radius (scene units), base diameter, design flow
  vec4 r4 = texelFetch(edgeTex, ivec2(e, 4), 0);   // reveal, drawn, fade mode
  float Lw = r0.x;
  if (amount <= 0.001 || r4.y <= 0.001 || Lw <= 0.0) CULL

  // how many of this vessel's cells show: the flow's share of its design flow against the cell's thinning order (no flow: none)
  ivec2 tc = ivec2(int(mod(float(e), vdataSize.x)), int(floor(float(e) / vdataSize.x)));
  vec4 td = texelFetch(vdata, tc, 0);
  float q = abs(td.g);
  float show = q < NO_FLOW ? 0.0 : clamp((clamp(q / max(r0.w, 0.001), 0.0, 1.0) - position.z) * aB.x, 0.0, 1.0);
  if (show <= 0.001) CULL

  // the cell's place along the course: its phase carried by the blood's distance (forward runs on, a reversed flow runs back, none stands)
  float u = fract(position.y + texelFetch(streamTex, ivec2(e, 0), 0).x / Lw);
  if (u > r4.x) CULL
  float s = u * Lw, ee = max(10.0, 0.06 * Lw);
  float ends = smooth01(s / ee) * (1.0 - smooth01((s - (Lw - ee)) / ee));

  float f = u * float(SAMPLES - 1);
  int i0 = min(int(f), SAMPLES - 2);
  float t = f - float(i0);
  vec3 p0 = texelFetch(courseTex, ivec2(i0, e), 0).xyz, p1 = texelFetch(courseTex, ivec2(i0 + 1, e), 0).xyz;
  vec3 P = mix(p0, p1, t);

  // the tube here: its width follows the engine's diameter as the vessel's own shader does, and eases at a run-on's ends
  vec4 r1 = texelFetch(edgeTex, ivec2(e, 1), 0);   // width kind + 4 tone, taper at the start and the end, veil
  float tone = floor(r1.x / 4.0 + 0.001);
  float kind = r1.x - 4.0 * tone;
  float swell = 1.0;
  if (kind < 1.5) {
    float d = td.b;
    float w1 = 1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)), w0 = 1.3 * max(2.6, 2.0 * pow(max(r0.z, 0.1), 0.72));
    if (kind > 0.5) { w1 = max(1.8, w1 * 0.5); w0 = max(1.8, w0 * 0.5); }
    swell = clamp(w1 / w0, 0.2, 8.0);
  }
  float taper = u < 0.3 ? mix(r1.y, 1.0, smooth01(u / 0.3)) : u > 0.7 ? mix(1.0, r1.z, smooth01((u - 0.7) / 0.3)) : 1.0;
  float R = r0.y * swell * taper;

  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  float w = max(-mv.z, 1e-3);
  float cssPerWorld = projY * res.y * 0.5 / w;       // CSS px under one scene unit here
  float Rcss = R * cssPerWorld;
  float thin = smoothstep(1.5, 2.5, Rcss);
  if (thin <= 0.001) CULL
  float diaCss = max(min(0.9 * Rcss * (0.8 + 0.4 * aB.z), MAX_CSS), 2.6);

  // across the tube: a place in the width the cell fits in, in the screen plane
  vec3 Tv = mat3(modelViewMatrix) * (p1 - p0);
  vec3 side = cross(Tv, normalize(-mv.xyz));
  float sl = length(side);
  side = sl > 1e-9 ? side / sl : vec3(1.0, 0.0, 0.0);
  float span = max(0.0, 1.0 - diaCss / (2.0 * Rcss)) * 0.9;
  float lat = aB.y * span * R;
  vec3 pv = mv.xyz + side * lat;
  // in front of the tube's own surface along the view ray (it does not move on screen), so the lumen shows it and a vessel truly in front still hides it
  float k = sqrt(max(R * R - lat * lat, 0.0)) + 0.1 * R;
  pv *= 1.0 - min(k / max(length(pv), 1e-4), 0.9);
  gl_Position = projectionMatrix * vec4(pv, 1.0);
  gl_PointSize = diaCss * dpr + 2.0;
  vSize = gl_PointSize;

  // the colour the vessel shows here: its tone, or the lens over it (an artery keeps its own colour under every lens)
  vec3 base = tone < 0.5 ? colPortal : tone < 1.5 ? colSys : colArt;
  if (tone < 1.5) {
    vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, e, u, aB.y);
    vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, e, u, aB.y);
    base = mix(mix(base, la.rgb, la.a), mix(base, lb.rgb, lb.a), lensMix);
  }
  vFill = mix(base, vec3(1.0), 0.55);

  // the vessel's own fade (a tip fading in or out, a bed fading along its line), its veil behind the organs and the layer's amount
  float fa = 1.0;
  float mode = r4.z;
  if (mode > 0.5) {
    vec4 fA = texelFetch(edgeTex, ivec2(e, 2), 0);
    if (mode > 2.5) {
      vec4 fL = texelFetch(edgeTex, ivec2(e, 3), 0);
      vec2 fd = fL.zw - fL.xy;
      float fv = dot(P.xy - fL.xy, fd) / max(dot(fd, fd), 1e-9);
      if (mode > 3.5) {
        fv = clamp(fv, 0.0, 1.0);
        fa = fv < fA.x ? mix(fA.z, fA.w, smoothstep(0.0, max(fA.x, 1e-4), fv)) : mix(fA.w, 1.0, smoothstep(fA.x, 1.0, fv));
      } else {
        fa = mix(fA.z, fA.w, clamp((fv - fA.x) / max(1.0 - fA.x, 1e-4), 0.0, 1.0));
      }
    } else {
      float fs = mode < 1.5 ? u : P.y;
      float ft = clamp((fs - fA.x) / (abs(fA.y - fA.x) < 1e-5 ? 1e-5 : fA.y - fA.x), 0.0, 1.0);
      fa = mix(fA.z, fA.w, ft);
    }
  }
  vA = amount * r4.y * show * ends * fa * r1.w * thin;
}`;

export const CELLS_FS = /* glsl */ `
uniform vec3 inkCol;
uniform float inkA;
varying vec3 vFill;
varying float vA;
varying float vSize;
void main() {
  if (vA <= 0.003) discard;
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float rpx = length(q) * vSize * 0.5;
  float cr = max(vSize * 0.5 - 1.0, 0.5);
  float a = 1.0 - smoothstep(cr - 0.6, cr + 0.6, rpx);
  if (a <= 0.003) discard;
  vec2 p = q * (vSize * 0.5) / cr;
  // a cel disc: one shadow tone on the lower right (lit from the top left, as the vessels are), a faint dimple at the middle for a biconcave hint, a thin ring in the figure's ink
  float lit = dot(p, vec2(-0.70710678, -0.70710678));
  vec3 c = vFill * (1.0 - 0.16 * smoothstep(0.1, 0.55, -lit));
  c *= 1.0 - 0.09 * (1.0 - smoothstep(0.3, 0.46, length(p)));
  float ringW = clamp(0.2 * cr, 0.9, 1.7);
  float ring = smoothstep(cr - ringW - 0.5, cr - ringW + 0.5, rpx);
  c = mix(c, inkCol, ring * inkA);
  gl_FragColor = vec4(c, a * vA);
}`;
