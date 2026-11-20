// The map under and over the vessels in the Circuit: the dot grid running on past the figure and fading out in steps, the three tinted pressure zones (the pressure chart's own bands),
// and the stations' dots. Ported from the 2D GPU's mapAt (veins-gl.js) and nodeVerts (stage.js): the same numbers, drawn in the map's own units. The layer is one group that turns about
// the map's centre with the quarter turn; it fades in over the second half of the change (the 2D app: the zone bands and dots come in as the organs are gone).
import {
  CustomBlending, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, Vector2, Vector4,
} from 'three';
import { rawColor } from '../materials/cel.ts';
import { CIRCUIT_NODES, MAP_LOOKS, MAP_ZONE_X, VB_CIRC } from './data.copied.ts';
import { CIRC_C, MAP_CENTRE, MAP_K, turnAngle } from './map.ts';

/** The map's own ramp (the 2D stage's `ma`): nothing over the first half of the change, then in over the second on a smoothstep. */
export function mapRamp(t: number): number {
  if (t <= 0.5) return 0;
  if (t >= 1) return 1;
  const x = 2 * t - 1;
  return x * x * (3 - 2 * x);
}

/** How far a zone band's edge is softened along the flow, map units. */
export const BAND_SOFT = 36;
/** A band's tint, as a share of the look's own: a calm wash behind the vessels, not a block. */
export const BAND_CALM = 0.8;
/** The dot grid's share of its opacity once the map is zoomed in (a dot is 20 map units apart: it must not become a field of blobs), and the zoom (map units under a pixel) it eases over. */
export const DOT_CALM = 0.3;
export const DOT_CALM_PX: readonly [number, number] = [0.12, 0.35];
const PLATE_UNITS = 1600;   // (the grid runs on this far past the figure's box, fading out in steps)

