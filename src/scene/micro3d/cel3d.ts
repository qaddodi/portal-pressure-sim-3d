// The one material of the true-3D lobule and sinusoid (Settings > Figure depth > 3D lobule and sinusoid): solid shapes in the figure's cel style. EXACTLY TWO flat tones (the base and the shade, one hard but
// antialiased edge at CEL_STYLE.VESSEL_STEP_AT: the same two tones as the vessels), matte: no lit tone toward white, no gloss, no rim, no gradient. The light is THE WORLD light (CEL_STYLE.LIGHT): n.L is taken with the
// normal in world axes (the model matrix), so orbiting, zooming or tilting the camera never changes a shade; only a shape's own motion does. A bold ink round every shape (an inverted hull pushed out a fixed number
// of CSS px on screen, as the figure's other inks). Colours are raw sRGB numbers, as every cel shader of the app writes them.
//
// A part's colour is its `tint` times its vertex colours (when the geometry has them) times its instance colours (an InstancedMesh with setColorAt). Instances may be scaled
// unevenly: the normal is carried through the instance matrix's inverse transpose, so a squashed sphere still shades as a squashed sphere.
//
//   const m = microMaterials(shared, fade, { tint: [r, g, b], ink: [r, g, b], px: 1.25 });
//   const part = microPart(geometry, m);                group.add(part.group)
//   const many = microInstanced(geometry, m, count);    many.toon.setMatrixAt(i, m4); many.ink.setMatrixAt(i, m4) (or `many.setAt(i, m4, colour)`)
import {
  BackSide, BufferAttribute, BufferGeometry, Color, FrontSide, Group, InstancedMesh, LinearSRGBColorSpace, Matrix4, Mesh, ShaderMaterial, type Vector2, Vector4,
} from 'three';
import { CEL_STYLE } from '../cel-style.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { CEL_LIGHT_UNIT } from '../cel-glsl.ts';

const F = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const L = CEL_LIGHT_UNIT;

export const MICRO_VS = /* glsl */ `
uniform float inflate;
varying vec3 vN;
varying vec3 vC;
varying float vHy;
#ifdef STREAKS
attribute float aux;
varying vec3 vP;
varying float vAux;
#endif
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix);
  vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  n = im * (n / max(s2, vec3(1e-12)));
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
#endif
  vC = vec3(1.0);
#ifdef USE_COLOR
  vC *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  vC *= instanceColor;
#endif
  vN = normalize(mat3(modelMatrix) * n);   // the normal in WORLD axes: the light is fixed in the world, not on the screen
  vHy = p.y;
#ifdef STREAKS
  vP = p; vAux = aux;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + normal * inflate, 1.0);
}`;

