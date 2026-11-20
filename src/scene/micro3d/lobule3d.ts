// The lobule as a true 3D scene (Settings > Figure depth > 3D lobule and sinusoid; Mohammad, 20 Nov 2026: "You just rebuild in 3D then. And make it perfect"). The same lobule 2D draws
// (lobule-zoom.js build, ported in lobule/geometry.ts: the same seed, cells, courses and triads), built as solid, cel-shaded shapes in the flat lobule's own frame, so its shots, names,
// taps and dive fit unchanged:
//
//   the plates     every hepatocyte of 2D's cords as a raised tile with a rounded bevel (2D's size, angle, zone tone, the dead cells of zone 3 in congestion, the cirrhotic jitter), a domed
//                  nucleus each, on the hexagon's ground in 2D's gap colour
//   the vessels    the sinusoids, cross-links, inlet venules, the arterioles' twigs, the terminal lymphatics and the canaliculi as smooth round tubes at 2D's own widths (widths.ts), lying in
//                  the grooves between the plates, in the lens's colour along their length (the flat view's inkAt); the space of Disse a pale sleeve under each sinusoid
//   the mouths     the central vein, the tracts' portal venule, arteriole, ductule and lymphatic as round openings going down into the slab (a lip, a wall, a dark floor), 64 segments
//   the marks      what 2D paints over the cells beyond the cells themselves (the nutmeg of congestion, the Zones, Disse's collagen, the activated stellate cells, the septa, the tracts'
//                  and the vein's collagen) is 2D's own painter (lobule-paint.js) on one plate laid over the tiles, with the cells left out, so no disease mark is lost
//
// It reads the flat view's state (eased values, layers, widths as they swell and shrink, lens colours), so the two never disagree: this file draws, the flat view keeps the model, the
// names, the taps and the clock. Flow marks: 2D's chevrons ride on the flat view's own tubes, which are hidden here, so this scene shows none (the blood's colour along each sinusoid
// still runs from the portal's to the central vein's).
import { useSettings } from '../../state/settings.ts';
import { ShapeUtils, Vector2, CanvasTexture, Color, CustomBlending, DataTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, type BufferAttribute } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { CelObject } from '../materials/cel.ts';
import type { LobuleView } from '../lobule/view.ts';
import type { LookId } from '../../looks/looks.ts';
import type { Course, LobuleNet, P2 as LP2 } from '../lobule/geometry.ts';
import { LOBULE_R } from '../lobule/shots.ts';
import { AN_K, DISC_R, LT_R, RS_N, inletRadius, sinRadius, twigR } from '../lobule/widths.ts';
/** The space of Disse's band and the widest bile canaliculus (lobule radii), which shrink to nothing as their layers go off (2D: lobule-zoom-field.js, lobule-bile.js). */
const LYMPH_DISSE_R = 0.0132, BILE_BC_R = 0.0036;
import { CASING } from '../vessels/cel-ink.ts';
import { type InkContext, type Seg, inkAt, sinW } from '../lobule/ink.ts';
import { lookColours } from '../lobule/lz-colours.ts';
import { LOBULE_PALETTES } from '../lobule/tones.ts';
import { cordToneInto } from '../lobule/from2d/lobule-look.generated.js';
import { paintWorldInto, useTokens } from '../lobule/from2d/lobule-paint.generated.js';
import { LOBULE_PLATE_FS, LOBULE_PLATE_VS, PLATE_BOX, PLATE_PX, PLATE_S, type PlateState, plateInput, plateKey, plateShape } from '../lobule/plate.ts';
import { tissueInk } from '../lobule/cel.ts';
import { hexToRgb01 } from '../lenses/oklab.ts';
import { WASH_AMOUNT, washAmount, washFront } from '../lobule/wash.ts';
/** How quickly the wash comes in and goes away (ms, an exponential ease). */
const WASH_EASE_MS = 350;
import { CEL_STYLE } from '../cel-style.ts';
import { buildBile } from '../lobule/bile.ts';
import { MeshBuilder, MicroPart, type P2, type RGB, ellipsoid, microMaterials, pillow, tube } from './cel3d.ts';

const R = LOBULE_R;
/** Heights (local units, toward the viewer; R = 3): the hexagon's ground, the tiles' tops and bottoms, the tubes' centre line, Disse's sleeve, the mouths' lips and depth, the marks' plate. */
export const LZ = { ground: -0.03, cellTop: 0.026, cellBot: -0.05, tube: 0.008, disse: -0.012, lip: 0.03, mouthDepth: 0.22, marks: 0.031 } as const;
/** Segments round a tube and round a mouth. */
export const TUBE_SEG = 10, MOUTH_SEG = 64;
/** The share of a tile's short side its bevel takes. */
const BEVEL = 0.28;
/** 2D's three dark shares of a sinusoid kind that congestion widens (the flat view's CONG_Z3). */
const BILE_ID = 2_000_000;
/** The vessels that run over the plates (the sinusoids, their cross-links, the arteriole's twigs) lie with their axis at the tiles' tops: lower, a thin one was buried under every tile it
 *  crossed and showed only in the gaps, as short pieces floating between the cords (Mohammad, 20 Nov: "disconnected vessels in the middle"). */
export const OVER_Z = LZ.cellTop + 0.002;
/** The tract's arteriole and ductule openings are drawn this much larger than 2D's dots, so each corner reads as one triad: venule, artery and duct side by side (Mohammad, 20 Nov). */
const HA_K = 1.7, BD_K = 1.4;
/** The bile canaliculi and the canals of Hering: hairlines (radius, local units at R = 1) lying in the clefts between cells, not tubes as wide as a sinusoid ("bile is a mess"). */
const CANALICULUS_R = 0.0016, HERING_R = 0.003;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): [number, number, number] => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];

/** A 2D lobule point (lobule radii, y down) in the local frame, at height z. */
const at3 = (p: LP2, z: number): [number, number, number] => [p[0] * R, -p[1] * R, z];

