// Clots (thrombus): the 2D figure's lumpy plug that lies against one wall of the vein, grows from that wall as the occlusion rises, lengthens, and at full occlusion
// spans the lumen with blunt ends (clot-shape.js: clotSpan, clotRadius, clotShift, clotSide, all copied). The clot is the whole vein's: a vein the engine cuts in pieces has
// one. It lies INSIDE the vein as drawn (Mohammad, 20 Nov: "the clots don't fill inside the blood vessels at all"): on the drawn centreline, no wider than 0.9 of the lumen's live radius
// at every ring (the width the shader draws the tube at now: host.ts), pressed to one wall in the plane of the cross-section, and as faint as the vein is there (a hepatic vein fades into the liver and
// its clot fades with it). The wall is opaque, so, like a device in a vein, the clot draws over the wall with no depth test (ClotObject), at the vein's own place as the figure turns.
// THE CLOT IS PART OF ITS VEIN'S DRAWING (Mohammad, 22 Nov: "HV IVC clots still all suck"). Where a vein opens into the cava it is cut per pixel along the cava's wall (vessels/shaders.ts cavaCut, from the vertex's `nbr`); the clot is cut by the SAME
// rule (its vertices carry `nbr` against the cava, fill and outline both), so the clot and the vein end on one line. It is drawn in its vein's own slot (the vein's layer and draw order, just after it: one pass, one wash), depth-tested at the depth rule the tube draws
// at (the axis's depth and the same share of the bulge) less a bias, so it ties with its vein and loses to a vessel on a nearer tier;  (Its outline weight is not touched here: the clot's style is its own plan.)
// A clot thickens and thins with its parameter in a moment (lesion-ease.js) and never pops: a new clot grows from nothing, a lysed one shrinks to nothing.
import { BufferGeometry, Float32BufferAttribute, Group, Vector3 } from 'three';
import { NBR_STRIDE, neighbourAttr } from '../vessels/neighbour.ts';
import { TUBE_DEPTH_SHARE } from '../vessels/shaders.ts';
import { opensIntoCava } from '../vessels/fades.ts';
import { clotRadius, clotShift, clotSide, clotSpan, hashSeed } from './copied/clot-shape.js';
import type { CelShared } from '../materials/cel.ts';
import { DeviceObject, withAlpha } from '../devices/device-object.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type Host, type HostPoint, type Swells, cavaWallShare, drawnHost, hostAt, swellsOf } from './host.ts';
import { lesionStep } from './follow.ts';
import { clotColour, recolour } from './paint.ts';
import { ringTube } from './tube.ts';

/** The widest the clot may be against the lumen, as a share of its live width: a little inside it, so its soft edge never spills onto the wall (2D stage-clamps.js: W = width * 0.9). */
export const CLOT_INSIDE = 0.9;
export const CLOT_RINGS = 28;
/** The draw order the device base class is given (a clot's real order is its vein's: `placeAfter`). */
export const CLOT_ORDER = -20;
/** The rings a clot of a vein that opens into the cava has past the cava's wall, to the vein's own end inside the lumen: the cut along the wall (below) is what ends the clot, so it must run on past the wall, never stop short of it. */
export const CLOT_RINGS_PAST = 3;
/** Where the clot's vertex stage depth-tests: a clot has no wall of its own to stand in front of, it is in its vein. */
export const CLOT_DEPTH_MARGIN = 0.0005;
/** The depth bias (scene units, toward the viewer) a clot of lumen radius `lumenMax` draws at: the tube's depth rule puts its vein's front pixel TUBE_DEPTH_SHARE of the bulge in front of the axis, so the clot, drawn at its own axis's depth, needs that much and a hair more to tie with it. It is a few thousandths,
 *  far under the 0.01 between the tiers, so a vessel on a nearer tier still hides it and one on a farther tier does not. */
export const clotBiasOf = (lumenMax: number): number => TUBE_DEPTH_SHARE * lumenMax + CLOT_DEPTH_MARGIN;