export const MICRO_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 tint;
uniform float opacity;
varying vec3 vN;
varying vec3 vC;
// the haze: what lies away from the scene's subject (|y| past uHaze.x, whole by uHaze.y, local units) melts toward uHazeCol by up to uHaze.z, its detail and line with it, as a lens's
// depth of field would soften it (the next sinusoids, their Disse and plates must not pull the eye from the one in focus, Mohammad 20 Nov 2026); uHaze.z 0: none
uniform vec4 uHaze;
uniform vec3 uHazeCol;
varying float vHy;
float hazeK() { return uHaze.z * smoothstep(uHaze.x, uHaze.y, abs(vHy)); }
#ifdef STREAKS
// streaks in a stream (the blood in a lumen, the lymph in Disse), fixed to the tissue (µm along x) and carried by the flow: lanes across the stream (aux: -1 .. 1 across it),
// each with its own phase and length, the middle lanes fastest (2D's lanes: 1.5 (1 - a^2) + 0.08); one hard-edged lighter tone, never a gradient
uniform float uFlow;      // how far the stream has run (µm)
uniform float uHalf;      // the stream's half width (µm): the lanes' pitch is across it
uniform float uStreak;    // how strong the streaks are (0 none)
uniform float uProfile;   // 1: the parabolic lanes of the blood; 0: one speed; under 0: chevrons across the stream (the lymph), pointing the way it runs
uniform vec3 uStreakCol;  // the streaks' one tone
varying vec3 vP;
varying float vAux;
float h11(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
// one lane's streak at this pixel (1 inside, 0 out): long and slim, round at both ends, its edge antialiased over a pixel
float streaks() {
  float lanes = max(2.0, floor(uHalf * 2.0 / 0.9));
  float u = (vAux * 0.5 + 0.5) * lanes, lane = floor(u), fu = fract(u);
  float a = (lane + 0.5) / lanes * 2.0 - 1.0;
  float sp = mix(1.0, 1.5 * (1.0 - a * a) + 0.08, uProfile);
  float period = 34.0 + 26.0 * h11(lane * 3.1), len = 14.0 + 16.0 * h11(lane * 7.7 + 1.3);
  float t = mod(vP.x - uFlow * sp + period * h11(lane * 1.7 + 9.1), period);
  float q = clamp(t / len * 2.0 - 1.0, -1.0, 1.0);
  float hw = 0.3 * sqrt(max(0.0, 1.0 - q * q)) * step(t, len);
  float d = abs(fu - 0.5) - hw, w = max(fwidth(u), 1e-3);
  return (1.0 - smoothstep(-w, w, d)) * step(0.3, h11(lane * 5.3 + 2.0));
}
// a chevron every 6 µm across the whole stream, its point leading the way the stream runs (the flow's sign), quiet and hard-edged
float chevrons() {
  float a = abs(vAux), dir = uFlow >= 0.0 ? 1.0 : -1.0, pitch = 6.0, w = 1.1;
  float f = mod((vP.x - uFlow) * dir + a * 1.4, pitch), wx = max(fwidth(vP.x) * 1.2, 1e-3);
  return smoothstep(0.0, wx, f) * (1.0 - smoothstep(w - wx, w, f)) * (1.0 - smoothstep(0.82, 0.95, a));
}
#endif
void main() {
  if (fadedOut()) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  // the world light (CEL_STYLE.LIGHT): n.L with n in world axes. TWO tones: the base, and the shade below the step
  float s = dot(n, vec3(${F(L[0])}, ${F(L[1])}, ${F(L[2])}));
  float w = max(fwidth(s) * 0.75, 1e-3);
  float shadeT = 1.0 - smoothstep(${F(CEL_STYLE.VESSEL_STEP_AT)} - w, ${F(CEL_STYLE.VESSEL_STEP_AT)} + w, s);
  vec3 c = tint * vC;
  c *= 1.0 - ${F(CEL_STYLE.MICRO.SHADE)} * shadeT;
#ifdef STREAKS
  c = mix(c, uStreakCol, uStreak * (uProfile < 0.0 ? chevrons() : streaks()));
#endif
  c = mix(c, uHazeCol, hazeK());
  gl_FragColor = vec4(c * opacity, opacity);
}`;

export const MICRO_INK_VS = /* glsl */ `
uniform float px;
uniform vec2 res;
varying float vHy;
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix);
  vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  n = im * (n / max(s2, vec3(1e-12)));
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
#endif
  vHy = p.y;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vec3 vn = normalize(normalMatrix * n);
  vec2 nd = (projectionMatrix * vec4(vn, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-6 ? nd / l : vec2(0.0);
  // only a normal that faces sideways on screen pushes the line out: a face toward the viewer (a tile's top, the inner ring of a bevel) stays put, so the hull never folds
  // over the face and draws creases across it
  c.xy += nd * px * smoothstep(0.2, 0.6, length(vn.xy)) * 2.0 / res * c.w;
  gl_Position = c;
}`;

export const MICRO_INK_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 color;
uniform float opacity;
// the haze: what lies away from the scene's subject (|y| past uHaze.x, whole by uHaze.y, local units) melts toward uHazeCol by up to uHaze.z, its detail and line with it, as a lens's
// depth of field would soften it (the next sinusoids, their Disse and plates must not pull the eye from the one in focus, Mohammad 20 Nov 2026); uHaze.z 0: none
uniform vec4 uHaze;
uniform vec3 uHazeCol;
varying float vHy;
float hazeK() { return uHaze.z * smoothstep(uHaze.x, uHaze.y, abs(vHy)); }
void main() { if (fadedOut()) discard; gl_FragColor = vec4(mix(color, uHazeCol, hazeK()) * opacity, opacity); }`;

export type RGB = readonly [number, number, number] | readonly number[];

/** A part's two materials: its toon pass and its ink. */
export interface MicroMats { toon: ShaderMaterial; ink: ShaderMaterial | null }
export interface MicroOptions {
  tint?: RGB; ink?: RGB | null; px?: number;
  /** The geometry carries a `color` attribute (vertex colours). */
  vertexColors?: boolean;
  /** Streaks carried by a flow (the geometry has an `aux` attribute: the place across the stream, -1 to 1): set uFlow, uHalf, uStreak, uProfile, uStreakCol. */
  streaks?: boolean;
  /** The haze's uniforms, shared by every part of a scene (hazeUniforms()); none by default. */
  haze?: HazeUniforms;
  /** Draw both sides (a thin sheet seen from either side). */
  doubleSide?: boolean;
  /** Drawn see-through (opacity below 1): sorted after the solid parts, no depth written. */
  transparent?: boolean;
}

/** Sets a three Color from raw sRGB numbers (no conversion: the shaders write them as they are). */
export const rawRGB = (c: Color, rgb: RGB): Color => c.setRGB(rgb[0]!, rgb[1]!, rgb[2]!, LinearSRGBColorSpace);

/** The toon and ink materials of a part. `fade` is the view's one dissolve uniform (the dive). */
/** A scene's haze uniforms (see MICRO_FS): x where it starts and y where it is whole (|y|, local units), z how far toward the colour; w unused. */
export interface HazeUniforms { uHaze: { value: Vector4 }; uHazeCol: { value: Color } }
export const hazeUniforms = (): HazeUniforms => ({ uHaze: { value: new Vector4(1e9, 2e9, 0, 0) }, uHazeCol: { value: new Color() } });

export function microMaterials(res: { value: Vector2 }, fade: { value: number }, o: MicroOptions = {}): MicroMats {
  const haze = o.haze ?? hazeUniforms();
  const toon = new ShaderMaterial({
    vertexShader: MICRO_VS, fragmentShader: MICRO_FS, vertexColors: !!o.vertexColors,
    ...(o.streaks ? { defines: { STREAKS: '' } } : {}),
    uniforms: {
      tint: { value: rawRGB(new Color(), o.tint ?? [1, 1, 1]) }, opacity: { value: 1 }, inflate: { value: 0 }, fade,
      // (every toon carries the streaks' uniforms, so a program read without its define still finds each one it declares)
      uFlow: { value: 0 }, uHalf: { value: 5 }, uStreak: { value: 0.3 }, uProfile: { value: 1 }, uStreakCol: { value: new Color(1, 1, 1) },
      uHaze: haze.uHaze, uHazeCol: haze.uHazeCol,
    },
    side: o.doubleSide ? 2 : FrontSide, transparent: !!o.transparent, depthWrite: !o.transparent,
  });
  const ink = o.ink === null ? null : new ShaderMaterial({
    vertexShader: MICRO_INK_VS, fragmentShader: MICRO_INK_FS,
    uniforms: { color: { value: rawRGB(new Color(), o.ink ?? [0.1, 0.08, 0.1]) }, opacity: toon.uniforms.opacity!, px: { value: o.px ?? CEL_STYLE.MICRO.LINE }, res, fade, uHaze: haze.uHaze, uHazeCol: haze.uHazeCol },
    side: BackSide, transparent: !!o.transparent, depthWrite: !o.transparent,
  });
  return { toon, ink };
}

/** One shape drawn with its ink behind it. */
export class MicroPart {
  readonly group = new Group();
  readonly toonMesh: Mesh;
  readonly inkMesh: Mesh | null;
  readonly geometry: BufferGeometry;
  readonly mats: MicroMats;
  constructor(geometry: BufferGeometry, mats: MicroMats, name = 'micro') {
    this.geometry = geometry; this.mats = mats;
    this.toonMesh = new Mesh(geometry, mats.toon);
    this.inkMesh = mats.ink ? new Mesh(geometry, mats.ink) : null;
    this.toonMesh.name = name; if (this.inkMesh) this.inkMesh.name = `${name}/ink`;
    for (const m of [this.toonMesh, this.inkMesh]) if (m) { m.frustumCulled = false; this.group.add(m); }
  }
  setTint(rgb: RGB): void { rawRGB(this.mats.toon.uniforms.tint!.value as Color, rgb); }
  setInk(rgb: RGB): void { if (this.mats.ink) rawRGB(this.mats.ink.uniforms.color!.value as Color, rgb); }
  setOpacity(a: number): void { this.mats.toon.uniforms.opacity!.value = a; this.group.visible = a > 0.002; }
  /** A streaked part's flow (µm run), the stream's half width (µm), the streaks' tone and strength and whether the lanes have the blood's profile. */
  setStreaks(flow: number, half: number, rgb: RGB, strength: number, profile: number): void {
    const u = this.mats.toon.uniforms;
    u.uFlow.value = flow % 1e6; u.uHalf!.value = half; u.uStreak!.value = strength; u.uProfile!.value = profile; rawRGB(u.uStreakCol!.value as Color, rgb);
  }
  set renderOrder(o: number) { this.toonMesh.renderOrder = o; if (this.inkMesh) this.inkMesh.renderOrder = o; }
  dispose(): void { this.geometry.dispose(); this.mats.toon.dispose(); this.mats.ink?.dispose(); }
}

/** Many copies of one shape (cells, pores, albumin): the toon and the ink are two instanced meshes that share the matrices and colours. */
export class MicroMany {
  readonly group = new Group();
  readonly toon: InstancedMesh;
  readonly ink: InstancedMesh | null;
  private readonly col = new Color();
  readonly geometry: BufferGeometry;
  readonly mats: MicroMats;
  readonly capacity: number;
  constructor(geometry: BufferGeometry, mats: MicroMats, capacity: number, name = 'micro-many') {
    this.geometry = geometry; this.mats = mats; this.capacity = capacity;
    this.toon = new InstancedMesh(geometry, mats.toon, capacity);
    this.ink = mats.ink ? new InstancedMesh(geometry, mats.ink, capacity) : null;
    this.toon.name = name; if (this.ink) this.ink.name = `${name}/ink`;
    for (const m of [this.toon, this.ink]) if (m) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
  }
  /** Writes copy i (its matrix and, when given, its colour); call `commit(n)` once all are written. */
  setAt(i: number, m: Matrix4, rgb?: RGB): void {
    this.toon.setMatrixAt(i, m); this.ink?.setMatrixAt(i, m);
    if (rgb) this.toon.setColorAt(i, rawRGB(this.col, rgb));
  }
  commit(n: number): void {
    const c = Math.min(n, this.capacity);
    this.toon.count = c; this.toon.instanceMatrix.needsUpdate = true; if (this.toon.instanceColor) this.toon.instanceColor.needsUpdate = true;
    if (this.ink) { this.ink.count = c; this.ink.instanceMatrix.needsUpdate = true; }
    this.group.visible = c > 0;
  }
  setTint(rgb: RGB): void { rawRGB(this.mats.toon.uniforms.tint!.value as Color, rgb); }
  setInk(rgb: RGB): void { if (this.mats.ink) rawRGB(this.mats.ink.uniforms.color!.value as Color, rgb); }
  set renderOrder(o: number) { this.toon.renderOrder = o; if (this.ink) this.ink.renderOrder = o; }
  dispose(): void { this.geometry.dispose(); this.mats.toon.dispose(); this.mats.ink?.dispose(); this.toon.dispose(); this.ink?.dispose(); }
}

// ---- geometry ----------------------------------------------------------------------------------------------------------------------

/** A growing indexed mesh: positions, normals, optional colours. */
export class MeshBuilder {
  p: number[] = []; n: number[] = []; c: number[] = []; idx: number[] = [];
  /** One number per vertex for a shader's own use (`aux`): push it right after each v(), for every vertex or none. */
  aux: number[] = [];
  get count(): number { return this.p.length / 3; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, col?: RGB): number {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l);
    if (col) this.c.push(col[0]!, col[1]!, col[2]!);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
  /** A strip between two rows of the same length (row a then row b, counter-clockwise seen from the front when a runs left to right below b). */
  strip(a0: number, b0: number, len: number, closed = false): void {
    const m = closed ? len : len - 1;
    for (let i = 0; i < m; i++) { const i1 = (i + 1) % len; this.quad(a0 + i, a0 + i1, b0 + i1, b0 + i); }
  }
  build(into?: BufferGeometry): BufferGeometry {
    const g = into ?? new BufferGeometry();
    this.orient();
    const set = (name: string, arr: number[], k: number) => {
      const old = g.getAttribute(name) as BufferAttribute | undefined;
      if (old && old.array.length === arr.length) { (old.array as Float32Array).set(arr); old.needsUpdate = true; } else g.setAttribute(name, new BufferAttribute(new Float32Array(arr), k));
    };
    set('position', this.p, 3); set('normal', this.n, 3);
    if (this.c.length) set('color', this.c, 3);
    if (this.aux.length) set('aux', this.aux, 1);
    const ix = g.getIndex();
    if (ix && ix.array.length === this.idx.length) { (ix.array as Uint32Array).set(this.idx); ix.needsUpdate = true; } else g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
  /** Every triangle wound to face the way its vertices' normals do. A triangle wound against its normals is culled by its toon (front faces only) and drawn by its ink (back faces),
   *  so it shows as a hole of ink colour: the dark red cells (a lathe wound inside out) and the X across every hepatocyte (the top's fan folding where the inset ring crosses itself at a
   *  rounded corner), 20 Nov 2026. Turning each one here fixes every shape built, whatever builds it. */
  private orient(): void {
    const p = this.p, n = this.n, ix = this.idx;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
      const e1x = p[b]! - p[a]!, e1y = p[b + 1]! - p[a + 1]!, e1z = p[b + 2]! - p[a + 2]!;
      const e2x = p[c]! - p[a]!, e2y = p[c + 1]! - p[a + 1]!, e2z = p[c + 2]! - p[a + 2]!;
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const d = fx * (n[a]! + n[b]! + n[c]!) + fy * (n[a + 1]! + n[b + 1]! + n[c + 1]!) + fz * (n[a + 2]! + n[b + 2]! + n[c + 2]!);
      if (d < 0) { const k = ix[t + 1]!; ix[t + 1] = ix[t + 2]!; ix[t + 2] = k; }
    }
  }
}

export type P2 = [number, number];

/** The outward unit normal of a closed, counter-clockwise outline at each point (the average of its two edges'). */
export function outlineNormals(pts: readonly P2[]): P2[] {
  const n = pts.length, out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!, b = pts[i]!, c = pts[(i + 1) % n]!;
    let ex = c[0] - a[0], ey = c[1] - a[1];
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    out.push([ey, -ex]);   // (counter-clockwise: the outside is to the right of the way round)
  }
  return out;
}