export const PLATE_VS = /* glsl */ `
varying vec2 vW;
uniform float mapK;
uniform vec2 mapC;
void main() {
  vW = vec2(mapC.x + position.x / mapK, mapC.y - position.y / mapK);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The 2D map's fragment: mapAt of veins-gl.js, premultiplied. */
export const PLATE_FS = /* glsl */ `
const float BAND_SOFT = ${BAND_SOFT.toFixed(1)};
const float BAND_CALM = ${BAND_CALM.toFixed(2)};
const float DOT_CALM = ${DOT_CALM.toFixed(2)};
const vec2 DOT_CALM_PX = vec2(${DOT_CALM_PX[0].toFixed(2)}, ${DOT_CALM_PX[1].toFixed(2)});
uniform float mapA;
uniform vec4 mapDot;
uniform vec4 mapZone[3];
uniform vec4 mapAlt;
uniform vec4 vb;
varying vec2 vW;
vec4 overP(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }
void main() {
  vec2 w = vW;
  float pxW = max(length(vec2(dFdx(w.x), dFdy(w.x))), 1e-4);
  float e = max(max(vb.x - w.x, w.x - (vb.x + vb.z)), max(vb.y - w.y, w.y - (vb.y + vb.w)));
  float op = e <= 0.0 ? 0.9 : e <= 200.0 ? 0.7 : e <= 450.0 ? 0.5 : e <= 750.0 ? 0.3 : e <= 1100.0 ? 0.15 : e <= 1500.0 ? 0.06 : 0.0;
  vec4 c = vec4(0.0);
  if (op > 0.0) {
    float d = length(w - (floor(w / 20.0) * 20.0 + 10.0));
    float rr = max(0.9, 0.7 * pxW);
    float calm = mix(DOT_CALM, 1.0, smoothstep(DOT_CALM_PX.x, DOT_CALM_PX.y, pxW));
    float a = mapDot.a * op * calm * clamp((rr - d) / pxW + 0.5, 0.0, 1.0) * min(1.0, 0.81 / (rr * rr));
    c = vec4(mapDot.rgb * a, a);
  }
  // the tinted zones run the whole way across the map (and the plate beyond it, so the screen's sides are in them) and fade into one another and into the ground over BAND_SOFT map units
  // along the flow: a band is a wash behind the vessels, never a box with edges and margins
  float zp = clamp(min(w.x - mapAlt.x, mapAlt.y - w.x) / BAND_SOFT + 0.5, 0.0, 1.0) * mapZone[0].a * BAND_CALM;
  float zl = clamp(min(w.x - mapAlt.y, mapAlt.z - w.x) / BAND_SOFT + 0.5, 0.0, 1.0) * mapZone[1].a * BAND_CALM;
  float zh = clamp(min(w.x - mapAlt.z, mapAlt.w - w.x) / BAND_SOFT + 0.5, 0.0, 1.0) * mapZone[2].a * BAND_CALM;
  c = overP(vec4(mapZone[0].rgb * zp, zp), c);
  c = overP(vec4(mapZone[1].rgb * zl, zl), c);
  c = overP(vec4(mapZone[2].rgb * zh, zh), c);
  gl_FragColor = c * mapA;
}`;

export const DOT_VS = /* glsl */ `
attribute vec3 iPos;
attribute vec2 iRO;
uniform float mapK;
varying vec2 vLoc;
varying float vR;
varying float vOn;
void main() {
  float ext = iRO.x + 2.0;
  vLoc = position.xy * ext;
  vR = iRO.x;
  vOn = iRO.y;
  vec3 p = iPos + vec3(position.xy * ext * mapK, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

/** A station's dot: a disc in the ground's colour under a ring in the text's, 1.6 map units wide with half of it outside the radius (nodeVerts). */
export const DOT_FS = /* glsl */ `
uniform vec3 fillCol;
uniform vec3 ringCol;
uniform float mapA;
varying vec2 vLoc;
varying float vR;
varying float vOn;
void main() {
  float d = length(vLoc);
  float aa = max(fwidth(d), 1e-4);
  float fill = 1.0 - smoothstep(vR - 0.4 - aa, vR - 0.4 + aa, d);
  float ring = 1.0 - smoothstep(0.8 - aa, 0.8 + aa, abs(d - vR));
  float a = max(fill, ring) * mapA * vOn;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(mix(fillCol, ringCol, ring), a);
}`;

export const DOT_IDS: readonly string[] = Object.keys(CIRCUIT_NODES);

export class MapLayer {
  readonly group = new Group();
  private readonly plate: Mesh;
  private readonly dots: Mesh;
  private readonly plateMat: ShaderMaterial;
  private readonly dotMat: ShaderMaterial;
  private readonly on: InstancedBufferAttribute;
  private readonly onNow = new Float32Array(DOT_IDS.length);

  constructor() {
    const half = (PLATE_UNITS * 2 + Math.max(VB_CIRC[2], VB_CIRC[3])) * MAP_K / 2;
    this.plateMat = new ShaderMaterial({
      vertexShader: PLATE_VS, fragmentShader: PLATE_FS, transparent: true, depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      uniforms: {
        mapK: { value: MAP_K }, mapC: { value: new Vector2(CIRC_C[0], CIRC_C[1]) }, mapA: { value: 0 }, mapDot: { value: new Vector4() },
        mapZone: { value: [new Vector4(), new Vector4(), new Vector4()] }, mapAlt: { value: new Vector4(...MAP_ZONE_X) }, vb: { value: new Vector4(...VB_CIRC) },
      },
    });
    this.plate = new Mesh(new PlaneGeometry(half * 2, half * 2), this.plateMat);
    this.plate.position.z = -0.25;   // behind every tube's core
    this.plate.renderOrder = -2;
    this.plate.frustumCulled = false;

    const g = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(2, 2);
    g.setAttribute('position', quad.getAttribute('position'));
    g.setIndex(quad.getIndex());
    const n = DOT_IDS.length, pos = new Float32Array(n * 3), ro = new Float32Array(n * 2);
    DOT_IDS.forEach((id, i) => {
      const s = CIRCUIT_NODES[id]!;
      pos[3 * i] = (s.at[0] - CIRC_C[0]) * MAP_K; pos[3 * i + 1] = -(s.at[1] - CIRC_C[1]) * MAP_K; pos[3 * i + 2] = 0.2;
      ro[2 * i] = s.r; ro[2 * i + 1] = 0;
    });
    g.setAttribute('iPos', new InstancedBufferAttribute(pos, 3));
    this.on = new InstancedBufferAttribute(ro, 2);
    g.setAttribute('iRO', this.on);
    g.instanceCount = n;
    this.dotMat = new ShaderMaterial({
      vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { mapK: { value: MAP_K }, fillCol: { value: rawColor('#000000') }, ringCol: { value: rawColor('#ffffff') }, mapA: { value: 0 } },
    });
    this.dots = new Mesh(g, this.dotMat);
    this.dots.renderOrder = 20;
    this.dots.frustumCulled = false;
    this.group.position.set(MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z);
    this.group.add(this.plate, this.dots);
    this.group.visible = false;
  }

  /** The look's map colours: the zone bands, the dot grid, and the dots' fill (the ground) and ring (the text). */
  applyLook(look: string, text: string, ground: string): void {
    const m = MAP_LOOKS[look] ?? MAP_LOOKS.light!;
    const u = this.plateMat.uniforms as { mapDot: { value: Vector4 }; mapZone: { value: Vector4[] } };
    const rgb = (c: readonly number[]) => [c[0]! / 255, c[1]! / 255, c[2]! / 255, c[3]!] as const;
    u.mapDot.value.set(...rgb(m.dot));
    m.bands.forEach((b, i) => u.mapZone.value[i]!.set(...rgb(b)));
    // the dots and the grid are written in sRGB and drawn as they are (the cel shaders' rule: no conversion)
    rawColor(ground, this.dotMat.uniforms.fillCol!.value as never);
    rawColor(text, this.dotMat.uniforms.ringCol!.value as never);
  }

  /** The layer's opacity (mapRamp of the change) and the turn's share. Nothing is drawn at 0. */
  set(alpha: number, rr: number): void {
    this.plateMat.uniforms.mapA!.value = alpha;
    this.dotMat.uniforms.mapA!.value = alpha;
    this.group.visible = alpha > 0.001;
    this.group.rotation.z = turnAngle(rr);
  }

  /** Each station's dot fades in once a vessel is drawn at it and out with the last of them: `want(id)` says, `step` is the share of a fade this frame. Returns true while a dot moves. */
  stepDots(want: (id: string) => boolean, step: number): boolean {
    let moving = false;
    const arr = this.on.array as Float32Array;
    for (let i = 0; i < DOT_IDS.length; i++) {
      const to = want(DOT_IDS[i]!) ? 1 : 0, u = this.onNow[i]!;
      if (u === to) continue;
      const v = to > u ? Math.min(1, u + step) : Math.max(0, u - step);
      this.onNow[i] = v; arr[2 * i + 1] = v; moving = true;
    }
    if (moving) this.on.needsUpdate = true;
    return moving;
  }

  dispose(): void { this.plate.geometry.dispose(); this.dots.geometry.dispose(); this.plateMat.dispose(); this.dotMat.dispose(); }
}
