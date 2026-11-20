// The sinusoid's host: the 2D app's sinusoid, as a model with no picture of its own. It keeps the state (eased toward the engine's targets: lobule/model.ts sinusoidTargets), 2D's placement
// (the fenestrae, the stellate and Kupffer cells), 2D's traffic (albumin and the flow's run: traffic.copied.js), 2D's palette, the portrait turn, the screen it is on, the wash, the dive's share,
// the names (names.ts) and the anchors and micrometres for taps. Everything seen is drawn by the 3D sinusoid (micro3d/sinusoid3d.ts) from these, inside this view's group, so the camera
// flies into it, pans, zooms and orbits it like anything else. (The flat 2D-style drawing, 2D's tissue shader on a plane and its sprites, is gone: everything is 3D, Mohammad 20 Nov 2026.)
//
// The 2D coordinates are kept: x in micrometres along the flow (portal end left), y across, DOWN as 2D has it (its upper Disse is y < 0); the plane's y runs up and is its mirror.
import type { Group } from 'three';
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
import { type NameGeom, type NamePlacement, type NamesInput, layoutNames } from './names.ts';
import { endsFor, framePoint, planePoint, xkFor } from './portrait.ts';
import { createGeom, createTraffic } from './traffic.copied.js';
import { createPalette } from './palette.copied.js';

/** Micrometres across the stretch the shot frames (four hepatocytes of the 2D plate), and the plane's local units per micrometre. */
export const SPAN_UM = 97.4;
export const U = SINUSOID_L / SPAN_UM;
/** The stretch (µm) the traffic runs over, a little wider than the shot. */
const VIS = 70;
/** Where the end arrows stand (µm) before the screen is known (`setScreen`), as 2D lays them beside the names of the portal venule and the central vein. */
const END_DEFAULT: readonly [number, number, number] = [-46, 46, 3.5];
/** The most of the sinusoid the traffic runs over (µm each way): the fenestrae are laid out that far (2D: geo.x0..x1). */
const REACH = 130;

export interface SinusoidViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean }

interface Cur { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number }
const REST: Cur = { por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The dive's share (0 leaving the lobule, 1 landed) from how far the camera is from the sinusoid: geometric between the lobule's own station and the sinusoid's shot, as the camera blends it. */
export function diveShare(distance: number, far: number, near: number): number {
  if (!(distance > 0) || !(far > near)) return 1;
  return clamp(Math.log(far / distance) / Math.log(far / near), 0, 1);
}

export class SinusoidView {
  readonly set = new PartSet<SinusoidPartName>(SINUSOID_PARTS);
  readonly group: Group = this.set.group;
  /** (No cel objects of its own: the 3D sinusoid draws everything.) */
  readonly objects: CelObject[] = [];
  /** How many albumin the traffic has out this frame (their x, y, radius, alpha, kind are traffic.pts, five numbers each). */
  spriteCount = 0;
  private cur: Cur = { ...REST };
  /** The way the blood runs along the sinusoid (+1 toward the central vein, -1 reversed). */
  get flowDir(): number { return Math.sign(this.cur.v || 1); }
  private goal: Cur = { ...REST };
  private visible = false;
  private lastNow = -1;
  private look: LookId;
  private reduce: boolean;
  private dirty = true;
  private washAt = -1;
  private washOn = false;
  private washK = 0;
  private dive: number | null = null;
  /** A portrait screen runs the sinusoid top to bottom (setPortrait): the camera rolls, the plane never turns. */
  private portrait = false;
  /** The screen the view is on (setScreen): px per µm and the free room's length along the flow (px); null until the scene says (then 2D's defaults hold). */
  private screen: { k: number; along: number; stage: number; centre: number } | null = null;
  /** How much each end's name shows (0 to 1), which its arrow follows (2D: endShown; 1 outside a talk). */
  private endShown: [number, number] = [1, 1];
  private washLand = -1;
  private readonly ink = { ctx: null as InkContext | null };
  // 2D's own placement and traffic, copied (traffic.copied.js, palette.copied.js)
  private readonly model = { hide: false, P2: 5, lyProt: 0.88 };
  private readonly geo: { xs: number; xk: number; pores: Pore[][] };
  private readonly VW = { vis: [-VIS, VIS] as [number, number] };
  /** How fast the traffic (albumin, the flow's run) goes against 2D's (1); the 3D scene sets its own. */
  trafficSpeed = 1;
  private readonly g: { halfW(x: number): number; disseW(x: number): number; wallIn(x: number): number; hepIn(x: number): number };
  private readonly traffic: { stepMovers(dt: number): void; sprites(): number; pts: Float32Array; readonly flowX: number; readonly lymX: number; setDt(v: number): void };
  private readonly pal: { palette(dark: boolean): Record<string, unknown>; PAL: Record<string, unknown>; bump(): void };

  constructor(shared: CelShared, opts: SinusoidViewOptions = {}) {
    this.look = opts.look ?? 'light';
    this.reduce = !!opts.reduceMotion;
    void (opts.flowMode ?? DEFAULT_FLOW_MODE);
    void shared;

    // placement, as ensureGeo makes it: the fenestrae of both linings out to X µm, the stellate cell at the junction nearest -10 µm, the Kupffer cell at 22 µm
    const X = 130, pores = [SEED.poreUp, SEED.poreDn].map((sd) => {
      const a: Pore[] = [];
      for (let j = Math.floor(-X / SLOT) - 1; j * SLOT < X + SLOT; j++) { const p = poreAt(j, sd); if (p) a.push(p); }
      return a;
    });
    let xs = cellEdge(0, SEED.plateUp);
    for (let j = -3; j <= 2; j++) { const b = cellEdge(j, SEED.plateUp); if (Math.abs(b + 10) < Math.abs(xs + 10)) xs = b; }
    this.geo = { xs, xk: xkFor(false), pores };
    const S = this.cur;
    this.g = createGeom({ S, geo: this.geo, UM });
    this.traffic = createTraffic({ S, geo: this.geo, VW: this.VW, model: this.model, rng, clamp, lerp, smooth, poreOpenness, ...this.g });
    this.pal = createPalette({
      S, model: this.model, cssv: (n: string, d?: string) => this.token(n, d), rgb: (c: unknown) => this.rgbOf(c),
      pressureColor: (p: number) => samplerFor(this.look, 'pressure').at(p, [0, 0, 0]),
    });

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
  setPhone(_phone: boolean): void { /* (nothing here depends on the device) */ }

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

  /** A portrait screen (2D's W < H * 0.95: see portrait.ts isPortrait) runs the sinusoid top to bottom, the portal end up. The plane itself never turns: the camera rolls (the shot's `roll`, so the lobule
   *  and the sinusoid turn together, in the dive and at rest), and everything on the plane (tissue, pores, albumin, anchors, hits) follows it. Here the layout follows: the Kupffer cell moves nearer
   *  the middle (2D: xk 12 against 22) and the names take their tall places. */
  setPortrait(portrait: boolean): void {
    if (portrait === this.portrait) return;
    this.portrait = portrait; this.geo.xk = xkFor(portrait); this.dirty = true;
  }
  get isPortrait(): boolean { return this.portrait; }
  /** What the scene knows of the screen: `k`, CSS px per µm along the plane now, and `along`, the free room's length in px in the flow's direction, and `stage`, the whole canvas's (the traffic runs over what is on screen, cards or no). The end arrows stand 32 px (24 on a tall screen)
   *  inside the room's ends and the traffic runs over the stretch on screen, as 2D lays them out (layoutEnds, VW.vis). Without it the defaults hold (arrows at ±46 µm, traffic over ±70). */
  /** CSS px per µm on the screen now (setScreen), 0 before it is known. */
  get pxPerUm(): number { return this.screen?.k ?? 0; }
  setScreen(k: number, along: number, stage = along, centre = 0): void {
    if (!(k > 0) || !(along > 0)) { if (this.screen) { this.screen = null; this.dirty = true; } return; }
    const s = this.screen;
    if (s && Math.abs(s.k - k) < 1e-3 * k && Math.abs(s.along - along) < 0.5 && Math.abs(s.stage - stage) < 0.5 && Math.abs(s.centre - centre) < 1e-3) return;
    this.screen = { k, along, stage: Math.max(stage, along), centre }; this.dirty = true;
    // the traffic runs over the stretch on screen, a little past it each way (2D: VW.vis = a0 - 8 .. a1 + 8, within the laid-out reach); `centre` is where the screen's middle is along the flow (µm from the sinusoid's own)
    const half = this.screen.stage / 2 / k + 8;
    this.VW.vis[0] = Math.max(-REACH, centre - half); this.VW.vis[1] = Math.min(REACH, centre + half);
  }
  /** How much each end's name shows (0 to 1); its arrow follows it (a presenter slide that is not about an end dims both). */
  setEndShown(inEnd: number, outEnd: number): void { if (inEnd !== this.endShown[0] || outEnd !== this.endShown[1]) { this.endShown = [inEnd, outEnd]; this.dirty = true; } }
  /** The ends' arrows now: the portal venule's and the central vein's place (µm along from the middle) and the arrow's size. */
  get ends(): readonly [number, number, number] {
    const s = this.screen;
    return s ? endsFor(s.k, s.along, this.portrait, UM.lum * this.cur.lum, s.centre) : [END_DEFAULT[0], END_DEFAULT[1], Math.min(END_DEFAULT[2], UM.lum * this.cur.lum * 0.95)];
  }

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
    // the wedged column's wash (2D: only while a slide asks for it, and once the view has landed; it begins afresh each time it lands)
    const wantWash = this.washOn && this.dive == null;
    if (!wantWash) this.washLand = -1; else if (this.washLand < 0) this.washLand = Math.max(now, this.washAt);
    const wk = wantWash ? washProgress(now - this.washLand, this.reduce) : 0;
    if (wk !== this.washK) { this.washK = wk; moving = true; }
    if (wantWash && wk < 1) moving = true;
    const run = !this.reduce && this.trafficSpeed > 0, sec = dt / 1000;
    // (the traffic runs at trafficSpeed: the 3D scene asks for a little more pace, Mohammad 20 Nov 2026 "a little faster")
    const tsec = sec * this.trafficSpeed;
    this.traffic.setDt(run ? tsec : 0);
    if (run) { this.traffic.stepMovers(tsec); this.lifeT += tsec; moving = true; }
    this.spriteCount = this.traffic.sprites();
    return moving;
  }

  // ---- places, for the names ----------------------------------------------------------------------------------------------------

  /** Scene points (this view's own units, y up, turned with the plane: a portrait screen's names stand on the sinusoid as it runs top to bottom) of the places tags name (the 2D app's captions): 'in' (blood arrives, portal end), 'out' (to the central vein), 'lumen', 'fen', 'disse', 'hep', 'hsc', 'kup', 'lymph', 'canaliculus'. */
  anchor(name: string, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
    const g = this.g, geo = this.geo;
    const at = (xum: number, yDown: number): [number, number, number] => framePoint(xum, yDown, U, 0);
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
      in: at(this.ends[0], 0), out: at(this.ends[1], 0), lumen: at(0, 0),
      // (2D's layouts: wide, the space of Disse is named in the upper plate and the hepatocyte in the lower, beside the lymph (disseR, hepR); tall, Disse is on the left (y > 0) and the hepatocyte in the right plate with the stellate cell)
      fen: at(pore(10), -(g.wallIn(10) - UM.endo / 2)), disse: at(24, (this.portrait ? 1 : -1) * (g.wallIn(24) + g.disseW(24) * 0.5)),
      hep: at(8, (this.portrait ? -1 : 1) * (g.hepIn(8) + UM.hep * 0.7)), hsc: at(geo.xs, -(g.wallIn(geo.xs) + g.disseW(geo.xs) * 0.5 + 0.8)),
      kup: at(geo.xk, g.halfW(geo.xk) - 2), lymph: at(-VIS + 6, g.hepIn(-VIS) + 1.2), canaliculus: at(cellEdge(1, SEED.plateUp), -(g.hepIn(0) + UM.hep / 2)),
    };
    const p = P[name] ?? at(0, 0);
    out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
    return out;
  }

  /** The eased state now (what the 3D sinusoid draws). */
  get state(): Readonly<Cur> { return this.cur; }
  /** How far the blood has run (µm, the traffic's clock: the streaks ride it). */
  get flowRun(): number { return this.traffic.flowX; }
  /** The cells' own slow life (seconds, run at the traffic's pace: it eases to a stop with pause and stands still with reduced motion): the Kupffer cell's arms and the microvilli sway on it. */
  get lifeTime(): number { return this.lifeT; }
  private lifeT = 0;
  /** The albumin out now: x, y (µm, y down), radius, alpha, kind for each of `spriteCount`. */
  get albumin(): Float32Array { return this.traffic.pts; }
  /** The palette for a scheme (2D's sinusoid tokens for the look). */
  colours(dark: boolean): Record<string, unknown> { return this.pal.palette(dark); }
  /** How much each end's name shows now. */
  get endShownNow(): readonly [number, number] { return this.endShown; }
  /** How open the lining's fenestrae are now (0 to 1, eased): the Fenestrae name reads it as "16% open". */
  get porosity(): number { return this.cur.por; }
  /** The widths and places the names stand on (2D's halfW, wallIn, hepIn, disseW and the fixed cells), as the shader draws them now. */
  get nameGeom(): NameGeom { return { xs: this.geo.xs, xk: this.geo.xk, pores: this.geo.pores, ...this.g }; }
  /** 2D's names laid out for this screen (names.ts): the label layer gives the plane's place on screen, the free room and a measure; the stellate cell's state is the view's own. Level names, leaders, µm named. */
  names(inp: Omit<NamesInput, 'g' | 'act' | 'portrait'>): NamePlacement[] { return layoutNames({ ...inp, g: this.nameGeom, act: this.cur.act, portrait: this.portrait }); }

  /** A point of this view's frame (what `anchor` returns, plane units) as micrometres along and across (y down, as the shader has it), whatever the plane's turn: for hits. */
  micrometres(fx: number, fy: number): { x: number; y: number } { return planePoint(fx, fy, U, 0); }

  warm(gl: { compile?: (s: Group, c: unknown) => void }, camera: unknown): void {
    const was = this.group.visible;
    this.group.visible = true;
    try { gl.compile?.(this.group, camera); } finally { this.group.visible = was; }
  }

  dispose(): void { /* (nothing of its own on the GPU) */ }
}
