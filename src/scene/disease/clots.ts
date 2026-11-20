// Clots (thrombus): the 2D figure's lumpy plug that lies against one wall of the vein, grows from that wall as the occlusion rises, lengthens, and at full occlusion
// spans the lumen with blunt ends (clot-shape.js: clotSpan, clotRadius, clotShift, clotSide, all copied). The clot is the whole vein's: a vein the engine cuts in pieces has
// one. It lies INSIDE the vein as drawn (Mohammad, 20 Nov: "the clots don't fill inside the blood vessels at all"): on the drawn centreline, no wider than 0.9 of the lumen's live radius
// at every ring (the width the shader draws the tube at now: host.ts), pressed to one wall in the plane of the cross-section, and as faint as the vein is there (a hepatic vein fades into the liver and
// its clot fades with it). The wall is opaque, so, like a device in a vein, the clot draws over the wall with no depth test (ClotObject), at the vein's own place as the figure turns.
// A clot thickens and thins with its parameter in a moment (lesion-ease.js) and never pops: a new clot grows from nothing, a lysed one shrinks to nothing.
import { BufferGeometry, Float32BufferAttribute, Group, Vector3 } from 'three';
import { clotRadius, clotShift, clotSide, clotSpan, hashSeed } from './copied/clot-shape.js';
import type { CelShared } from '../materials/cel.ts';
import { DeviceObject, withAlpha } from '../devices/device-object.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type Host, type HostPoint, drawnHost, hostAt, swellsOf } from './host.ts';
import { lesionStep } from './follow.ts';
import { clotColour, recolour } from './paint.ts';
import { ringTube } from './tube.ts';

/** The widest the clot may be against the lumen, as a share of its live width: a little inside it, so its soft edge never spills onto the wall (2D stage-clamps.js: W = width * 0.9). */
export const CLOT_INSIDE = 0.9;
export const CLOT_RINGS = 28;
/** Where a clot draws: after the vessels and the organs' wash, before the devices (which run through it). */
export const CLOT_ORDER = -20;

/** A clot's vertices carry the vein's opacity there (`lumA`): the fill and the outline both multiply it. */
export class ClotObject extends DeviceObject {
  constructor(geometry: BufferGeometry, shared: CelShared) {
    super(geometry, 'poly', shared, { bands: 3, spec: 0, px: 0.9, order: CLOT_ORDER, fat: 0 }, 'ink');
    this.toon.vertexShader = 'attribute float lumA;\nvarying float vLumA;\n' + withAlpha(this.toon.vertexShader, 'vUv = uv;', 'vUv = uv;\n  vLumA = lumA;');
    this.toon.fragmentShader = 'varying float vLumA;\n' + withAlpha(this.toon.fragmentShader, 'gl_FragColor = vec4(c, alpha * tailK(vUv.x));', 'gl_FragColor = vec4(c, alpha * tailK(vUv.x) * vLumA);');
    this.ink.vertexShader = 'attribute float lumA;\nvarying float vLumA;\n' + withAlpha(this.ink.vertexShader, 'vU = uv.x;', 'vU = uv.x;\n  vLumA = lumA;');
    this.ink.fragmentShader = 'varying float vLumA;\n' + withAlpha(this.ink.fragmentShader, ' * edgeA', ' * edgeA * vLumA');
  }
}

interface Clot { id: string; goal: number; cur: number; obj: ClotObject | null; builtFor: number; swells: number[] }

export interface ClotShape { centres: Vector3[]; radii: number[]; alpha: number[]; /** the lumen's live radius at each ring */ lumen: number[] }

/** The clot's centres and radii for an occlusion v in the drawn vein `host`, its pieces at `swells` (live width over built width): the 2D shape, in scene units. Every ring is a circle that lies whole inside the
 *  lumen's circle at its place (offset + radius <= 0.9 of the live lumen radius), against the wall the clot's id picks, in the plane of the cross-section. */
