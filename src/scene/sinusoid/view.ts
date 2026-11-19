// The sinusoid in 3D: the 2D app's sinusoid view, lifted. 2D paints the whole screen with ONE fragment shader (sinusoid-gl.js: the lumen with its streaks, the endothelium and its
// fenestrae, the space of Disse, collagen, the plates of hepatocytes repeating outward, the stellate and Kupffer cells, the end arrows) and rides a pass of albumin sprites over it
// (sinusoid-view.js). This file runs those same shaders, copied by scripts/copy-sinusoid.mjs, on a plane in the scene: tissue to every edge of the screen on every device, no strip
// floating in the page. The plane is the sinusoid's own frame (lobule/frames.ts), so the camera flies into it, pans, zooms and orbits it like anything else, and the shader finds each
// pixel's micrometres from the plane's position and one pixel's size from the screen derivatives. Nothing of this view is drawn by the CPU: no cell, pore or nucleus is a mesh.
//
// What it is for: the wall and the space of Disse. Plasma filters out of the lumen through the fenestrae, the lymph so made runs back along Disse toward the portal tract, and in
// cirrhosis the pores close, collagen and a basement membrane build up, the microvilli flatten, the stellate cell activates and squeezes the lumen (the rates are the engine's:
// lobule/model.ts sinusoidTargets). Every state eases, nothing jumps.
//
// The 2D coordinates are kept: x in micrometres along the flow (portal end left), y across, DOWN in the shader (its upper Disse is y < 0); here the plane's y runs up and the shader's
// is its mirror. The dive (WP8) drives `setDive(g)`: 0 as the camera leaves the lobule, 1 as it lands, the tissue coming in over all of it and its detail last, as 2D's zoom does.
import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, DoubleSide, DynamicDrawUsage, Group, Mesh, OneFactor, OneMinusSrcAlphaFactor, Points, RawShaderMaterial, Vector2, Vector3, Vector4,
} from 'three';
import type { CelObject, CelShared } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { paletteOf } from '../../ui/charts/palette.ts';
import { parseColour } from '../../ui/charts/colour.ts';
import { samplerFor } from '../lenses/model.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE } from '../flow.ts';
import { type SinusoidTargets, easeToward } from '../lobule/model.ts';
import { PartSet, SINUSOID_PARTS, type SinusoidPartName } from '../lobule/parts.ts';
import { SINUSOID_L } from '../lobule/shots.ts';
import { washProgress } from '../lobule/wash.ts';
import { type InkContext } from '../lobule/ink.ts';
import { rng } from '../lobule/geometry.ts';
import { type Pore, SEED, SLOT, UM, cellEdge, nucAt, poreAt, poreOpenness } from './layout.ts';
import { SINUSOID_FS, SINUSOID_PFS, SINUSOID_PVS, SINUSOID_UNIFORMS, SINUSOID_VS } from './gl.copied.ts';
import { createGeom, createTraffic } from './traffic.copied.js';
import { createPalette } from './palette.copied.js';

/** Micrometres across the stretch the shot frames (four hepatocytes of the 2D plate), and the plane's local units per micrometre. */
export const SPAN_UM = 97.4;
export const U = SINUSOID_L / SPAN_UM;
/** The plane's half size in local units: far past any frame the camera can hold, so its edge is never on screen (the tissue repeats outward in the shader). */
export const PLANE_HALF = 80;
/** The stretch (µm) the traffic runs over, a little wider than the shot. */
const VIS = 70;
/** Where the end arrows stand (µm), as 2D lays them beside the names of the portal venule and the central vein. */
const END = [-46, 46, 3.5] as const;

export interface SinusoidViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean }

interface Cur { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number }
const REST: Cur = { por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const MAX_SPRITES = 1400;

type Uniform = { value: number | Vector2 | Vector3 | Vector4 };
function uniformsOf(): Record<string, Uniform> {
  const u: Record<string, Uniform> = {};
  for (const [name, type] of Object.entries(SINUSOID_UNIFORMS)) u[name] = { value: type === 'vec2' ? new Vector2() : type === 'vec3' ? new Vector3() : type === 'vec4' ? new Vector4() : 0 };
  return u;
}

/** The dive's share (0 leaving the lobule, 1 landed) from how far the camera is from the sinusoid: geometric between the lobule's own station and the sinusoid's shot, as the camera blends it. */
export function diveShare(distance: number, far: number, near: number): number {
  if (!(distance > 0) || !(far > near)) return 1;
  return clamp(Math.log(far / distance) / Math.log(far / near), 0, 1);
}

export class SinusoidView {
  readonly set = new PartSet<SinusoidPartName>(SINUSOID_PARTS);
  readonly group: Group = this.set.group;
  /** (No cel objects: the view is two shaders on a plane and a pass of sprites.) */
  readonly objects: CelObject[] = [];
  /** The three draws, in order: the tissue, the albumin over it, the cells that lie over the albumin. */
  readonly tissue: Mesh;
  readonly sprites: Points;
  readonly cells: Mesh;
  private readonly uni = uniformsOf();
  private readonly mats: RawShaderMaterial[] = [];
  private cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private visible = false;
  private lastNow = -1;
  private look: LookId;
  private reduce: boolean;
  private dirty = true;
  private washAt = -1;
  private washOn = false;
  private washK = 0;
  private dpr = 1;
  private dive: number | null = null;
  private readonly res: Vector2;
  private readonly ink = { ctx: null as InkContext | null };
  // 2D's own placement and traffic, copied (traffic.copied.js, palette.copied.js)
  private readonly model = { hide: false, P2: 5, lyProt: 0.88 };
  private readonly geo: { xs: number; xk: number; pores: Pore[][] };
  private readonly VW = { vis: [-VIS, VIS] as [number, number] };
  private readonly g: { halfW(x: number): number; disseW(x: number): number; wallIn(x: number): number; hepIn(x: number): number };
  private readonly traffic: { stepMovers(dt: number): void; sprites(): number; pts: Float32Array; readonly flowX: number; readonly lymX: number; setDt(v: number): void };
  private readonly pal: { palette(dark: boolean): Record<string, unknown>; PAL: Record<string, unknown>; bump(): void };
  private readonly pos = new Float32Array(MAX_SPRITES * 3);
  private readonly ak = new Float32Array(MAX_SPRITES * 2);

  constructor(shared: CelShared, opts: SinusoidViewOptions = {}) {
    this.look = opts.look ?? 'light';
    this.reduce = !!opts.reduceMotion;
    void (opts.flowMode ?? DEFAULT_FLOW_MODE);
    this.res = shared.res.value;

    // placement, as ensureGeo makes it: the fenestrae of both linings out to X µm, the stellate cell at the junction nearest -10 µm, the Kupffer cell at 22 µm
    const X = 130, pores = [SEED.poreUp, SEED.poreDn].map((sd) => {
      const a: Pore[] = [];
      for (let j = Math.floor(-X / SLOT) - 1; j * SLOT < X + SLOT; j++) { const p = poreAt(j, sd); if (p) a.push(p); }
      return a;
    });
    let xs = cellEdge(0, SEED.plateUp);
    for (let j = -3; j <= 2; j++) { const b = cellEdge(j, SEED.plateUp); if (Math.abs(b + 10) < Math.abs(xs + 10)) xs = b; }
    this.geo = { xs, xk: 22, pores };
    const S = this.cur;
    this.g = createGeom({ S, geo: this.geo, UM });
    this.traffic = createTraffic({ S, geo: this.geo, VW: this.VW, model: this.model, rng, clamp, lerp, smooth, poreOpenness, ...this.g });
    this.pal = createPalette({
      S, model: this.model, cssv: (n: string, d?: string) => this.token(n, d), rgb: (c: unknown) => this.rgbOf(c),
      pressureColor: (p: number) => samplerFor(this.look, 'pressure').at(p, [0, 0, 0]),
    });

    // the plane, the sprites, the cells over them: one shader program for the first and third (uPass), one for the sprites
    const quad = new BufferGeometry();
    const h = PLANE_HALF;
    quad.setAttribute('position', new BufferAttribute(new Float32Array([-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (vs: string, fs: string, uni: Record<string, Uniform>) => {
      const m = new RawShaderMaterial({
        vertexShader: vs, fragmentShader: fs, uniforms: uni, side: DoubleSide, depthTest: false, depthWrite: false, transparent: true,
        blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      });
      this.mats.push(m);
      return m;
    };
    const u0 = { ...this.uni, uPass: { value: 0 } }, u1 = { ...this.uni, uPass: { value: 1 } };
    this.tissue = new Mesh(quad, mk(SINUSOID_VS, SINUSOID_FS, u0));
    this.cells = new Mesh(quad, mk(SINUSOID_VS, SINUSOID_FS, u1));
    const sg = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3), ka = new BufferAttribute(this.ak, 2);
    pa.setUsage(DynamicDrawUsage); ka.setUsage(DynamicDrawUsage);
    sg.setAttribute('position', pa); sg.setAttribute('aAK', ka); sg.setDrawRange(0, 0);
    this.sprites = new Points(sg, mk(SINUSOID_PVS, SINUSOID_PFS, this.uni));
    this.tissue.renderOrder = 10; this.sprites.renderOrder = 11; this.cells.renderOrder = 12;
    for (const m of [this.tissue, this.sprites, this.cells]) { m.frustumCulled = false;  }
    const body = this.set.get('lumen').group;   // (the one drawn view lives in the first part; the artist's swap-in is gone with the placeholder)
    body.add(this.tissue, this.sprites, this.cells);
    (this.uni.uU as { value: number }).value = U;
    this.applyLook(this.look);
    this.group.visible = false;
  }

  // ---- tokens, from the look: the 2D theme's own, resolved (ui/charts/palette.ts) ------------------------------------------------

  private static readonly ALIAS: Record<string, string> = { '--sv-gl-bile': '--bile-duct', '--sv-gl-albumin': '--albumin' };
  private static readonly FIXED: Record<string, string> = { '--sv-gl-shade': '#2A2430' };
  private token(n: string, d?: string): string {
    const p = paletteOf(this.look);
    if (p.has(n.slice(2))) return n;
    const a = SinusoidView.ALIAS[n];
    if (a && p.has(a.slice(2))) return a;
    return SinusoidView.FIXED[n] ?? d ?? '';
  }
  private rgbOf(c: unknown): [number, number, number] {
    if (Array.isArray(c)) return [c[0], c[1], c[2]];
    const s = String(c || '#000000');
    const v = s.startsWith('--') ? paletteOf(this.look).tok(s.slice(2)) : parseColour(s);
    return [v[0], v[1], v[2]];
  }

  // ---- looks, device, state --------------------------------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; }
  applyLook(look: LookId): void { this.look = look; this.pal.bump(); this.dirty = true; }
  setPhone(_phone: boolean): void { /* (the shader is resolution-independent: a line is at least a pixel wide on any screen) */ }
  /** The drawing buffer's pixel ratio (the scene's render asks the renderer): the shader's pixel sizes and the sprites' are in device pixels. */
  setDpr(dpr: number): void { if (dpr !== this.dpr) { this.dpr = dpr; this.dirty = true; } }

  setVisible(v: boolean): void { this.visible = v; this.group.visible = v; this.dirty = true; if (!v) this.washOn = false; }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the model (sinusoidTargets of the lobule's model). They ease in. */
  setTargets(t: SinusoidTargets): void { Object.assign(this.goal, t); this.dirty = true; }
  snapTargets(t: SinusoidTargets): void { this.setTargets(t); Object.assign(this.cur, this.goal); }
  /** The lens, look, model and reference the lumen's colour comes from (the 2D sinusoid is coloured by the pressure of its sinusoids, P2). */
  setInk(ctx: InkContext): void { this.ink.ctx = ctx; this.model.P2 = ctx.model.P2; this.model.lyProt = ctx.model.lyProt; this.dirty = true; }
  /** The dive's share, 0 to 1 (see diveShare), while the camera flies between the lobule and this view; null at rest (the tissue whole, everywhere). */
  setDive(g: number | null): void { if (g !== this.dive) { this.dive = g; this.dirty = true; } }
  get diveShareNow(): number | null { return this.dive; }

  // (The marks of the 2D sinusoid are the lumen's own streaks, set by the blood's speed; the Blood menu's chevron options act on the vessels and the lobule.)
  setLit(_parts: Iterable<SinusoidPartName>): void { /* nothing here wears flow marks */ }
  setFlowMode(_mode: FlowMarkMode): void { /* as above */ }
  setBlood(_b: { chevrons: boolean; keyChevrons: boolean }): void { /* as above */ }
  pulse(_nowMs: number): void { this.dirty = true; }
  /** A dive on into the sinusoid carries on the wedge's wash timing (2D has no amber on its sinusoid; the progress is kept for the deck's clock). */
  startWash(landedAtMs: number): void { this.washOn = true; this.washAt = landedAtMs; this.dirty = true; }
  stopWash(): void { this.washOn = false; this.washK = 0; this.dirty = true; }
  get washProgress(): number { return this.washK; }
  swap(name: SinusoidPartName, node: Parameters<PartSet<SinusoidPartName>['swap']>[1], keepPlaceholder = false): void { this.set.swap(name, node, keepPlaceholder); this.dirty = true; }

  /** One step: eases the state, runs the albumin, writes every uniform. True while anything moves (the blood always does while the view is up, unless motion is reduced). */
  update(now: number): boolean {
    if (!this.visible) { this.lastNow = -1; return false; }
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    let moving = this.dirty;
    this.dirty = false;
    if (easeToward(this.cur as unknown as Record<string, number>, this.goal as unknown as Record<string, number>, this.reduce ? 1e6 : dt)) moving = true;
    if (this.washOn) { const k = washProgress(now - this.washAt, this.reduce); if (k !== this.washK) { this.washK = k; moving = true; } if (k < 1) moving = true; }
    const run = !this.reduce, sec = dt / 1000;
    this.traffic.setDt(run ? sec : 0);
    if (run) { this.traffic.stepMovers(sec); moving = true; }
    this.write();
    return moving;
  }

  private write(): void {
    const S = this.cur, T = this.traffic, uni = this.uni;
    const num = (k: string, v: number) => { (uni[k] as { value: number }).value = v; };
    const vec = <V>(k: string) => uni[k]!.value as V;
    const dark = LOOKS[this.look].scheme === 'dark';
    const pal = this.pal.palette(dark) as Record<string, unknown>;
    for (const k of Object.keys(pal)) {
      const slot = uni[k], v = pal[k];
      if (!slot || v == null) continue;
      if (typeof v === 'number') num(k, v);
      else if (Array.isArray(v) && v.length === 3 && slot.value instanceof Vector3) slot.value.set(v[0], v[1], v[2]);
    }
    const g = this.g, geo = this.geo;
    num('uLum', UM.lum * S.lum); num('uPinch', S.pinch); num('uXs', geo.xs); num('uXk', geo.xk); num('uKy', g.halfW(geo.xk));
    num('uHscA', g.wallIn(geo.xs) + g.disseW(geo.xs) * 0.5 + 0.8);
    num('uCol', S.col); num('uBm', S.bm); num('uMv', S.mv); num('uAct', S.act); num('uPor', S.por);
    num('uFlow', T.flowX); num('uLym', T.lymX); num('uLyF', clamp(0.32 * S.filt ** 1.5, 0.06, 1.75)); num('uDir', Math.sign(S.v || 1));
    vec<Vector4>('uEnd').set(END[0], END[1], Math.min(END[2], UM.lum * S.lum * 0.95), 0.95);
    vec<Vector2>('uEndA').set(1, 1);
    // the zoom from the lobule (sinusoid-view.js): the tissue comes in over all of it at once as the zoom lands, its detail (fenestrae, microvilli, cells, traffic) last
    const d = this.dive;
    if (d != null) {
      vec<Vector4>('uRev').set(0, 0, 0, 0); num('uAll', smooth(0.5, 0.88, d));
      vec<Vector2>('uDet').set(smooth(0.72, 1, d), 1e5); num('uFocus', smooth(0.82, 1, d));
    } else { vec<Vector4>('uRev').set(1, -1e5, 1e5, 1e5); num('uAll', 1); vec<Vector2>('uDet').set(1, 1e5); num('uFocus', 1); }
    vec<Vector2>('uRes').set(this.res.x * this.dpr, this.res.y * this.dpr);
    num('uKCap', 12 * this.dpr);
    // the sprites: x, y (µm, the shader's y down), radius, alpha, kind
    const n = T.sprites(), p = T.pts;
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = p[i * 5]!; this.pos[i * 3 + 1] = p[i * 5 + 1]!; this.pos[i * 3 + 2] = p[i * 5 + 2]!;
      this.ak[i * 2] = p[i * 5 + 3]!; this.ak[i * 2 + 1] = p[i * 5 + 4]!;
    }
    const geoS = this.sprites.geometry;
    geoS.setDrawRange(0, n);
    (geoS.getAttribute('position') as BufferAttribute).needsUpdate = true; (geoS.getAttribute('aAK') as BufferAttribute).needsUpdate = true;
  }

  // ---- places, for the names ----------------------------------------------------------------------------------------------------

  /** Scene points (this view's own units, y up) of the places tags name (the 2D app's captions): 'in' (blood arrives, portal end), 'out' (to the central vein), 'lumen', 'fen', 'disse', 'hep', 'hsc', 'kup', 'lymph', 'canaliculus'. */
  anchor(name: string, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
    const g = this.g, geo = this.geo;
    const at = (xum: number, yDown: number): [number, number, number] => [xum * U, -yDown * U, 0];
    // a fenestra of the upper lining near x that no nucleus's swell covers (a pore under a cell body is not seen), the one that stays open longest
    const pore = (x: number): number => {
      let best = x, bs = Infinity;
      for (const p of geo.pores[0]!) {
        if (Math.abs(p.x - x) > 20) continue;
        const n = Math.floor(p.x / 38);
        let covered = false;
        for (let k = -1; k <= 1; k++) if (Math.abs(p.x - nucAt(n + k, SEED.nucUp)) < 4.4) covered = true;
        if (covered) continue;
        const sc = p.th + 0.02 * Math.abs(p.x - x);
        if (sc < bs) { bs = sc; best = p.x; }
      }
      return best;
    };
    const P: Record<string, [number, number, number]> = {
      in: at(END[0], 0), out: at(END[1], 0), lumen: at(0, 0),
      fen: at(pore(10), -(g.wallIn(10) - UM.endo / 2)), disse: at(24, -(g.wallIn(24) + g.disseW(24) * 0.5)),
      hep: at(8, -(g.hepIn(8) + UM.hep * 0.7)), hsc: at(geo.xs, -(g.wallIn(geo.xs) + g.disseW(geo.xs) * 0.5 + 0.8)),
      kup: at(geo.xk, g.halfW(geo.xk) - 2), lymph: at(-VIS + 6, g.hepIn(-VIS) + 1.2), canaliculus: at(cellEdge(1, SEED.plateUp), -(g.hepIn(0) + UM.hep / 2)),
    };
    const p = P[name] ?? at(0, 0);
    out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
    return out;
  }

  warm(gl: { compile?: (s: Group, c: unknown) => void }, camera: unknown): void {
    const was = this.group.visible;
    this.group.visible = true;
    try { gl.compile?.(this.group, camera); } finally { this.group.visible = was; }
  }

  dispose(): void { this.tissue.geometry.dispose(); this.sprites.geometry.dispose(); for (const m of this.mats) m.dispose(); }
}