/** What the clot's vertex stages add (both the fill and the outline): the vertex's ring (`ringC`: the clot's own axis, for depth), and the cava's `nbr`. */
export const CLOT_VS_GLSL = /* glsl */ `
attribute vec3 ringC;
attribute vec3 nbr;
varying vec2 vNbr;
varying float vUpx;
uniform float clotBias;
// the cava's cut needs the scene units under one CSS px here (the fragment stage turns the pixel's distance from the wall into px with it) and the vertex's place against the cava
void clotVary() {
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(ringC, 1.0);
  vUpx = max(2.0 * ca.w / (res.y * projectionMatrix[1][1]), 1e-9);
  vNbr = nbr.xy;   // (the vein's own cava cut reads only the distance and the radius: z, the end plane, is NBR_NO_END against the cava)
}
// the tube's depth rule (vessels/shaders.ts TUBE_DEPTH_SHARE): the clot's own axis's depth plus the same share of the bulge (never farther than the axis: a back face is no deeper), toward the viewer by clotBias
float clotDepth(vec4 c) {
  vec4 cc = projectionMatrix * modelViewMatrix * vec4(ringC, 1.0);
  float za = cc.z / cc.w, zs = min(c.z / c.w, za);
  float z = mix(za, zs, ${TUBE_DEPTH_SHARE.toFixed(4)}) * c.w;
  return z - clotBias * (-projectionMatrix[3][2]) / c.w;
}`;
/** The fragment stages' cut along the cava's wall: exactly the vein's (shaders.ts: cavA, a pixel wide, anti-aliased), so the clot and the vein end on one line. `vUpx`: scene units under one CSS px. */
export const CLOT_FS_GLSL = /* glsl */ `
varying vec2 vNbr;
varying float vUpx;
uniform float dpr;
float clotCut() {
  if (vNbr.y <= 0.0) return 1.0;
  float cdPx = (vNbr.y - abs(vNbr.x)) / max(vUpx, 1e-9) * dpr;
  return 1.0 - smoothstep(-0.5, 0.5, cdPx);
}`;

/** The slot in the vein's layer where a clot draws: just after the vein's own copy (a vein behind the organs has a veil copy at VEIL_ORDER, which the clot follows; any other vein is at 0). */
export const CLOT_AFTER_VEIN = 0.25;

/** A clot's vertices carry the vein's opacity there (`lumA`): the fill and the outline both multiply it. */
export class ClotObject extends DeviceObject {
  constructor(geometry: BufferGeometry, shared: CelShared) {
    super(geometry, 'poly', shared, { bands: 3, spec: 0, px: 0.9, order: CLOT_ORDER, fat: 0 }, 'ink');
    const tv = this.toon.vertexShader, iv = this.ink.vertexShader;
    this.toon.vertexShader = 'attribute float lumA;\nvarying float vLumA;\n'
      + withAlpha(withAlpha(withAlpha(tv, 'void main() {', CLOT_VS_GLSL + '\nvoid main() {'),
        'vUv = uv;', 'vUv = uv;\n  vLumA = lumA;\n  clotVary();'),
        'gl_Position = gp;', 'gp.z = clotDepth(gp);\n  gl_Position = gp;');
    this.toon.fragmentShader = 'varying float vLumA;\n' + CLOT_FS_GLSL + '\n' + withAlpha(this.toon.fragmentShader, 'gl_FragColor = vec4(c, alpha * tailK(vUv.x));', 'float cutK = clotCut();\n  if (cutK < 0.004) discard;\n  gl_FragColor = vec4(c, alpha * tailK(vUv.x) * vLumA * cutK);');
    this.ink.vertexShader = 'attribute float lumA;\nvarying float vLumA;\n'
      + withAlpha(withAlpha(withAlpha(iv, 'void main() {', CLOT_VS_GLSL + '\nvoid main() {'),
        'vU = uv.x;', 'vU = uv.x;\n  vLumA = lumA;\n  clotVary();'),
        'gl_Position = c;', 'c.z = clotDepth(c);\n  gl_Position = c;');
    this.ink.fragmentShader = 'varying float vLumA;\n' + CLOT_FS_GLSL + '\n' + withAlpha(this.ink.fragmentShader, 'gl_FragColor = vec4(mix(color, hiColor', 'float cutK = clotCut();\n  if (cutK < 0.004) discard;\n  gl_FragColor = vec4(mix(color, hiColor');
    this.ink.fragmentShader = withAlpha(this.ink.fragmentShader, ' * edgeA', ' * edgeA * vLumA * cutK');
    this.toon.uniforms.clotBias = this.ink.uniforms.clotBias = { value: clotBiasOf(0.02) };
    this.toon.uniforms.dpr = this.ink.uniforms.dpr = shared.dpr;
    // The clot is IN its vein: depth-tested (at the vein's depth rule, less the bias), drawn into no depth, in the vein's own layer just after its copy; the device's no-depth-test draw put a solid clot over a faint vein and over whatever stood in front of it.
    for (const m of [this.toon, this.ink]) { m.depthTest = true; m.depthWrite = false; m.needsUpdate = true; }
    this.placeAfter(0);
  }
  /** Draws after the vein's copy whose draw order is `veinOrder` (the ink first, the fill over it), and the bias for a vein whose lumen is at most `lumenMax` wide in scene units (-1: keep it). */
  placeAfter(veinOrder: number, lumenMax = -1): void {
    for (const c of this.group.children) if (c !== this.toonMesh) c.renderOrder = veinOrder + CLOT_AFTER_VEIN;
    this.toonMesh.renderOrder = veinOrder + CLOT_AFTER_VEIN + 0.05;
    if (lumenMax >= 0) (this.toon.uniforms.clotBias as { value: number }).value = clotBiasOf(lumenMax);
  }
}