/** Signed area (positive: counter-clockwise). */
export const areaOf = (pts: readonly P2[]): number => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Corners rounded off a closed outline by Chaikin's cut, `iter` times. */
export function chaikin(pts: readonly P2[], iter = 2, k = 0.25): P2[] {
  let cur = pts.slice() as P2[];
  for (let t = 0; t < iter; t++) {
    const nxt: P2[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]!, b = cur[(i + 1) % cur.length]!;
      nxt.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], [a[0] + (b[0] - a[0]) * (1 - k), a[1] + (b[1] - a[1]) * (1 - k)]);
    }
    cur = nxt;
  }
  return cur;
}

/** A pillow: a closed outline (counter-clockwise, star-shaped about its centroid) raised into a slab with a flat top at `zTop`, a rounded bevel `bevel` wide and a wall down to `zBot`.
 *  The bevel's normals turn smoothly from up to out, so its tones fall in clean bands (lit on the upper left, shade on the lower right) and the ink runs round the outline. */
export function pillow(b: MeshBuilder, outline: readonly P2[], zTop: number, zBot: number, bevel: number, col?: RGB, rings = 4, centre?: P2): void {
  let pts = outline as P2[];
  if (areaOf(pts) < 0) pts = pts.slice().reverse();
  const nrm = outlineNormals(pts), n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  if (centre) { cx = centre[0]; cy = centre[1]; }   // (a shape not star-shaped about its centroid, an arrow, gives a point it is)
  // the inset ring the bevel starts from (never past the centre)
  const inset = pts.map((p, i) => {
    const d = Math.hypot(p[0] - cx, p[1] - cy), k = Math.min(bevel, d * 0.7);
    return [p[0] - nrm[i]![0] * k, p[1] - nrm[i]![1] * k, k] as const;
  });
  const c0 = b.v(cx, cy, zTop, 0, 0, 1, col);
  const rows: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI / 2, s = Math.sin(phi), cphi = Math.cos(phi);
    rows.push(b.count);
    for (let i = 0; i < n; i++) {
      const q = inset[i]!, k = q[2];
      b.v(q[0] + nrm[i]![0] * k * s, q[1] + nrm[i]![1] * k * s, zTop - k + k * cphi, nrm[i]![0] * s, nrm[i]![1] * s, cphi, col);
    }
  }
  // the wall
  const w0 = b.count;
  for (let i = 0; i < n; i++) b.v(pts[i]![0], pts[i]![1], zBot, nrm[i]![0], nrm[i]![1], 0, col);
  for (let i = 0; i < n; i++) b.tri(c0, rows[0]! + i, rows[0]! + ((i + 1) % n));
  for (let r = 0; r < rings; r++) b.strip(rows[r + 1]!, rows[r]!, n, true);
  b.strip(w0, rows[rings]!, n, true);
}