/** What this scene reads of the lobule's host (lobule/view.ts: the network, the eased state, the layers' fades, the look, the field). */
interface Flat {
  net: LobuleNet;
  field: { readonly wideNow: number };
  cur: { fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number; flow: number; portal: number; art: number; lymphRate: number; seal: number };
  layers: { lymph: boolean; zones: boolean; bile: boolean };
  lyFade: number; bileFade: number; zoneFade: number;
  look: LookId;
  isVisible: boolean;
  group: Group;
  sinScale(k: 's0' | 's1' | 's2' | 'an'): number;
  cvRadiusNow: number;
  /** The wedge's wash, 0..1 (0 when no slide runs it). */
  readonly washProgress: number;
  inkContext(): InkContext | null;
}

/** How a part's vertices take the lens's colour: a segment kind and each vertex's place along it (w) and brightness (k); or a fixed tone with the brightness only. */
interface Coloured { part: MicroPart; seg: Seg | null; w: Float32Array; k: Float32Array }

export class Lobule3D {
  readonly group = new Group();
  private readonly flat: Flat;
  private readonly fade = { value: 1 };
  private on = false;
  private hidLobule = false;
  private cellKey = '';
  private inkKey = '';
  private lookKey = '';
  private marksKey = '';
  // parts
  private readonly ground: MicroPart;
  private readonly cells: MicroPart;
  private readonly nuclei: MicroPart;
  private readonly sin: Record<'s0' | 's1' | 's2' | 'an', MicroPart>;
  private readonly inlets: MicroPart;
  private readonly twigs: MicroPart;
  private readonly lt: MicroPart;
  private readonly disse: MicroPart;
  private readonly bile: MicroPart;
  private readonly mouthPv: MicroPart;
  private readonly mouthHa: MicroPart;
  private readonly mouthBd: MicroPart;
  private readonly mouthLv: MicroPart;
  private readonly mouthCv: MicroPart;
  private readonly coloured: Coloured[] = [];
  // the marks plate: 2D's painter with the cells left out
  private readonly marks: Mesh;
  private readonly marksMat: ShaderMaterial;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly tex: CanvasTexture | null;
  private readonly shape: ReturnType<typeof plateShape>;
  private readonly sins: { c: Course; r: number }[];
  /** How many times the marks were painted (tests: a state change paints once). */
  paints = 0;