interface Clot { id: string; goal: number; cur: number; obj: ClotObject | null; builtFor: number; swells: number[]; cava: number }

export interface ClotShape {
  centres: Vector3[]; radii: number[]; alpha: number[];
  /** the lumen's live radius at each ring */ lumen: number[];
  /** the vein's own axis at each ring (the clot's offset is from it) */ axis?: Vector3[];
}

/** The shares of the drawn vein's arc length the clot's rings lie at: 2D's span (clot-shape.js clotSpan), and for a vein that opens into the cava it runs on to the cava's wall, to the junction (Mohammad, 20 Nov: "the clots stop well short of the junction"). */
export function clotShares(host: Host, v: number, cavaSwell = 1): number[] {
  const span = clotSpan(v), wall = cavaWallShare(host, cavaSwell), u0 = span.u0, u1 = wall != null ? Math.max(span.u1, wall) : span.u1;
  const out = Array.from({ length: CLOT_RINGS }, (_, i) => u0 + (u1 - u0) * (i / (CLOT_RINGS - 1)));
  // (past the cava's wall the clot goes on, inside the cava's lumen, to the vein's own end: the per-pixel cut along the wall ends it there, as it ends the vein, instead of the last ring standing short of a wall that crosses it slantwise)
  if (wall != null && u1 < 1 - 1e-9) for (let j = 1; j <= CLOT_RINGS_PAST; j++) out.push(u1 + (1 - u1) * (j / CLOT_RINGS_PAST));
  return out;
}

/** The clot's centres and radii for an occlusion v in the drawn vein `host`, its pieces at `swells` (live width over built width): the 2D shape, in scene units. Every ring is a circle that lies whole inside the
 *  lumen's circle at its place (offset + radius <= 0.9 of the live lumen radius), against the wall the clot's id picks, in the plane of the cross-section. */
export function clotShapeOf(host: Host, swells: readonly number[] & { cava?: number }, v: number, id: string): ClotShape {
  const seed = hashSeed(id), side = clotSide(seed), shares = clotShares(host, v, swells.cava ?? 1);
  const on: HostPoint[] = hostAt(host, swells, shares);
  const centres: Vector3[] = [], radii: number[] = [], alpha: number[] = [], lumen: number[] = [], axis: Vector3[] = [];
  const n = new Vector3(), up = new Vector3(0, 1, 0);
  for (let i = 0; i < on.length; i++) {
    const q = on[i]!, W = 2 * q.r * CLOT_INSIDE;
    // the wall's direction: the 2D figure's normal in the plane of the figure, made perpendicular to the vein's heading (a vein that runs in depth has its cross-section tilted)
    n.set(q.t.y, -q.t.x, 0);
    if (n.lengthSq() < 1e-8) n.crossVectors(q.t, up);
    n.addScaledVector(q.t, -n.dot(q.t));
    if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
    n.normalize();
    // (the taper runs over the clot's own rings; the rings past the cava's wall hold the last one's width)
    const r = clotRadius(v, W, Math.min(1, i / (CLOT_RINGS - 1)), seed), sh = clotShift(W, r, side);
    centres.push(q.p.clone().addScaledVector(n, sh));
    radii.push(Math.max(1e-5, r)); alpha.push(q.a); lumen.push(q.r); axis.push(q.p.clone());
  }
  return { centres, radii, alpha, lumen, axis };
}

/** The cava a clot's vertices are cut against: the vein's last piece (the one that opens into it) and the cava piece's live swell (its drawn width over the width it was built at). */
export interface ClotCut { piece: string; swell: number }

/** The clot's geometry: the tube along its rings, each vertex carrying the vein's opacity at its ring, the ring's own centre (the depth rule's axis) and, in a vein that opens into the cava, `nbr`: its place against the cava, as the vein's own vertices carry it. */
export function clotGeometry(shape: ClotShape, cut: ClotCut | null = null): BufferGeometry {
  const radial = 12, g = ringTube(shape.centres, shape.radii, radial, true);
  const n = shape.centres.length;
  const a: number[] = [], rc: number[] = [];
  const put = (i: number): void => { const c = shape.centres[i]!; a.push(shape.alpha[i]!); rc.push(c.x, c.y, c.z); };
  for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) put(i);
  put(0); put(n - 1);   // (the two end caps, one vertex each)
  g.setAttribute('lumA', new Float32BufferAttribute(a, 1));
  g.setAttribute('ringC', new Float32BufferAttribute(rc, 3));
  const nb = (cut && neighbourAttr(cut.piece, g.getAttribute('position').array)) || new Float32Array(g.getAttribute('position').count * NBR_STRIDE);
  if (cut) for (let i = 1; i < nb.length; i += NBR_STRIDE) nb[i] = nb[i]! * cut.swell;   // (the cava as it is DRAWN: its built radius times its live swell, as the vein's vertex stage does it)
  g.setAttribute('nbr', new Float32BufferAttribute(nb, NBR_STRIDE));
  return g;
}