/** An ellipsoid (a sphere scaled by rx, ry, rz) at (x, y, z), its own axes turned by `a` about z. */
export function ellipsoid(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number, a = 0, col?: RGB, seg = 18, rings = 10): void {
  const ca = Math.cos(a), sa = Math.sin(a), base = b.count;
  for (let r = 0; r <= rings; r++) {
    const th = (r / rings) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
      const ux = st * cp, uy = st * sp, uz = ct;
      const lx = ux * rx, ly = uy * ry, nx = ux / rx, ny = uy / ry;
      b.v(x + lx * ca - ly * sa, y + lx * sa + ly * ca, z + uz * rz, nx * ca - ny * sa, nx * sa + ny * ca, uz / rz, col);
    }
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < seg; i++) {
    const a0 = base + r * (seg + 1) + i, b0 = a0 + seg + 1;
    b.quad(a0, b0, b0 + 1, a0 + 1);
  }
}

/** A round tube along a path (x, y, z points) with a radius per point and round ends, its normals smooth round the tube. */
export function tube(b: MeshBuilder, path: readonly (readonly [number, number, number])[], radius: (i: number) => number, col?: RGB | ((i: number) => RGB), seg = 12, caps = true): void {
  const m = path.length;
  if (m < 2) return;
  // a frame that turns as little as it can along the path (parallel transport), starting square to the first segment and to z where it can
  const T: [number, number, number][] = [], N: [number, number, number][] = [], Bn: [number, number, number][] = [];
  for (let i = 0; i < m; i++) {
    const a = path[Math.max(0, i - 1)]!, c = path[Math.min(m - 1, i + 1)]!;
    let tx = c[0] - a[0], ty = c[1] - a[1], tz = c[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    T.push([tx, ty, tz]);
  }
  const cross = (u: readonly number[], v: readonly number[]): [number, number, number] => [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const norm = (u: [number, number, number]): [number, number, number] => { const l = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / l, u[1] / l, u[2] / l]; };
  let up: [number, number, number] = Math.abs(T[0]![2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  for (let i = 0; i < m; i++) {
    const t = T[i]!;
    const bn = norm(cross(t, up)), nn = norm(cross(bn, t));
    N.push(nn); Bn.push(bn); up = nn;
  }
  const colAt = (i: number): RGB | undefined => (typeof col === 'function' ? col(i) : col);
  const rows: number[] = [];
  for (let i = 0; i < m; i++) {
    rows.push(b.count);
    const p = path[i]!, r = radius(i), nn = N[i]!, bn = Bn[i]!;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const dx = nn[0] * ca + bn[0] * sa, dy = nn[1] * ca + bn[1] * sa, dz = nn[2] * ca + bn[2] * sa;
      b.v(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, colAt(i));
    }
  }
  for (let i = 0; i < m - 1; i++) b.strip(rows[i]!, rows[i + 1]!, seg, true);
  if (!caps) return;
  // round ends: a half sphere at each end
  for (const end of [0, m - 1]) {
    const p = path[end]!, r = radius(end), t = T[end]!, s = end === 0 ? -1 : 1, nn = N[end]!, bn = Bn[end]!;
    const ringsE = 4, start: number[] = [rows[end]!];
    for (let q = 1; q <= ringsE; q++) {
      const ph = (q / ringsE) * Math.PI / 2, cr = Math.cos(ph), sr = Math.sin(ph);
      start.push(b.count);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const dx = (nn[0] * ca + bn[0] * sa) * cr + t[0] * s * sr, dy = (nn[1] * ca + bn[1] * sa) * cr + t[1] * s * sr, dz = (nn[2] * ca + bn[2] * sa) * cr + t[2] * s * sr;
        b.v(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, colAt(end));
      }
    }
    for (let q = 0; q < ringsE; q++) { if (s > 0) b.strip(start[q]!, start[q + 1]!, seg, true); else b.strip(start[q + 1]!, start[q]!, seg, true); }
  }
}

/** A unit sphere (radius 1), for instanced round things (albumin, pores, nuclei). */
export function unitSphere(seg = 14, rings = 8): BufferGeometry {
  const b = new MeshBuilder();
  ellipsoid(b, 0, 0, 0, 1, 1, 1, 0, undefined, seg, rings);
  return b.build();
}

/** A unit capsule along x (length 1 between the centres of its round ends, radius 1 before scaling): microvilli, collagen fibres. */
export function unitRod(seg = 8): BufferGeometry {
  const b = new MeshBuilder();
  tube(b, [[-0.5, 0, 0], [0.5, 0, 0]], () => 1, undefined, seg, true);
  return b.build();
}

/** A red cell: a biconcave disc of radius 1 lying in the xy plane (thickness about 0.32 at the rim, 0.14 in the dimple), as a lathe. */
export function unitRbc(seg = 24): BufferGeometry {
  // the classic profile (Evans and Fung), half thickness against radius
  const prof: [number, number][] = [];
  const K = 16;
  for (let i = 0; i <= K; i++) {
    const r = Math.sin((i / K) * Math.PI / 2);   // (denser at the rim)
    const r2 = r * r, h = 0.5 * Math.sqrt(Math.max(0, 1 - r2)) * (0.14 + 1.0 * r2 - 0.56 * r2 * r2);
    prof.push([r, Math.max(h, i === K ? 0 : 0.02)]);
  }
  const b = new MeshBuilder();
  // the top half, then the bottom half (mirror), each a lathe of the profile
  for (const s of [1, -1]) {
    const rows: number[] = [];
    for (let i = 0; i <= K; i++) {
      const [r, h] = prof[i]!;
      // the profile's slope gives the normal: d(h)/d(r)
      const [r0, h0] = prof[Math.max(0, i - 1)]!, [r1, h1] = prof[Math.min(K, i + 1)]!;
      let dr = r1 - r0, dh = h1 - h0;
      if (i === K) { dr = 0; dh = -1; }
      const l = Math.hypot(dr, dh) || 1, nr = -dh / l * s * (i === K ? -1 : 1), nz = (dr / l) * s;
      rows.push(b.count);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        b.v(r * ca, r * sa, s * h, (i === K ? 1 : nr) * ca, (i === K ? 1 : nr) * sa, i === K ? 0 : nz, undefined);
      }
    }
    for (let i = 0; i < K; i++) { if (s > 0) b.strip(rows[i]!, rows[i + 1]!, seg, true); else b.strip(rows[i + 1]!, rows[i]!, seg, true); }
  }
  return b.build();
}

/** A matrix for an instance: at (x, y, z), turned by `a` about z, scaled (sx, sy, sz). */
export function placeAt(m: Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, a = 0, tiltX = 0): Matrix4 {
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tiltX), st = Math.sin(tiltX);
  // R = Rz(a) * Rx(tilt), then scale
  m.set(
    ca * sx, -sa * ct * sy, sa * st * sz, x,
    sa * sx, ca * ct * sy, -ca * st * sz, y,
    0, st * sy, ct * sz, z,
    0, 0, 0, 1,
  );
  return m;
}