export function clotShapeOf(host: Host, swells: readonly number[], v: number, id: string): ClotShape {
  const seed = hashSeed(id), side = clotSide(seed), { u0, u1 } = clotSpan(v);
  const shares = Array.from({ length: CLOT_RINGS }, (_, i) => u0 + (u1 - u0) * (i / (CLOT_RINGS - 1)));
  const on: HostPoint[] = hostAt(host, swells, shares);
  const centres: Vector3[] = [], radii: number[] = [], alpha: number[] = [], lumen: number[] = [];
  const n = new Vector3(), up = new Vector3(0, 1, 0);
  for (let i = 0; i < on.length; i++) {
    const q = on[i]!, W = 2 * q.r * CLOT_INSIDE;
    // the wall's direction: the 2D figure's normal in the plane of the figure, made perpendicular to the vein's heading (a vein that runs in depth has its cross-section tilted)
    n.set(q.t.y, -q.t.x, 0);
    if (n.lengthSq() < 1e-8) n.crossVectors(q.t, up);
    n.addScaledVector(q.t, -n.dot(q.t));
    if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
    n.normalize();
    const r = clotRadius(v, W, i / (on.length - 1), seed), sh = clotShift(W, r, side);
    centres.push(q.p.clone().addScaledVector(n, sh));
    radii.push(Math.max(1e-5, r)); alpha.push(q.a); lumen.push(q.r);
  }
  return { centres, radii, alpha, lumen };
}

/** The clot's geometry: the tube along its rings, each vertex carrying the vein's opacity at its ring. */
function clotGeometry(shape: ClotShape): BufferGeometry {
  const radial = 12, g = ringTube(shape.centres, shape.radii, radial, true);
  const n = shape.centres.length, a: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) a.push(shape.alpha[i]!);
  a.push(shape.alpha[0]!, shape.alpha[n - 1]!);   // (the two end caps, one vertex each)
  g.setAttribute('lumA', new Float32BufferAttribute(a, 1));
  return g;
}

export class ClotLayer {
  readonly group = new Group();
  private clots = new Map<string, Clot>();
  private shared: CelShared;
  private palette: Palette | null = null;
  private look: LookId = 'light';
  private fade = 1;
  constructor(shared: CelShared) { this.shared = shared; }

  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; for (const c of this.clots.values()) if (c.obj) { c.obj.applyPalette(p); recolour(c.obj, clotColour(look, p), p); } }
  setPhone(phone: boolean): void { for (const c of this.clots.values()) c.obj?.setPhone(phone); }
  /** The body's dissolve (disease/index.ts setFade): a clot is part of the anatomy, so the Circuit does not keep it. */
  setFade(f: number): void { this.fade = f; for (const c of this.clots.values()) if (c.obj) { c.obj.setFade(f); c.obj.group.visible = c.cur > 0.003 && f > 0.001; } }

  /** The params' thrombus map. `instant` (a new patient) takes it whole. `D`: the engine's diameter of every edge (mm), which the veins are drawn at: a clot follows its vein's width. Returns true while a clot grows or shrinks. */
  set(thrombus: Record<string, number>, dt: number, instant = false, D: ArrayLike<number> | null = null): boolean {
    for (const id of Object.keys(thrombus)) if (!this.clots.has(id) && drawnHost(id)) this.clots.set(id, { id, goal: 0, cur: 0, obj: null, builtFor: -1, swells: [] });
    let moving = false;
    for (const c of this.clots.values()) {
      c.goal = thrombus[c.id] ?? 0;
      const next = instant ? c.goal : lesionStep(c.cur, c.goal, dt);
      const host = drawnHost(c.id)!, swells = swellsOf(host, D);
      const widthMoved = swells.some((s, i) => Math.abs(s - (c.swells[i] ?? NaN)) > 0.004 * s) && next > 0.003;
      if (next !== c.cur || c.builtFor !== next || widthMoved) { c.cur = next; this.rebuild(c, host, swells); }
      if (c.cur !== c.goal) moving = true;
    }
    return moving;
  }

  private rebuild(c: Clot, host: Host, swells: number[]): void {
    c.builtFor = c.cur; c.swells = swells;
    if (c.cur <= 0.003) { if (c.obj) c.obj.group.visible = false; return; }
    const g = clotGeometry(clotShapeOf(host, swells, c.cur, c.id));
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
    c.obj.group.visible = this.fade > 0.001;
  }

  /** The clots drawn now, by vein, with their shown occlusion. */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clots.values()) if (c.cur > 0.003) o[c.id] = c.cur; return o; }
  /** The geometry of a clot now (tests): its rings, as drawn. */
  shapeOf(id: string, D: ArrayLike<number> | null = null): ClotShape | null { const c = this.clots.get(id), h = drawnHost(id); return c && h && c.cur > 0.003 ? clotShapeOf(h, swellsOf(h, D), c.cur, id) : null; }
  dispose(): void { for (const c of this.clots.values()) { c.obj?.dispose(); } }
}