export class ClotLayer {
  readonly group = new Group();
  private clots = new Map<string, Clot>();
  private shared: CelShared;
  private palette: Palette | null = null;
  private look: LookId = 'light';
  private fade = 1;
  /** The draw order of the vein piece `id`'s own copy that a clot follows (0; VEIL_ORDER for a vein behind the organs): bound by the scene's disease layer, which knows the vessels. */
  private veinOrder: (pieceId: string) => number = () => 0;
  constructor(shared: CelShared) { this.shared = shared; }
  bindHosts(veinOrder: (pieceId: string) => number): void { this.veinOrder = veinOrder; }

  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; for (const c of this.clots.values()) if (c.obj) { c.obj.applyPalette(p); recolour(c.obj, clotColour(look, p), p); } }
  setPhone(phone: boolean): void { for (const c of this.clots.values()) c.obj?.setPhone(phone); }
  /** The body's dissolve (disease/index.ts setFade): a clot is part of the anatomy, so the Circuit does not keep it. */
  setFade(f: number): void { this.fade = f; for (const c of this.clots.values()) if (c.obj) { c.obj.setFade(f); c.obj.group.visible = c.cur > 0.003 && f > 0.001; } }

  /** The params' thrombus map. `instant` (a new patient) takes it whole. `D`: the engine's diameter of every edge (mm), which the veins are drawn at: a clot follows its vein's width. Returns true while a clot grows or shrinks. */
  set(thrombus: Record<string, number>, dt: number, instant = false, D: ArrayLike<number> | null = null): boolean {
    for (const id of Object.keys(thrombus)) if (!this.clots.has(id) && drawnHost(id)) this.clots.set(id, { id, goal: 0, cur: 0, obj: null, builtFor: -1, swells: [], cava: NaN });
    let moving = false;
    for (const c of this.clots.values()) {
      c.goal = thrombus[c.id] ?? 0;
      const next = instant ? c.goal : lesionStep(c.cur, c.goal, dt);
      const host = drawnHost(c.id)!, swells = swellsOf(host, D);
      const cavaS = swells.cava ?? 1;
      const widthMoved = (swells.some((s, i) => Math.abs(s - (c.swells[i] ?? NaN)) > 0.004 * s) || Math.abs(cavaS - c.cava) > 0.004 * cavaS) && next > 0.003;
      if (next !== c.cur || c.builtFor !== next || widthMoved) { c.cur = next; this.rebuild(c, host, swells); }
      if (c.cur !== c.goal) moving = true;
    }
    return moving;
  }

  private rebuild(c: Clot, host: Host, swells: Swells): void {
    c.builtFor = c.cur; c.swells = swells; c.cava = (swells as Swells).cava ?? 1;
    if (c.cur <= 0.003) { if (c.obj) c.obj.group.visible = false; return; }
    const shape = clotShapeOf(host, swells, c.cur, c.id), last = host.pieces[host.pieces.length - 1]!.id;
    const g = clotGeometry(shape, opensIntoCava(last) ? { piece: last, swell: c.cava } : null);
    if (!c.obj) {
      c.obj = new ClotObject(g, this.shared);
      this.group.add(c.obj.group);
      if (this.palette) { c.obj.applyPalette(this.palette); recolour(c.obj, clotColour(this.look, this.palette), this.palette); }
      c.obj.setFade(this.fade);
    } else {
      const old = new Set<BufferGeometry>();
      for (const m of c.obj.group.children) { const mesh = m as import('three').Mesh; old.add(mesh.geometry); mesh.geometry = g; }
      for (const o of old) o.dispose();
    }
    c.obj.placeAfter(Math.max(...host.pieces.map((p) => this.veinOrder(p.id))), Math.max(...shape.lumen));   // (in its vein's slot, at the depth its vein's width calls for)
    c.obj.group.visible = this.fade > 0.001;
  }

  /** The clots drawn now, by vein, with their shown occlusion. */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clots.values()) if (c.cur > 0.003) o[c.id] = c.cur; return o; }
  /** The geometry of a clot now (tests): its rings, as drawn. */
  shapeOf(id: string, D: ArrayLike<number> | null = null): ClotShape | null { const c = this.clots.get(id), h = drawnHost(id); return c && h && c.cur > 0.003 ? clotShapeOf(h, swellsOf(h, D), c.cur, id) : null; }
  dispose(): void { for (const c of this.clots.values()) { c.obj?.dispose(); } }
}