  constructor(flat: LobuleView, shared: CelShared) {
    this.flat = flat as unknown as Flat;
    this.group.name = 'lobule3d';
    const res = shared.res, S = CEL_STYLE.MICRO;
    const mk = (name: string, o: Parameters<typeof microMaterials>[2] = {}) => new MicroPart(new MeshBuilder().build(), microMaterials(res, this.fade, { vertexColors: true, ...o }), `lobule3d/${name}`);
    this.ground = mk('ground', { ink: null, vertexColors: false });
    this.cells = mk('hepatocytes', { px: S.LINE_SMALL });
    this.nuclei = mk('nuclei', { ink: null });
    this.sin = { s0: mk('sinusoids-0', { px: S.LINE, flow: true }), s1: mk('sinusoids-1', { px: S.LINE, flow: true }), s2: mk('sinusoids-2', { px: S.LINE, flow: true }), an: mk('sinusoids-links', { px: S.LINE_SMALL, flow: true }) };
    this.inlets = mk('inlets', { px: S.LINE, flow: true });
    this.twigs = mk('arteriole-twigs', { px: S.LINE_SMALL * 0.8, flow: true });
    this.lt = mk('terminal-lymphatics', { px: S.LINE_SMALL * 0.8, flow: true });
    this.disse = mk('disse', { ink: null });
    this.bile = mk('canaliculi', { px: S.LINE_SMALL * 0.7, flow: true });
    this.mouthPv = mk('portal-venules', { px: S.LINE });
    this.mouthHa = mk('arterioles', { px: S.LINE_SMALL });
    this.mouthBd = mk('ductules', { px: S.LINE_SMALL });
    this.mouthLv = mk('lymphatics', { px: S.LINE_SMALL });
    this.mouthCv = mk('central-vein', { px: S.LINE });
    // the marks plate (above the tiles, under the vessels: drawn after the tiles with no depth test, the vessels after it)
    this.shape = { ...plateShape(this.flat.net), cells: [] };
    this.sins = this.flat.net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
    this.canvas = typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: PLATE_PX, height: PLATE_PX });
    this.tex = this.canvas ? new CanvasTexture(this.canvas) : null;
    if (this.tex) { this.tex.flipY = true; this.tex.premultiplyAlpha = true; this.tex.generateMipmaps = true; this.tex.minFilter = LinearMipmapLinearFilter; this.tex.magFilter = LinearFilter; this.tex.anisotropy = 4; }
    const blank = new DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
    this.marksMat = new ShaderMaterial({
      vertexShader: LOBULE_PLATE_VS, fragmentShader: LOBULE_PLATE_FS, uniforms: { map: { value: this.tex ?? blank }, opacity: { value: 1 }, ink: { value: new Color() } },
      transparent: false, depthWrite: false, depthTest: false, side: DoubleSide,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    const side = 2 * PLATE_BOX * R;
    this.marks = new Mesh(new PlaneGeometry(side, side), this.marksMat);
    this.marks.position.z = LZ.marks; this.marks.name = 'lobule3d/marks'; this.marks.frustumCulled = false;
    // draw order: the ground and the tiles, then the marks over them, then every vessel (depth-tested against the tiles)
    this.ground.renderOrder = -6; this.cells.renderOrder = -5; this.nuclei.renderOrder = -5; this.disse.renderOrder = -5;
    const vessels = [this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.inlets, this.twigs, this.lt, this.bile, this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv];
    // (the flat view's field of neighbour lobules is see-through and so draws after every solid part; the marks, drawn among the solids, were painted over by it outside the hexagon, which
    // cut the periportal scar off at the edge: Mohammad 20 Nov "it's clipped like at the hexagon". The marks and the vessels draw in the see-through list after the field instead, the vessels
    // still writing and testing depth, opaque as before)
    this.marksMat.transparent = true; this.marks.renderOrder = -2;
    for (const v of vessels) {
      v.renderOrder = -1;
      for (const m of [v.toonMesh, v.inkMesh]) if (m) { const mat = m.material as ShaderMaterial; mat.transparent = true; mat.depthWrite = true; }
    }
    for (const p of [this.ground, this.cells, this.nuclei, this.disse, ...vessels]) this.group.add(p.group);
    this.group.add(this.marks);
    this.buildVessels();
    this.group.visible = false;
  }

  get enabled(): boolean { return this.on; }

  /** One frame, after the flat lobule's own update. `on` is the Settings switch. True while anything of this scene changed. */
  update(on: boolean, under = 0, now = 0, rate = 1): boolean {
    const f = this.flat, changed = on !== this.on;
    this.on = on;
    // `under`: how far the camera has gone down onto the sinusoid (0 on the lobule, 1 landed). The lobule dissolves away as the sinusoid comes in (Mohammad: "Should fade when zooming"), and once
    // landed neither this scene nor the flat lobule is drawn: the lobule's solid tiles and tubes stand above the sinusoid's plane and would cut across it in the foreground
    // (and on the way in from the body it comes in as the field narrows onto it: the hex lobules tile the liver from afar, the neighbours resolve, then this lobule's own detail fades in until the
    //  landing, and the reverse on the way out; the field's breadth is the camera's distance against the lobule's framing, field.ts fieldWide)
    const come = 1 - f.field.wideNow;
    this.fade.value = (1 - under) * come; this.marksMat.uniforms.opacity!.value = (1 - under) * come;
    const shown = on && f.isVisible && under < 1;
    this.group.visible = shown;
    // (the whole lobule, its neighbouring field too: the sinusoid's own ground lies below the lobule's plane, so the field would show through the clefts between its cells)
    const hide = on && under >= 1 && f.isVisible;
    if (hide !== this.hidLobule) { this.hidLobule = hide; f.group.visible = !hide && f.isVisible; }
    if (hide) return changed;
    if (!shown) return changed;
    const look = f.look, c = f.cur;
    const q = (x: number) => Math.round(clamp(x || 0, 0, 1) * 32);
    const ck = `${look}|${q(c.congU)}|${q(c.septU)}`;
    if (ck !== this.cellKey) { this.cellKey = ck; this.buildCells(look, c.congU, c.septU); }
    if (look !== this.lookKey) { this.lookKey = look; this.applyLook(look); }
    this.stepInk();
    this.stepMarks();
    // widths and layers as the state has them now: each sinusoid swells and shrinks with congestion and capillarization (inflate, the absolute change of its radius), the lymph and the bile
    // shrink away with their layers and only then hide
    const sinR = (k: 's0' | 's1' | 's2' | 'an') => (k === 'an' ? RS_N * AN_K : RS_N * 1.15) * R;
    const inf = (p: MicroPart, v: number) => { p.mats.toon.uniforms.inflate!.value = v; };
    for (const k of ['s0', 's1', 's2', 'an'] as const) inf(this.sin[k], sinR(k) * (f.sinScale(k) - 1));
    const lyF = f.lyFade, biF = f.bileFade;
    inf(this.lt, -LT_R * R * (1 - lyF)); inf(this.disse, -LYMPH_DISSE_R * R * (1 - lyF) + 0.004 * c.seal); inf(this.bile, -BILE_BC_R * R * (1 - biF));
    const lymphOn = lyF > 0.002, bileOn = biF > 0.002;
    this.lt.group.visible = lymphOn; this.disse.group.visible = lymphOn; this.mouthLv.group.visible = lymphOn; this.bile.group.visible = bileOn;
    // the central vein opens and narrows with congestion and its collagen (the flat view's radius)
    const kcv = f.cvRadiusNow / DISC_R.cv;
    this.mouthCv.group.scale.set(kcv, kcv, 1);
    this.buildGround(kcv, lymphOn);
    const washing = this.stepWash(now);
    return this.stepFlow(now, rate, lymphOn, bileOn) || washing || changed;
  }

  // ---- the flow marks (quiet chevrons inside each vessel, streaks in the blood; they stop at the central vein's mouth and with the simulation) ------------------------

  // ---- the wedge's wash (HVPG and PPG decks, slide 5): amber over the blood's own vessels, the sinusoids and the central vein, in a front from the centre out ----------------

  private washAt = -1;
  /** The wash's strength as drawn, eased toward the slide's (it comes in and goes away, never at once), and the front it was last drawn at. */
  private washShown = 0;
  private washFrontNow = 0;
  private stepWash(now: number): boolean {
    const dt = this.washAt < 0 ? 0 : clamp(now - this.washAt, 0, 100);
    this.washAt = now;
    const k = this.flat.washProgress, goal = k > 0 ? washAmount(k) / WASH_AMOUNT : 0;
    if (k > 0) this.washFrontNow = washFront(k, this.flat.net.rcv0);
    const was = this.washShown;
    this.washShown = Math.abs(goal - was) < 1e-3 ? goal : was + (goal - was) * (1 - Math.exp(-dt / WASH_EASE_MS));
    if (this.washShown === 0 && was === 0) return false;
    const rgb = hexToRgb01((LOBULE_PALETTES[this.flat.look].tones as Record<string, string>).amber!) as RGB, a = this.washShown * this.fade.value;
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.mouthCv]) p.setRadialWash(a, this.washFrontNow, R, rgb);
    return this.washShown !== goal;
  }

  private flowAt = -1;
  /** The drawing buffer's pixel ratio (the scene's render asks the renderer): the heads and streaks are sized in device px. */
  private dpr = 2;
  setDpr(dpr: number): void { this.dpr = dpr || 2; }
  private readonly flowT = { blood: 0, lymph: 0, bile: 0 };
  private stepFlow(now: number, rate: number, lymphOn: boolean, bileOn: boolean): boolean {
    const dt = this.flowAt < 0 ? 0 : clamp((now - this.flowAt) / 1000, 0, 0.1);
    this.flowAt = now;
    const f = this.flat, q = Math.sqrt(clamp(f.cur.flow || 0, 0.05, 2.5));
    // (local units a second: the blood's chevrons about a cell length every half second at a normal flow, the lymph and the bile slower)
    // (`rate` is the scene's one eased pause/play rate, 0..1: Pause eases the flow to a stop and Play eases it back up, never at once)
    const k = clamp(rate, 0, 1) * dt;
    this.flowT.blood += k * 0.11 * q; this.flowT.lymph += k * 0.05; this.flowT.bile += k * 0.035;
    const W: RGB = [1, 1, 1], soft = (k: number) => k * this.fade.value, dpr = this.dpr;
    // every fluid is seen to move at the fit (Mohammad, 20 Nov 2026): the blood's dark heads (few and small on these thin tubes, the shader's screen rules) and THE ONE STREAK in every vessel, the blood's
    // only while Settings > Blood streaks is on (off: chevrons only); the lymph's and the bile's always, in their own tones
    const bs = useSettings.getState().particles ? soft(0.6) : 0;   // (quiet: sleek lanes a shade off the lumen, never bold white dashes, Mohammad 20 Nov 2026 "should be more sleek")
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2]) p.setFlow(this.flowT.blood, 0.16, W, soft(1), bs, 0, 0.0082 * R, true, dpr);
    this.sin.an.setFlow(this.flowT.blood, 0.12, W, soft(1), bs, 0, 0.0043 * R, true, dpr);
    this.inlets.setFlow(this.flowT.blood, 0.3, W, soft(1), bs, 0, 0.012 * R, true, dpr);
    this.twigs.setFlow(this.flowT.blood * 1.6, 0.1, [1, 0.88, 0.86], soft(1), bs, 0, 0.006 * R, true, dpr);
    this.lt.setFlow(this.flowT.lymph, 0.12, W, soft(0.4), soft(0.8), 0, LT_R * R, false, dpr);
    this.bile.setFlow(this.flowT.bile, 0.07, [1, 0.97, 0.7], soft(0.55), soft(0.85), 1, 0.004 * R, false, dpr);
    void lymphOn; void bileOn;
    return rate > 0.001;
  }

  // ---- colours -------------------------------------------------------------------------------------------------------------------

  private applyLook(look: LookId): void {
    const L = lookColours(look), P = LOBULE_PALETTES[look].tones;
    const gap = L.rgb01('--og-liver-2'), bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg');
    this.ground.setTint(groundOf(bg, gap, L.dark));
    const ink = tissueInk(look);
    // the hepatocytes keep the tissue's casing; every vessel (sinusoids, inlets, twigs, lymphatics, canaliculi, the tract's mouths, the central vein) the Anatomy's dark line of its own colour
    this.cells.setInk(ink);
    const cas = CASING[look].rgb.map((v) => v / 255);
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.twigs, this.lt, this.bile, this.mouthCv, this.mouthLv, this.mouthPv, this.inlets, this.mouthHa, this.mouthBd]) p.setVesselInk(cas);
    // the parts of one tone (the lens does not colour them, as in 2D)
    const tone = (k: string) => hexToRgb01((P as Record<string, string>)[k]!);
    this.twigs.setTint(tone('artery')); this.mouthHa.setTint(tone('artery'));
    this.mouthBd.setTint(tone('bile')); this.bile.setTint(tone('bile'));
    this.lt.setTint(tone('lymph')); this.mouthLv.setTint(tone('lymph'));
    this.disse.setTint(tone('disse'));
    (this.marksMat.uniforms.ink!.value as Color).setRGB(ink[0], ink[1], ink[2]);
    this.inkKey = '';
  }

  /** The lens's colours along the vessels (2D's inkOf: the portal venule's at the edge to the central vein's), rewritten when the lens, the look or a rounded pressure changes. */
  private stepInk(): void {
    const ctx = this.flat.inkContext();
    if (!ctx) return;
    const m = ctx.model, key = `${ctx.lens}|${ctx.look}|${m.P1.toFixed(1)}|${m.P2.toFixed(1)}|${m.P3.toFixed(1)}|${(m.oxy ?? []).map((x: number) => x.toFixed(2)).join(',')}|${ctx.fibSin.toFixed(2)}|${ctx.ref ? 'r' : ''}`;
    if (key === this.inkKey) return;
    this.inkKey = key;
    const N = 64, lut = new Float32Array((N + 1) * 3), tmp: [number, number, number] = [0, 0, 0];
    for (const e of this.coloured) {
      const col = e.part.geometry.getAttribute('color') as BufferAttribute | undefined;
      if (!col) continue;
      const arr = col.array as Float32Array;
      if (e.seg) for (let i = 0; i <= N; i++) { inkAt(ctx, e.seg, i / N, tmp); lut[i * 3] = tmp[0]; lut[i * 3 + 1] = tmp[1]; lut[i * 3 + 2] = tmp[2]; }
      for (let v = 0; v < e.k.length; v++) {
        const k = e.k[v]!;
        if (e.seg) { const j = Math.round(clamp(e.w[v]!, 0, 1) * N) * 3; arr[v * 3] = lut[j]! * k; arr[v * 3 + 1] = lut[j + 1]! * k; arr[v * 3 + 2] = lut[j + 2]! * k; }
        else { arr[v * 3] = k; arr[v * 3 + 1] = k; arr[v * 3 + 2] = k; }
      }
      col.needsUpdate = true;
    }
  }

  // ---- the tiles -----------------------------------------------------------------------------------------------------------------

  /** Every hepatocyte as 2D paints it (lobule-paint.js paintLobule): its colour by zone and tone, zone 3's cells dead in congestion, the plates thickening and losing order in cirrhosis. */
  private buildCells(look: LookId, cu: number, sj: number): void {
    const L = lookColours(look), dark = L.dark, net = this.flat.net;
    const gap = L.rgb01('--og-liver-2'), bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg'), ground = groundOf(bg, gap, dark);
    const base = cellBase(look), nucInk = L.rgb01('--lz-nodule-ink'), nucA = L.alpha('--lz-nodule-ink');
    const cb = new MeshBuilder(), nb = new MeshBuilder(), TONE: number[] = [0, 0, 0], CT: number[] = [0, 0, 0];
    for (const k of net.cells) {
      const z3 = k.q < 0.4, dead = z3 && cu > 0.12 && k.drop < cu * (1.25 - k.q * 1.6);
      const t = 0.88 + 0.12 * k.tone;
      let fill: RGB, alpha: number;
      if (dead) { fill = dark ? [0.42, 0.33, 0.3] : [0.93, 0.86, 0.72]; alpha = 0.6; }
      else { for (let i = 0; i < 3; i++) CT[i] = base[i]! * t + (1 - t) * (dark ? 0.15 : 1) * 0.3; fill = cordToneInto(TONE, CT, k.q, dark) as number[]; alpha = dark ? 0.8 : 0.92; }
      const col = mix3(ground, fill, alpha);
      const dz = sj * Math.min(k.l, k.w) * 0.45, cx = k.x + k.jx * dz, cy = k.y + k.jy * dz, a = k.a + k.ja * sj * 0.9;
      const lw = (dead ? k.l * 0.7 : k.l) * (1 + 0.12 * sj), ww = (dead ? k.w * 0.7 : k.w) * (1 + 0.3 * sj);
      const outline = roundRect(cx, cy, lw, ww, Math.min(lw, ww) * 0.38, a);
      const top = dead ? LZ.cellTop * 0.4 : LZ.cellTop;
      pillow(cb, outline, top, LZ.cellBot, Math.min(lw, ww) * R * BEVEL, col, 3);
      if (!dead) {
        // the nucleus: 2D's dot at nu along the cell, a low dome in the cell's colour under the nodule ink
        const nr = Math.max(0.0023, ww * 0.16) * R, ca = Math.cos(a), sa = Math.sin(a);
        const nx = cx + k.nu * lw * ca, ny = cy + k.nu * lw * sa;
        const nc = mix3(col, nucInk, Math.min(1, nucA * 2.4));
        ellipsoid(nb, nx * R, -ny * R, top - nr * 0.55, nr, nr, nr * 0.8, 0, nc, 12, 6);
      }
    }
    cb.build(this.cells.geometry); nb.build(this.nuclei.geometry);
    this.cells.setTint([1, 1, 1]); this.nuclei.setTint([1, 1, 1]);
  }

  /** The hexagon's ground (2D: the lobule filled in the gap colour at 1.015), with a hole under every mouth so the openings go down into the slab. */
  private groundKey = '';
  private buildGround(kcv: number, lymph: boolean): void {
    const key = `${Math.round(kcv * 50)}|${lymph}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const net = this.flat.net, crn = net.corners.map((p) => new Vector2(p[0] * 1.015 * R, -p[1] * 1.015 * R));
    if (ShapeUtils.isClockWise(crn)) crn.reverse();
    const holes: Vector2[][] = [];
    const hole = (c: Course, r: number) => {
      const p = c.pts[Math.floor(c.pts.length / 2)]!, h: Vector2[] = [];
      for (let s = 0; s < 40; s++) { const a = -(s / 40) * Math.PI * 2; h.push(new Vector2(p[0] * R + Math.cos(a) * r * R * 0.97, -p[1] * R + Math.sin(a) * r * R * 0.97)); }
      holes.push(h);
    };
    for (const c of net.courses) {
      if (c.kind === 'pv') hole(c, DISC_R.pv); else if (c.kind === 'ha') hole(c, DISC_R.ha * HA_K); else if (c.kind === 'bd') hole(c, DISC_R.bd * BD_K);
      else if (c.kind === 'lv' && lymph) hole(c, DISC_R.lv); else if (c.kind === 'cv') hole(c, DISC_R.cv * kcv);
    }
    const tris = ShapeUtils.triangulateShape(crn, holes), all = [crn, ...holes].flat();
    const g = new MeshBuilder();
    for (const v of all) g.v(v.x, v.y, LZ.ground, 0, 0, 1);
    for (const [a, b, c] of tris) g.tri(a!, b!, c!);
    g.build(this.ground.geometry);
  }

  // ---- the marks plate -----------------------------------------------------------------------------------------------------------

  /** 2D's painter with no cells: the nutmeg, the Zones, Disse's collagen, the stellate cells, the septa, the tracts' and the vein's collagen, the limiting plate. Painted once per state step. */
  private stepMarks(): void {
    const f = this.flat, c = f.cur;
    const s: PlateState = { congU: c.congU, septU: c.septU, fibSin: c.fibSin, act: c.act, fibPre: c.fibPre, fibPost: c.fibPost };
    const zones = f.layers.zones;
    const key = `${plateKey(s, f.look)}|${zones ? 'z' : ''}`;
    if (key === this.marksKey) return;
    this.marksKey = key;
    this.paints++;
    if (!this.canvas || !this.tex) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const L = lookColours(f.look);
    useTokens((name: string, a?: number | string) => L.tk(name, a));
    const q = (x: number) => Math.round(clamp(x, 0, 1) * 32) / 32;
    const input = { ...plateInput(this.shape, this.sins, DISC_R.cv, { congU: q(s.congU), septU: q(s.septU), fibSin: q(s.fibSin), act: q(s.act), fibPre: q(s.fibPre), fibPost: q(s.fibPost) }, f.look), zonesOn: zones };
    const B = PLATE_BOX * PLATE_S, n = PLATE_PX, sc = n / (2 * B);
    paintWorldInto(skipFirstFills(ctx, 2), n, sc, -B, -B, input);
    this.tex.needsUpdate = true;
  }

  // ---- the vessels (built once; their widths follow the state through `inflate`, their colours through stepInk) -----------------

  private buildVessels(): void {
    const net = this.flat.net;
    const by = (...k: Course['kind'][]) => net.courses.filter((c) => k.includes(c.kind));
    const coloured = (part: MicroPart, b: MeshBuilder, seg: Seg | null, w: number[], k: number[]) => {
      b.build(part.geometry);
      this.coloured.push({ part, seg, w: Float32Array.from(w), k: Float32Array.from(k) });
      part.setTint([1, 1, 1]);
    };
    /** Tubes along courses: radius per sample, colour place per sample (w), brightness 1. */
    const tubes = (cs: Course[], radius: (c: Course, i: number) => number, w: (c: Course, i: number) => number, z: number = LZ.tube) => {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [];
      for (const c of cs) {
        const pts = c.pts.map((p) => at3(p, z));
        const before = b.count;
        tube(b, pts, (i) => Math.max(1e-4, radius(c, i) * R), [1, 1, 1], TUBE_SEG, true);
        // (tube() writes the rings in order, then the two caps: the first cap's rings are the first sample's, the last's the last's)
        const ringVerts = c.pts.length * TUBE_SEG, capVerts = (b.count - before - ringVerts) / 2;
        for (let i = 0; i < c.pts.length; i++) for (let s = 0; s < TUBE_SEG; s++) { W.push(w(c, i)); K.push(1); }
        for (let v = 0; v < capVerts; v++) { W.push(w(c, 0)); K.push(1); }
        for (let v = 0; v < capVerts; v++) { W.push(w(c, c.pts.length - 1)); K.push(1); }
        flowAux(b, before, pts, ringVerts, capVerts, c.id * 0.137, (i) => (c.kind[0] === 's' || c.kind === 'an') && c.rho[i]! < DISC_R.cv * 1.6);
      }
      return { b, W, K };
    };
    const sinR = (c: Course, i: number) => sinRadius(c.kind as 's0' | 's1' | 's2' | 'an', c.rho[i]!);
    const sinWAt = (c: Course, i: number) => sinW(c.rho[i]!);
    for (const kind of ['s0', 's1', 's2', 'an'] as const) {
      // (a sinusoid ends inside the central vein's mouth: its last samples there are dropped, so it pours over the lip rather than lying across the opening)
      const cs = by(kind).map((c) => trimInside(c, DISC_R.cv * 0.78));
      const t = tubes(cs, sinR, sinWAt, OVER_Z);
      coloured(this.sin[kind], t.b, 'sin', t.W, t.K);
    }
    { const t = tubes(by('in'), (c, i) => inletRadius(i, c.pts.length, Math.hypot(c.pts[i]![0] - c.pts[0]![0], c.pts[i]![1] - c.pts[0]![1])), (c, i) => i / (c.pts.length - 1)); coloured(this.inlets, t.b, 'in', t.W, t.K); }
    { const t = tubes(by('tw'), (c, i) => twigR(i / (c.pts.length - 1), RS_N), () => 0, OVER_Z); coloured(this.twigs, t.b, null, t.W, t.K); }
    { const t = tubes(by('lt'), () => LT_R, () => 0); coloured(this.lt, t.b, null, t.W, t.K); }
    // the space of Disse: a flat pale sleeve under each sinusoid (2D's Wet Disse), no light of its own
    {
      const b = new MeshBuilder(), K: number[] = [], W: number[] = [], rly = 0.0132;
      for (const c of by('ly')) {
        const n = c.pts.length, r0 = b.count;
        for (let i = 0; i < n; i++) {
          const a = c.pts[Math.max(0, i - 1)]!, d = c.pts[Math.min(n - 1, i + 1)]!;
          let tx = d[0] - a[0], ty = -(d[1] - a[1]); const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const p = at3(c.pts[i]!, LZ.disse);
          b.v(p[0] - ty * rly * R, p[1] + tx * rly * R, p[2], 0, 0, 1, [1, 1, 1]); b.v(p[0] + ty * rly * R, p[1] - tx * rly * R, p[2], 0, 0, 1, [1, 1, 1]);
          K.push(1, 1); W.push(0, 0);
        }
        for (let i = 0; i < n - 1; i++) { const q = r0 + i * 2; b.quad(q, q + 2, q + 3, q + 1); b.quad(q, q + 1, q + 3, q + 2); }
      }
      coloured(this.disse, b, null, W, K);
    }
    // the Bile layer, laid out as 2D lays it (bile.ts, a port of lobule-bile.js): a channel beside each plate's sinusoid from a quarter of the way out, thickening outward, a short
    // canal of Hering square into a duct along the edge outside the lymphatic, each half edge's duct into its corner's ductule; 2D's radii; arrowheads toward the ductule
    {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [];
      buildBile(net).forEach((c, n) => {
        const pts = c.pts.map((p) => at3(p, LZ.cellTop + 0.001)), before = b.count;
        tube(b, pts, (i) => Math.max(2e-4, c.radius[i]! * R), [1, 1, 1], 6, true);
        for (let v = before; v < b.count; v++) { W.push(0); K.push(1); }
        const ringVerts = pts.length * 6;
        flowAux(b, before, pts, ringVerts, (b.count - before - ringVerts) / 2, n * 0.29, null, 6);
      });
      coloured(this.bile, b, null, W, K);
    }
    // the mouths: each end-on vessel (venule, arteriole, ductule, lymphatic, central vein) a round wall FULL of its own colour, never an empty cylinder (Mohammad 20 Nov 2026: "the blood vessels
    // and bile should not look like empty cyllindars, just filll them with the color")
    const mouths = (part: MicroPart, cs: Course[], r: number, seg: Seg | null, vessel = false, top?: number) => {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [];
      for (const c of cs) {
        const p = c.pts[Math.floor(c.pts.length / 2)]!;
        mouth(b, p[0] * R, -p[1] * R, r * R, LZ.lip, LZ.mouthDepth * Math.min(1, r / DISC_R.pv), K, MOUTH_SEG, vessel, top);
      }
      for (let v = 0; v < b.count; v++) W.push(seg === 'cv' ? 1 : 0);
      coloured(part, b, seg, W, K);
    };
    // each pool's top: a hair above the tallest tube that runs into it (the inlets into the venule, the twigs into the arteriole, the canals of Hering into the ductule, the terminal
    // lymphatics into the lymphatic, the sinusoids into the central vein), so a tube that reaches it is lost inside it and none runs over it
    const POUR = 1.04, N_IN = by('in')[0]?.pts.length ?? 40;
    mouths(this.mouthPv, by('pv'), DISC_R.pv, 'pv', true, (LZ.tube + inletRadius(0, N_IN, 0) * R) * POUR);
    mouths(this.mouthHa, by('ha'), DISC_R.ha * HA_K, null, true, (OVER_Z + twigR(0, RS_N) * R) * POUR);
    mouths(this.mouthBd, by('bd'), DISC_R.bd * BD_K, null, true, (LZ.cellTop + 0.001 + 0.0078 * R) * POUR);
    mouths(this.mouthLv, by('lv'), DISC_R.lv, null, true, (LZ.tube + LT_R * R) * POUR);
    mouths(this.mouthCv, by('cv'), DISC_R.cv, 'cv', true, (OVER_Z + sinRadius('s2', DISC_R.cv) * R) * POUR);
  }

  /** Vertex count of everything this scene draws (tests and the budget). */
  get vertexCount(): number {
    let n = 0;
    for (const p of [this.ground, this.cells, this.nuclei, this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.inlets, this.twigs, this.lt, this.disse, this.bile, this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv]) n += p.geometry.getAttribute('position')?.count ?? 0;
    return n;
  }
  /** The parts (tests). */
  get partsForTest(): MicroPart[] { return [this.ground, this.cells, this.nuclei, this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.inlets, this.twigs, this.lt, this.disse, this.bile, this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv]; }
  /** Builds the tiles for a look and state without the flat view's frame (tests). */
  buildForTest(look: LookId, congU = 0, septU = 0): void { this.buildCells(look, congU, septU); this.applyLook(look); this.buildGround(1, true); }

  dispose(): void {
    for (const p of this.partsForTest) p.dispose();
    this.marks.geometry.dispose(); this.marksMat.dispose(); this.tex?.dispose();
  }
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------------

/** 2D's hexagon fill under the cells: the page and the gap colour mixed (MIXC), then the gap laid over at half. */
function groundOf(bg: RGB, gap: RGB, dark: boolean): [number, number, number] {
  const mixc = mix3(bg, gap, 0.55);
  return mix3(mixc, gap, dark ? 0.55 : 0.5);
}
/** 2D's cell base: the liver's first tone (Dark: 0.28 of the way from the gap to it). */
function cellBase(look: LookId): [number, number, number] {
  const L = lookColours(look), cell = L.rgb01('--og-liver-1'), gap = L.rgb01('--og-liver-2');
  return L.dark ? mix3(gap, cell, 0.28) : [cell[0], cell[1], cell[2]];
}

/** A rounded rectangle (2D's roundRect), lw along the cell's own axis by ww across, turned by a (2D's angle, y down), at (cx, cy) lobule radii: the outline in local units, y up. */
export function roundRect(cx: number, cy: number, lw: number, ww: number, rad: number, a: number, perCorner = 5): P2[] {
  const hx = lw / 2, hy = ww / 2, r = Math.min(rad, hx * 0.99, hy * 0.99), out: P2[] = [];
  const corners: [number, number, number][] = [[hx - r, hy - r, 0], [-hx + r, hy - r, Math.PI / 2], [-hx + r, -hy + r, Math.PI], [hx - r, -hy + r, Math.PI * 1.5]];
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const [ox, oy, a0] of corners) for (let i = 0; i < perCorner; i++) {
    const t = a0 + (i / (perCorner - 1)) * Math.PI / 2, u = ox + Math.cos(t) * r, v = oy + Math.sin(t) * r;
    const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
    out.push([x * R, -y * R]);
  }
  return out;
}

/** A course without its samples closer to the centre than `r` (lobule radii): a sinusoid stops at the central vein's lip. */
function trimInside(c: Course, r: number): Course {
  let n = c.pts.length;
  while (n > 2 && Math.hypot(c.pts[n - 1]![0], c.pts[n - 1]![1]) < r) n--;
  return n === c.pts.length ? c : { ...c, pts: c.pts.slice(0, n), rho: c.rho.slice(0, n) };
}

/** A round opening at (x, y) of radius r going down into the slab: a rounded lip, the wall inside it and a dark floor. `K` gets each vertex's brightness (lip 1, wall deeper, floor deepest). */
export function mouth(b: MeshBuilder, x: number, y: number, r: number, zTop: number, depth: number, K: number[], seg = MOUTH_SEG, vessel = false, top?: number): void {
  // a vessel cut end on (the central vein, the tract's venule, arteriole, ductule and lymphatic): a solid round pool FULL to the brim with its own colour, its top flush with the tubes
  // that join it (`top`), so they run into it and are lost in it, with no rim and no drop (Mohammad 20 Nov 2026: "fill to the brim, without noticable drop in depth", "blend better")
  if (vessel) {
    const zT = top ?? zTop, lip = Math.min(Math.max(r * 0.22, 0.004), (zT - LZ.ground) * 0.8), rows: number[] = [];
    const prof: [number, number, number, number][] = [[r, LZ.ground - 0.012, 1, 0], [r, zT - lip, 1, 0]];
    for (let i = 1; i <= 6; i++) { const t = (i / 6) * Math.PI / 2; prof.push([r - lip + lip * Math.cos(t), zT - lip + lip * Math.sin(t), Math.cos(t), Math.sin(t)]); }
    prof.push([(r - lip) * 0.5, zT, 0, 1]);
    for (const [pr, pz, nr, nz] of prof) {
      rows.push(b.count);
      for (let s = 0; s < seg; s++) { const a = (s / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); b.v(x + ca * pr, y + sa * pr, pz, ca * nr, sa * nr, nz, [1, 1, 1]); K.push(1); }
    }
    for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, seg, true);
    const c = b.v(x, y, zT, 0, 0, 1, [1, 1, 1]); K.push(1);
    const last = rows[rows.length - 1]!;
    for (let s = 0; s < seg; s++) b.tri(c, last + s, last + ((s + 1) % seg));
    return;
  }
  const kIn = [0.86, 0.74, 0.62, 0.55];
  const lip = Math.max(r * 0.2, 0.004), rows: number[] = [];
  // the profile from outside in: outer wall foot, over the lip, down the inner wall, the floor's edge
  const prof: [number, number, number, number, number][] = [];   // radius, z, normal r, normal z, brightness
  prof.push([r, Math.min(zTop - lip * 1.6, LZ.ground - 0.012), 1, 0, 1]);
  for (let i = 0; i <= 6; i++) { const t = (i / 6) * Math.PI, cr = Math.cos(t), sr = Math.sin(t); prof.push([r - lip / 2 + (lip / 2) * cr, zTop - lip / 2 + (lip / 2) * sr, cr, sr, 1]); }
  prof.push([r - lip, zTop - lip * 0.9, -1, 0, kIn[0]!]);
  prof.push([r - lip, zTop - depth * 0.5, -1, 0, kIn[1]!]);
  prof.push([r - lip, zTop - depth, -1, 0, kIn[2]!]);
  prof.push([r - lip * 1.0001, zTop - depth, 0, 1, kIn[3]!]);
  for (const [pr, pz, nr, nz, k] of prof) {
    rows.push(b.count);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      b.v(x + ca * pr, y + sa * pr, pz, ca * nr, sa * nr, nz, [1, 1, 1]); K.push(k);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, seg, true);
  // the floor
  const c = b.v(x, y, zTop - depth, 0, 0, 1, [1, 1, 1]); K.push(kIn[3]!);
  const last = rows[rows.length - 1]!;
  for (let s = 0; s < seg; s++) b.tri(c, last + s, last + ((s + 1) % seg));
}

/** The flow marks' place on a tube's vertices (tube() just wrote them from `before`): aux, how far along the path in its own direction (local units, from a per-tube offset), and
 *  aux2, across it (-1 .. 1, the in-plane side of the vertex's normal against the path); `hush(i)` true at a sample marks no chevron there (aux2 3: the central vein's mouth). */
export function flowAux(b: MeshBuilder, before: number, pts: readonly (readonly [number, number, number])[], ringVerts: number, capVerts: number, phase: number, hush: ((i: number) => boolean) | null, seg = TUBE_SEG): void {
  const m = pts.length, arc: number[] = [phase];
  for (let i = 1; i < m; i++) arc.push(arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const across = (v: number, i: number) => {
    const a = pts[Math.max(0, i - 1)]!, c = pts[Math.min(m - 1, i + 1)]!;
    let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = b.n[v * 3]!, ny = b.n[v * 3 + 1]!;
    return hush?.(i) ? 3 : -ty * nx + tx * ny;
  };
  for (let v = before; v < before + ringVerts; v++) { const i = Math.floor((v - before) / seg); b.aux.push(arc[i]!); b.aux2.push(across(v, i)); }
  for (let v = before + ringVerts; v < before + ringVerts + capVerts; v++) { b.aux.push(arc[0]!); b.aux2.push(across(v, 0)); }
  for (let v = before + ringVerts + capVerts; v < before + ringVerts + 2 * capVerts; v++) { b.aux.push(arc[m - 1]!); b.aux2.push(across(v, m - 1)); }
}

/** The Bile layer's courses, as the flat view builds them (lobule/view.ts channel()): the canaliculi midway between neighbouring sinusoids, and from each the first generation's canal of Hering to its tract's ductule. */
export function bileCourses(net: LobuleNet): { pts: LP2[]; canal: boolean }[] {
  const by = (k: Course['kind']) => net.courses.filter((c) => c.kind === k);
  const out: { pts: LP2[]; canal: boolean }[] = [];
  const mid = (a: Course, b: Course, i: number): LP2 => [(a.pts[i]![0] + b.pts[i]![0]) / 2, (a.pts[i]![1] + b.pts[i]![1]) / 2];
  const channel = (cs: Course[], i0: number, i1: number, canals: boolean) => {
    cs.forEach((a, k) => {
      const b = cs[(k + 1) % cs.length]!;
      if (a.tri === undefined) return;
      const pts: LP2[] = [];
      for (let i = i0; i <= i1; i++) pts.push(mid(a, b, i));
      if (Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 0.05) return;
      out.push({ pts, canal: false });
      if (canals) {
        const tr = net.triads[a.tri]!, p0 = pts[0]!, bd = tr.bd, pc: LP2[] = [];
        for (let j = 0; j <= 8; j++) { const u = j / 8; pc.push([bd[0] + (p0[0] - bd[0]) * u + tr.x * -0.012 * Math.sin(Math.PI * u), bd[1] + (p0[1] - bd[1]) * u + tr.y * -0.012 * Math.sin(Math.PI * u)]); }
        out.push({ pts: pc, canal: true });
      }
    });
  };
  channel(by('s0'), 2, 22, true); channel(by('s1'), 2, 20, false); channel(by('s2'), 3, 22, false);
  return out;
}
void BILE_ID;

/** A 2D context that ignores its first `n` fill() calls (2D's painter fills the hexagon's ground and the gap before the cells: the 3D tiles and ground stand for those). */
export function skipFirstFills(ctx: CanvasRenderingContext2D, n: number): CanvasRenderingContext2D {
  let left = n;
  return new Proxy(ctx, {
    get(t, p) {
      if (p === 'fill') return (...a: unknown[]) => { if (left > 0) { left--; return; } (t.fill as (...x: unknown[]) => void).apply(t, a); };
      const v = Reflect.get(t, p, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, p, v) { return Reflect.set(t, p, v, t); },
  });
}
