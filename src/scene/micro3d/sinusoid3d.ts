// The sinusoid as a true 3D scene (Settings > Figure depth > 3D lobule and sinusoid; Mohammad, 20 Nov 2026: "You just rebuild in 3D then. And make it perfect. It should look 100% the
// same if not better"). The same cut through one sinusoid that 2D paints (sinusoid-gl.js), built as solid, cel-shaded shapes in the same micrometres, so the names, the arrows, the taps and
// the camera of the host (sinusoid/view.ts, the model with no picture of its own) fit it unchanged:
//
//   the lumen       an open trough cut along the sinusoid, the blood's pressure colour, red cells and albumin riding in it (fastest in the middle, 2D's lanes)
//   the lining      a rounded bead of endothelium each side, its fenestrae real gaps through it (to Disse) in sieve plates of five that close as the lining capillarizes; the endothelial nuclei as lenses
//   Disse           a recessed channel between the lining and the plate (the lymph's colour), the hepatocytes' microvilli reaching into it, collagen and a basement membrane as they build up,
//                   the stellate cell lying in it (it swells and darkens as it activates and pinches the lumen), albumin that crossed the wall running back toward the portal tract
//   the plates      hepatocytes as raised tiles with a rounded bevel and a domed nucleus, bile canaliculi on their borders; the next sinusoid and plate beyond each, as 2D repeats them outward
//   the Kupffer cell on the lower lining, its arms in the lumen
//
// Everything reads the host's own state (its eased targets, palette, traffic, places), so the two can never disagree: this file draws, the host keeps the model, the names and
// the clock. Every place is 2D's (layout.ts and the copied widths); every colour is 2D's palette for the look. Nothing here is per-pixel painting: the shapes are meshes, cel shaded
// (cel3d.ts), and only the albumin, the red cells and the fenestrae's gap table are rewritten while the view is up.
import { useSettings } from '../../state/settings.ts';
import { DataTexture, Group, Matrix4, NearestFilter, RGBAFormat, UnsignedByteType, Vector4, type ShaderMaterial, type Vector3 } from 'three';
import type { CelShared } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import type { SinusoidView } from '../sinusoid/view.ts';
import { U } from '../sinusoid/view.ts';
import { CELL, SEED, SLOT, UM, canaliculusAt, cellOf, edgeAt, nucAt, poreAt, poreOpenness, underNucleus, type Pore } from '../sinusoid/layout.ts';
import { CEL_STYLE } from '../cel-style.ts';
import {
  MeshBuilder, MicroMany, MicroPart, type P2, type RGB, chaikin, ellipsoid, hazeUniforms, microMaterials, rawRGB, outlineNormals, pillow, placeAt, tube, unitRbc, unitRod, unitSphere,
} from './cel3d.ts';

/** How far along the sinusoid (µm each way) the scene is built: past anything the camera can hold (the host's reach). */
export const REACH = 200;
/** The traffic runs this far each way (µm): past the ends' blur, short of the scene's ends, so its density stays 2D's. */
export const TRAFFIC_REACH = 150;
/** How many more sinusoids (each with its plate) lie beyond the main plates, each way, as 2D repeats them outward: two, so panning to the edge never shows an empty page (Mohammad, 20 Nov 2026: "one more
 *  blood layer on top and bottom so that it doesn't look empty when i pan all the way up"). */
export const BEYOND = 2;
/** The repeat across (µm): a plate, Disse, lining, lumen, lining, Disse. */
export const PERIOD = UM.hep + 2 * (UM.disse + UM.endo) + 2 * UM.lum;
/** How far across (µm each way, from the axis): the main plates and the BEYOND sinusoids and plates past each. */
export const ACROSS = UM.lum + UM.endo + UM.disse + UM.hep + BEYOND * PERIOD + 12;
/** Depths (µm, toward the viewer): the plates' tops, the lining's crest, Disse's floor, the ground under the clefts, the trough's depth as a share of the lumen's half width. */
export const Z = { cell: 0.55, cellBot: -1.3, bead: 0.5, disse: -1.0, ground: -12.0, trough: 0.92, nucleus: 0.55 } as const;
/** The red cells in the stream (2D's palette has their colour; the host draws none). */
/** How far (µm) the scene stands toward the viewer from the lobule's plate. */
const LIFT = 8;
/** The traffic's pace in 3D against 2D's (Mohammad, 20 Nov 2026: "a little faster"), the lymph streaks' pace against the lymph's own run, and the haze: how far out it takes to be whole (µm) and how deep it goes. */
const PACE = 1.35, LYMPH_PACE = 2.5, HAZE_K = 0.45;
/** The focus band's run (µm) to a whole blur: from the middle of the first hepatocyte row out to the middle of the next sinusoid's lumen, rising fast at first (post-dof.ts bandCoc eases out), so
 *  the next sinusoid is already well out of focus (Mohammad, 20 Nov 2026: "the blur should really start earlier and be more intense quickly"). The haze follows the same run, lighter, so the
 *  neighbours' disease still shows. */
/** A microvillus's radius (µm, thick enough that its fill reads inside its line) and how far its root runs inside the cell. */
export const VILLUS_R = 0.13, VILLUS_ROOT = 0.4;
/** How far a hepatocyte's nucleus stands over the cell's top (µm): its outline at a depth of its own, never fighting the cell's face. */
export const NUC_LIFT = 0.12;
/** The cells' slow life: how far a Kupffer arm's tip swings and a microvillus waves (radians). */
export const KUP_SWAY = 0.16, VILLUS_SWAY = 0.09;
/** The Kupffer cell: its size against 2D's, and how solid it is (the stream behind shows through). */
export const KUP_SCALE = 0.72, KUP_ALPHA = 0.72;
export const BLUR_RUN = UM.hep * 0.5 + UM.disse + UM.endo + UM.lum * 0.5;
const HAZE_RUN = BLUR_RUN;
/** The scene's ends: the blur along the sinusoid starts this far (µm) inside each end and is whole this far in. */
const END_BLUR = [95, 55] as const;
/** Red cells in this sinusoid's lumen, and in each of the two next ones (beyond the plates). */
/** The bile canaliculus's radius (µm): a round lumen about 1.6 µm across between two hepatocytes. */
export const CANAL_R = 0.72;
const RBC_N = 50, RBC_FAR = 20, RBC_R = 1.05;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a: RGB, b: RGB, t: number): [number, number, number] => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];
const mul3 = (a: RGB, k: number): [number, number, number] => [a[0]! * k, a[1]! * k, a[2]! * k];
/** A colour's own ink: the colour much deeper (2D's cell clefts and organ lines are the colour darkened, never black). */
/** A cell's or particle's ink: its own colour taken near black (CEL_STYLE.MICRO.INK_K), one rule for all of them. */
/** The hepatocytes' line and the tone of the contact and the ring round each canaliculus: 2D's cleft, the cell's colour darkened, never black. */
const CELL_LINE_K = 0.42;
const inkOf = (a: RGB): [number, number, number] => mul3(a, CEL_STYLE.MICRO.INK_K);
const deep = (a: RGB, k = 0.48): [number, number, number] => mul3(a, k);

/** What this scene reads of its host (sinusoid/view.ts: the state, palette, traffic and places). */
interface Flat {
  cur: { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number };
  pal: { palette(dark: boolean): Record<string, unknown> };
  traffic: { pts: Float32Array; readonly flowX: number; readonly lymX: number };
  geo: { xs: number; xk: number; pores: Pore[][] };
  g: { halfW(x: number): number; disseW(x: number): number; wallIn(x: number): number; hepIn(x: number): number };
  endShown: [number, number];
  dive: number | null;
  lifeTime: number;
  look: LookId;
  spriteCount: number;
  readonly washProgress: number;
  VW: { vis: [number, number] };
  isVisible: boolean;
  trafficSpeed: number;
  ends: readonly [number, number, number];
}

interface Pal {
  cBg: RGB; cShade: RGB; cLumen: RGB; cLymph: RGB; cCell: RGB; cUnder: RGB; cNuc: RGB; cCol: RGB; cBm: RGB; cBile: RGB; cEndo: RGB; cEndoS: RGB; cEndoE: RGB; cEndoN: RGB;
  cHscQ: RGB; cHscA: RGB; cHscN: RGB; cKup: RGB; cKupN: RGB; cKupE: RGB; cRbc: RGB; cEndF: RGB; cEndE: RGB; cAlb: RGB; cAlbE: RGB; uDark: number;
}

/** A side of the sinusoid: -1 the upper (2D's y < 0, its upper lining and plate), +1 the lower. */
type Side = -1 | 1;
/** The plane's y (up) for 2D's y across (down). */
const Y = (yDown: number): number => -yDown;
/** The fenestrae's slots (1 µm each) the gap texture holds: from GAP_X0, GAP_SLOTS of them, past the lining's reach both ways. */
export const GAP_X0 = -256, GAP_SLOTS = 512;
const gapTexture = (data: Uint8Array): DataTexture => {
  const t = new DataTexture(data, GAP_SLOTS, 2, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
};

export class Sinusoid3D {
  readonly group = new Group();
  private readonly flat: Flat;
  private readonly fade = { value: 1 };
  private readonly res: CelShared['res'];
  private on = false;
  /** The haze over what lies past this sinusoid's own plates (one set of uniforms for every part). */
  private readonly haze = hazeUniforms();
  private builtKey = '';
  private lookKey = '';
  private readonly m4 = new Matrix4();
  // the parts
  private readonly ground: MicroPart;
  private readonly trough: MicroPart;
  private readonly troughFar: MicroPart;
  private readonly bead: MicroPart;
  private readonly beadLine: MicroPart;
  private readonly disse: MicroPart;
  private readonly cells: MicroPart;
  private readonly nuclei: MicroPart;
  private readonly nucleoli: MicroPart;
  private readonly bile: MicroPart;
  private readonly endoN: MicroPart;
  private readonly endoNi: MicroPart;
  private readonly kup: MicroPart;
  private readonly kupN: MicroPart;
  private readonly hsc: MicroPart;
  private readonly hscN: MicroPart;
  private readonly bm: MicroPart;
  private readonly arrows: MicroPart;
  /** The fenestrae's gaps: one texel a slot (GAP_X0 + j .. + 1 µm), row 0 the lining at local y > 0 (the upper, side -1), row 1 the lower; red is the gap's half width over 0.5 µm. */
  private readonly gapData = new Uint8Array(GAP_SLOTS * 2 * 4);
  private readonly gapTex = gapTexture(this.gapData);
  private gapKey = -1;
  private readonly villi: MicroMany;
  private readonly fibres: MicroMany;
  private readonly albumin: MicroMany;
  private readonly rbc: MicroMany;
  private readonly rbcs: { u: number; y: number; z: number; tilt: number; spin: number; ph: number; lane: -1 | 0 | 1 }[] = [];

  constructor(flat: SinusoidView, shared: CelShared) {
    this.flat = flat as unknown as Flat;
    this.res = shared.res;
    this.group.name = 'sinusoid3d';
    // the scene is built in micrometres, the plane's y up: one group scales it to the host's units (it turns with the host's group in a portrait room)
    this.group.scale.setScalar(U);
    // (while the camera dives in it stands a little proud of the lobule's plate it sits in, so it is drawn over the lobule, never through it; at rest it lies in the host's own plane, where the names are pinned)
    const mk = (name: string, o: Parameters<typeof microMaterials>[2] = {}) => new MicroPart(new MeshBuilder().build(), microMaterials(this.res, this.fade, { haze: this.haze, ...o }), `sinusoid3d/${name}`);
    const many = (name: string, geo: ReturnType<typeof unitSphere>, cap: number, o: Parameters<typeof microMaterials>[2] = {}) => new MicroMany(geo, microMaterials(this.res, this.fade, { haze: this.haze, ...o }), cap, `sinusoid3d/${name}`);
    const S = CEL_STYLE.MICRO;
    this.ground = mk('ground', { ink: null });
    // (open sheets carry no hull ink: their edges are inked by the lining's own lines)
    this.trough = mk('lumen', { ink: null, streaks: true });
    this.troughFar = mk('lumen-beyond', { ink: null, streaks: true });
    // (the fenestrae are real gaps through the lining, the bead and its edges alike: one texel a 1 µm slot, each side; stepPores writes how open each is)
    const gaps = { tex: this.gapTex, x: new Vector4(GAP_X0, GAP_SLOTS, 0.5, 0) };
    this.bead = mk('endothelium', { ink: null, gaps });
    this.beadLine = mk('endothelium-edge', { ink: null, gaps });
    this.disse = mk('disse', { ink: null, streaks: true });
    this.cells = mk('hepatocytes', { px: S.LINE });
    // (the small solid shapes, the nuclei, the canaliculi, the lining's cells, the Kupffer and stellate cells, albumin and the red cells, draw their line inside their own fill (cel3d.ts uRim):
    //  whole and smooth on every screen, never fighting the surface behind; their hull lines broke into dashes and specks, eyes 20 Nov)
    this.nuclei = mk('nuclei', { ink: null, rim: S.LINE });
    this.nucleoli = mk('nucleoli', { ink: null });
    this.bile = mk('canaliculi', { ink: null, rim: S.LINE_SMALL });
    this.endoN = mk('endothelial-cells', { ink: null, rim: S.LINE_SMALL });
    this.endoNi = mk('endothelial-nuclei', { ink: null });
    this.kup = mk('kupffer', { ink: null, rim: S.LINE });
    this.kupN = mk('kupffer-nucleus', { ink: null });
    // (see-through: the body and its nucleus blend over the stream but still write depth and draw before the line, so the line behind the body never shows through it; colour premultiplied)
    for (const [p, o] of [[this.kup, 10], [this.kupN, 11]] as const) {
      const m = p.mats.toon; m.transparent = true; m.depthWrite = true; m.premultipliedAlpha = true; m.uniforms.opacity!.value = KUP_ALPHA; p.toonMesh.renderOrder = o;
    }
    this.hsc = mk('stellate', { ink: null, rim: S.LINE_SMALL });
    this.hscN = mk('stellate-nucleus', { ink: null });
    this.bm = mk('basement', { ink: null, transparent: true });
    this.arrows = mk('ends', { px: S.LINE_SMALL });
    this.villi = many('microvilli', unitRod(8), 900, { px: S.LINE_SMALL });
    this.fibres = many('collagen', unitRod(6), 800, { ink: null });
    this.albumin = many('albumin', unitSphere(12, 8), 2000, { ink: null, rim: S.LINE_SMALL });
    this.rbc = many('red-cells', unitRbc(22), RBC_N + 2 * RBC_FAR, { ink: null, rim: S.LINE });
    // (order: the ground first, then the solid shapes; the see-through membrane and the arrows last)
    for (const p of [this.ground, this.disse, this.troughFar, this.trough, this.bead, this.beadLine, this.cells, this.nuclei, this.nucleoli, this.bile, this.endoN, this.endoNi, this.kup, this.kupN, this.hsc, this.hscN, this.bm, this.arrows]) this.group.add(p.group);
    for (const p of [this.villi, this.fibres, this.albumin, this.rbc]) this.group.add(p.group);
    this.bm.renderOrder = 20;
    const r = mulberry(91);
    for (let i = 0; i < RBC_N + 2 * RBC_FAR; i++) this.rbcs.push({ u: r(), y: r() * 1.5 - 0.75, z: r(), tilt: 0.2 + r() * 0.7, spin: (r() - 0.5) * 0.8, ph: r() * Math.PI * 2, lane: i < RBC_N ? 0 : i < RBC_N + RBC_FAR ? -1 : 1 });
    this.group.visible = false;
  }

  get enabled(): boolean { return this.on; }

  /** Before the host's update, each frame: while this scene is on, the host's traffic runs over the whole built stretch (fixed to the tissue), not over the stretch on screen (2D's VW.vis,
   *  which moves with the camera: a pan or a turn slid every albumin and red cell the other way). Off again, the host lays its stretch for the screen afresh. */
  pinTraffic(on: boolean): void {
    const f = this.flat;
    if (on) { f.VW.vis[0] = -TRAFFIC_REACH; f.VW.vis[1] = TRAFFIC_REACH; this.pinned = true; }
    else if (this.pinned) { this.pinned = false; (f as unknown as { screen: unknown }).screen = null; }
  }
  private pinned = false;

  /** One frame, after the host's own update (its state, palette and traffic are this frame's). `on`: always true now (everything is 3D); false only hides it in tests. True while anything of this scene moves. */
  update(on: boolean, rate = 1): boolean {
    const f = this.flat;
    const changed = on !== this.on;
    this.on = on;
    const shown = on && f.isVisible;
    // (paused, the blood stands still: the red cells, the albumin and the streaks stop with the simulation, Mohammad 20 Nov 2026; `rate` is the scene's one eased pause/play rate, so they ease to a stop and back up)
    f.trafficSpeed = Math.min(1, Math.max(0, rate)) * (on ? PACE : 1);
    this.group.visible = shown;
    if (!shown) return changed;
    // the dive: the scene comes in over the lobule as the camera lands (the host's own share), whole at rest
    const d = f.dive;
    // (a short crossfade, over the last part of the dive where the lobule's tube and this lumen are one width on screen: a long one showed both scenes at once, a ghosted double image, eyes 20 Nov)
    this.fade.value = d == null ? 1 : smooth(0.6, 0.86, d);
    this.group.position.z = d == null ? 0 : LIFT * U * (1 - smooth(0.86, 1, d));
    const dark = LOOKS[f.look].scheme === 'dark';
    const P = f.pal.palette(dark) as unknown as Pal;
    const S = f.cur;
    const q = (x: number) => Math.round(x * 64);
    const key = `${q(S.lum)}|${q(S.pinch)}|${q(S.col)}|${q(S.act)}|${q(S.mv)}|${q(S.bm)}|${f.geo.xk}`;
    if (key !== this.builtKey) { this.builtKey = key; this.build(); }
    const lk = `${f.look}|${P.cLumen.join(',')}|${P.cLymph.join(',')}|${q(S.act)}`;
    if (lk !== this.lookKey) { this.lookKey = lk; this.colour(P, S.act); }
    this.stepPores(S.por);
    this.stepLife();
    this.stepAlbumin();
    this.stepRbc();
    this.stepStreaks(P);
    this.stepArrows(P);
    this.bm.setOpacity(clamp(S.bm, 0, 1) * (dark ? 0.6 : 0.8));
    return true;
  }

  // ---- the cells' slow life ----------------------------------------------------------------------------------------------------------
  // (Mohammad 20 Nov 2026: "maybe animate its podocytes. Same for hepatocyte microvilli animate them very slowly". Calm, never a pulse: periods of several seconds, a small reach, each arm and
  //  each villus on its own phase so nothing moves in step; on the host's lifeTime, so it eases to a stop with pause and stands still with reduced motion)

  private kupT = Number.NaN;
  private stepLife(force = false): void {
    const f = this.flat, t = f.lifeTime;
    if (!force && t === this.kupT) return;
    this.kupT = t;
    const g = f.g, S = f.cur;
    // the Kupffer cell: on the lower lining at xk, its arms reaching into the stream, each swaying slowly (a period of 7 to 11 s, a few degrees, more toward its tip)
    {
      const b = new MeshBuilder(), bn = new MeshBuilder();
      // (smaller and see-through, so it sits in the stream without stopping the eye: Mohammad 20 Nov 2026, "a bit transparent translucent and smaller so it's not too disruptive")
      const K = KUP_SCALE, x = f.geo.xk, h = g.halfW(x), yd = h - 2.3 * K, z = -1.6 * K;
      ellipsoid(b, x, Y(yd), z, 3.0 * K, 2.3 * K, 1.9 * K, 0.2, undefined, 22, 12, true);
      const arms: [number, number, number][] = [[-1.3, 4.6, 0.1], [-0.55, 5.4, 0.25], [0.25, 3.8, 0.3], [0.85, 5.0, 0.05], [1.4, 3.6, 0.0]];
      arms.forEach(([a, L, dz], k) => {
        const path: [number, number, number][] = [];
        const w = (Math.PI * 2) / (7 + 1.1 * k), ph = k * 2.17, reach = K * (1 + 0.06 * Math.sin(t * w * 0.7 + ph * 1.3));
        for (let i = 0; i <= 8; i++) {
          const u = i / 8, r = 1.6 * K + u * L * reach, sway = KUP_SWAY * u * u * Math.sin(t * w + ph - u * 1.2), bend = 0.25 * Math.sin(u * 3 + a) + sway;
          // (2D y down: the arms reach up, toward the axis, and along the flow)
          path.push([x + Math.cos(a + bend - Math.PI / 2) * r * 1.0, Y(yd + Math.sin(a + bend - Math.PI / 2) * r * 0.9), z + (dz * u * 2 + 0.3 * u) * K]);
        }
        tube(b, path, (i) => lerp(0.7, 0.12, i / 8) * K, undefined, 10, true);
      });
      ellipsoid(bn, x - 0.6 * K, Y(yd + 0.3 * K), z + 0.75 * K, 1.55 * K, 1.15 * K, 1.25 * K, 0.3, undefined, 16, 8);
      b.build(this.kup.geometry); bn.build(this.kupN.geometry);
    }
    // the microvilli: short fingers off each plate's face into Disse (they flatten in cirrhosis: 2D's mv), each waving a few degrees on its own slow phase (a period of about 9 s)
    {
      let n = 0;
      const mv = clamp(S.mv, 0, 1), len = 0.25 + 0.55 * mv;   // (short fine bristles, Mohammad 20 Nov 2026: the outlined ones read "huge")
      if (mv > 0.03) for (const s of [-1, 1] as Side[]) for (let x = -REACH + 0.4; x < REACH; x += 1.2) {
        if (n >= this.villi.capacity) break;
        // (each villus starts VILLUS_ROOT inside the cell, just under its top face, so the cell covers its root and the villus covers the cell's line there: cell and villi read as one shape with one
        //  outline round them all, Mohammad 20 Nov 2026: "the microvilli need a black outline so they look connected to the hepatocyte")
        const L = len + VILLUS_ROOT, yd = s * (g.hepIn(x) + VILLUS_ROOT - L * 0.5);
        const wave = VILLUS_SWAY * Math.sin(t * (Math.PI * 2 / 9) + x * 0.83 + s * 1.7);
        placeAt(this.m4, x, Y(yd), Z.cell - 0.05 - VILLUS_R, L, VILLUS_R, VILLUS_R, Math.PI / 2 + 0.25 * Math.sin(x * 1.7) + wave);
        this.villi.setAt(n++, this.m4);
      }
      this.villi.commit(n);
    }
  }

  /** The focus band for the depth of field's band (post-dof.ts bandFrame): two points on this sinusoid's axis, where the blur starts (just past its own plates, as the haze) and where it is
   *  whole, in world space; returns the strength (0 when the scene is not shown: no blur). */
  focusBand(a: Vector3, b: Vector3, e0: Vector3, e1: Vector3, ends?: { mid: Vector3; f0: Vector3; f1: Vector3 }): number {
    if (!this.on || !this.group.visible) return 0;
    this.group.updateWorldMatrix(true, false);
    const y0 = this.flat.g.hepIn(0) + UM.hep * 0.5, w = (v: Vector3, x: number, y: number) => this.group.localToWorld(v.set(x, y, 0));
    w(a, -20, 0); w(b, 20, 0); w(e0, 0, y0); w(e1, 0, y0 + BLUR_RUN);
    // the two ends melt away well before the scene stops (Mohammad 20 Nov: "don't let me see the end of the sinusoid like that ... blur the ends")
    if (ends) { w(ends.mid, 0, 0); w(ends.f0, REACH - END_BLUR[0], 0); w(ends.f1, REACH - END_BLUR[1], 0); }
    return this.fade.value;
  }

  // ---- colours -------------------------------------------------------------------------------------------------------------------

  private colour(P: Pal, act: number): void {
    // the hepatocytes' line: their own colour darkened (2D's cleft tone), run round every microvillus too, the one thin line where two neighbours touch, and the ring round each canaliculus
    // (the ground under the cells takes the same tone: it shows only in that hair of contact and in the round gap; Mohammad 20 Nov 2026: "next to each other and just have like a circular
    // gap around the bile duct between them")
    const cellInk = mul3(P.cCell, CELL_LINE_K);
    this.ground.setTint(cellInk);
    this.trough.setTint(P.cLumen); this.trough.setInk(deep(P.cEndoE, 0.9));
    this.troughFar.setTint(mix3(P.cLumen, P.cBg, 0.2)); this.troughFar.setInk(deep(P.cEndoE, 0.9));
    this.bead.setTint(P.cEndo); this.beadLine.setTint(P.cEndoE);
    this.disse.setTint(P.cLymph);
    this.cells.setTint(P.cCell); this.cells.setInk(cellInk);
    this.nuclei.setTint(mix3(P.cCell, P.cNuc, 0.55)); this.nuclei.setInk(inkOf(P.cNuc));
    this.nucleoli.setTint(mix3(P.cNuc, P.cCell, 0.15));
    this.bile.setTint(P.cBile); this.bile.setInk(inkOf(P.cBile));
    this.endoN.setTint(P.cEndoS); this.endoN.setInk(inkOf(P.cEndoE));
    this.endoNi.setTint(P.cEndoN);
    this.kup.setTint(mix3(P.cKup, P.cLumen, 0.45)); this.kup.setInk(deep(P.cKup, 0.55));   // (a little faded, outlined in its own colour, darker: Mohammad 20 Nov 2026)
    this.kupN.setTint(deep(P.cKup, 0.62));   // (the nucleus a deeper shade of the cell itself; it sat in the comment above, so the nucleus drew white, eyes 20 Nov)
    const hc = mix3(P.cHscQ, P.cHscA, clamp(act, 0, 1));
    this.hsc.setTint(hc); this.hsc.setInk(inkOf(hc)); this.hscN.setTint(P.cHscN);
    this.bm.setTint(P.cBm);
    this.villi.setTint(P.cCell); this.villi.setInk(cellInk);   // (the hepatocyte's own colour, outlined: "outline the villi")
    this.fibres.setTint(P.cCol);
    this.albumin.setTint(P.cAlb); this.albumin.setInk(inkOf(P.cAlbE));
    // (a red cell is a clear, bright red in two tones with a bold dark line of its own red, as every solid here: 2D's darker red read as brown under the shade, Mohammad 20 Nov "should not be colored brown")
    this.rbc.setTint(mix3(P.cRbc, [0.96, 0.3, 0.32], 0.45)); this.rbc.setInk(inkOf(P.cRbc));
  }

  // ---- the shapes that follow the state (rebuilt at 1/64 steps of it) ------------------------------------------------------------

  private build(): void {
    const g = this.flat.g, geo = this.flat.geo, S = this.flat.cur;
    const X0 = -REACH, X1 = REACH, DX = 1;
    const xs: number[] = [];
    for (let x = X0; x <= X1 + 1e-6; x += DX) xs.push(x);

    // the ground under everything (seen only in the clefts between cells)
    { const b = new MeshBuilder(); const a = b.v(X0 - 20, -ACROSS - 20, Z.ground, 0, 0, 1), c = b.v(X1 + 20, -ACROSS - 20, Z.ground, 0, 0, 1), e = b.v(X1 + 20, ACROSS + 20, Z.ground, 0, 0, 1), h = b.v(X0 - 20, ACROSS + 20, Z.ground, 0, 0, 1); b.quad(a, c, e, h); b.build(this.ground.geometry); }

    // the lumen: an open trough, an ellipse across (the lumen's half width wide, Z.trough of it deep)
    {
      const b = new MeshBuilder(), K = 22, rows: number[] = [];
      for (const x of xs) {
        rows.push(b.count);
        const h = g.halfW(x), D = h * Z.trough;
        for (let k = 0; k <= K; k++) {
          const th = -Math.PI / 2 + (k / K) * Math.PI, yd = h * Math.sin(th), z = -D * Math.cos(th);
          // (the inward normal of the ellipse: toward the axis and the viewer)
          b.v(x, Y(yd), z, 0, Y(-D * Math.sin(th)), h * Math.cos(th)); b.aux.push(Math.sin(th));
        }
      }
      for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, K + 1);
      b.build(this.trough.geometry);
    }

    // the endothelium: a rounded bead along each rim, from the lumen's edge to Disse, and its short wall down to Disse's floor
    {
      const b = new MeshBuilder(), K = 8;
      for (const s of [-1, 1] as Side[]) {
        const rows: number[] = [];
        for (const x of xs) {
          rows.push(b.count);
          const h = g.halfW(x), w = g.wallIn(x) - h;
          for (let k = 0; k <= K; k++) {
            const th = (k / K) * Math.PI, yA = h + (w / 2) * (1 - Math.cos(th)), z = Z.bead * Math.sin(th);
            const ny = -Math.cos(th) * Z.bead, nz = (w / 2) * Math.sin(th) + 1e-3;
            b.v(x, Y(s * yA), z, 0, Y(s * ny), nz);
          }
          // down the Disse side
          const yW = g.wallIn(x);
          b.v(x, Y(s * yW), Z.disse - 0.3, 0, Y(s), 0);
        }
        // (the winding faces the viewer: for the upper side the strip runs the other way)
        for (let i = 0; i < rows.length - 1; i++) { if (s > 0) b.strip(rows[i]!, rows[i + 1]!, K + 2); else b.strip(rows[i + 1]!, rows[i]!, K + 2); }
      }
      b.build(this.bead.geometry);
      // the lining's two edges, inked as 2D draws them (the endothelium's edge colour): thin ribbons on the lumen's rim and on Disse's side
      const L = new MeshBuilder();
      for (const s of [-1, 1] as Side[]) for (const edge of [0, 1]) band(L, xs, (x) => Y(s * ((edge ? g.wallIn(x) : g.halfW(x)) - 0.11)), (x) => Y(s * ((edge ? g.wallIn(x) : g.halfW(x)) + 0.11)), 0.06);
      L.build(this.beadLine.geometry);
    }

    // Disse's floor, each side, and the beyond's (the next sinusoid's Disse and lumen, as flat as 2D draws its repeat)
    {
      const b = new MeshBuilder();
      const bandZ = (y0: (x: number) => number, y1: (x: number) => number, z: number) => band(b, xs, y0, y1, z, true);
      for (const s of [-1, 1] as Side[]) {
        bandZ((x) => Y(s * (g.wallIn(x) - 0.1)), (x) => Y(s * (g.hepIn(x) + 1.0)), Z.disse);
        // (and under the lining itself, unstreaked: a fenestra is a real gap through the lining, so the space of Disse is what shows in it, never the ground)
        band(b, xs, (x) => Y(s * (g.halfW(x) - 0.1)), (x) => Y(s * (g.wallIn(x) - 0.1)), Z.disse);
        for (let i = 0; i < xs.length * 2; i++) b.aux.push(-1);
        // beyond the plate: Disse, the lining, the next lumen, its lining, Disse, then the next plate (flat bands; the next lumen is a shallow trough below)
        for (let r = 0; r < BEYOND; r++) {
          const base = (x: number) => g.hepIn(x) + UM.hep + r * PERIOD;
          bandZ((x) => Y(s * (base(x) - 1.0)), (x) => Y(s * (base(x) + UM.disse + 0.1)), Z.disse);
          bandZ((x) => Y(s * (base(x) + 2 * UM.endo + UM.disse + 2 * UM.lum - 0.1)), (x) => Y(s * (base(x) + PERIOD - UM.hep + 1.0)), Z.disse);
        }
      }
      b.build(this.disse.geometry);
    }
    {
      const b = new MeshBuilder();
      for (let r = 0; r < BEYOND; r++) for (const s of [-1, 1] as Side[]) {
        const K = r ? 8 : 14;   // (the one past it lies deep in the blur: a coarser trough)
        const rows: number[] = [];
        for (const x of xs) {
          rows.push(b.count);
          const mid = g.hepIn(x) + UM.hep + UM.disse + UM.endo + UM.lum + r * PERIOD, h = UM.lum + UM.endo * 0.5, D = h * 0.7;
          for (let k = 0; k <= K; k++) {
            const th = -Math.PI / 2 + (k / K) * Math.PI, yd = mid + h * Math.sin(th), z = -D * Math.cos(th) + 0.1;
            b.v(x, Y(s * yd), z, 0, Y(-s * D * Math.sin(th)), h * Math.cos(th)); b.aux.push(Math.sin(th));
          }
        }
        for (let i = 0; i < rows.length - 1; i++) { if (s > 0) b.strip(rows[i]!, rows[i + 1]!, K + 1); else b.strip(rows[i + 1]!, rows[i]!, K + 1); }
      }
      b.build(this.troughFar.geometry);
    }

    // the plates: hepatocytes as raised tiles (their borders 2D's own bent lines), each with its domed nucleus; the bile canaliculi on the borders
    {
      const cells = new MeshBuilder(), nuc = new MeshBuilder(), nol = new MeshBuilder(), bile = new MeshBuilder();
      const plate = (sd: number, s: Side, face: (x: number) => number, far = false, beyond = false) => {
        // (beyond: a plate in the blur has no canaliculi, too fine to read there; far: one deep in it keeps its tiles and nuclei, coarser, without the nucleoli: a phone still draws the whole scene)
        const j0 = Math.floor(X0 / CELL) - 1, j1 = Math.ceil(X1 / CELL) + 1;
        for (let j = j0; j <= j1; j++) {
          const outline = cellOutline(j, sd, s, face, beyond);
          pillow(cells, outline, Z.cell, Z.cellBot, CELL_BEVEL, undefined, far ? 2 : 4);
          const c = cellOf(j, sd), xn = lerp(c.x0, c.x1, c.nu), v = c.nv * UM.hep;
          const put = (x: number, r: number) => {
            const yd = s * (face(x) + v);
            ellipsoid(nuc, x, Y(yd), Z.cell + NUC_LIFT, r, r * 1.08, 0.42, 0, undefined, far ? 14 : 28, far ? 6 : 10, true);   // (its rim a hair over the cell's top, so its line never shares the cell's depth)
            if (far) return;
            const a = 1.7 + 2.2 * ((j * 7 + sd) % 5) / 5;
            ellipsoid(nol, x + r * 0.3 * Math.cos(a), Y(yd) + r * 0.3 * Math.sin(a), Z.cell + 0.32, r * 0.13, r * 0.13, 0.12, 0, undefined, 12, 6);
          };
          if (c.bi) { const dx = (c.x1 - c.x0) * 0.17; put(xn - dx, c.nr * 0.8); put(xn + dx, c.nr * 0.8); } else put(xn, c.nr);
          // the canaliculus between this cell and the one before it: a small round lumen in the cleft at the middle of the plate, seen in cross-section as a circle (Mohammad 20 Nov 2026:
          // "the bile ductule should be like a circle in between each hepatocyte"; it was a long tapering channel down the border)
          if (!beyond) {
            const v = UM.hep * 0.5, x = edgeAt(j, sd, v);
            ellipsoid(bile, x, Y(s * (face(x) + v)), Z.cell + 0.1, CANAL_R, CANAL_R, 0.3, 0, undefined, 24, 6, true);
          }
        }
      };
      const seeds: Record<Side, number> = { [-1]: SEED.plateUp, 1: SEED.plateDn } as Record<Side, number>;
      for (const s of [-1, 1] as Side[]) {
        plate(seeds[s], s, (x) => g.hepIn(x));
        for (let r = 1; r <= BEYOND; r++) plate(seeds[s] + 101 * r, s, (x) => g.hepIn(x) + r * PERIOD, r > 1, true);
      }
      cells.build(this.cells.geometry); nuc.build(this.nuclei.geometry); nol.build(this.nucleoli.geometry); bile.build(this.bile.geometry);
    }

    // the endothelial cells: a lens on the lining round each nucleus, bulging into the lumen
    {
      const b = new MeshBuilder(), bi = new MeshBuilder();
      for (const [s, nsd] of [[-1, SEED.nucUp], [1, SEED.nucDn]] as [Side, number][]) {
        for (let n = Math.floor(X0 / 38) - 1; n <= Math.ceil(X1 / 38) + 1; n++) {
          const x = nucAt(n, nsd), h = g.halfW(x);
          ellipsoid(b, x, Y(s * (h - 0.35)), -0.35, 4.6, 1.45, 1.05, 0, undefined, 24, 10, true);
          ellipsoid(bi, x, Y(s * (h - 0.45)), -0.2, 3.1, 0.82, 0.98, 0, undefined, 18, 8);
        }
      }
      b.build(this.endoN.geometry); bi.build(this.endoNi.geometry);
    }

    // the Kupffer cell (its arms move on the scene's life: stepLife)
    this.kupT = Number.NaN; this.stepLife(true);

    // the stellate cell: a spindle in the upper Disse at xs, long processes along it; it grows as it activates
    {
      const b = new MeshBuilder(), bn = new MeshBuilder();
      const a = clamp(S.act, 0, 1), x0 = geo.xs;
      const mid = (x: number) => -(g.wallIn(x) + g.disseW(x) * 0.5 + 0.2);
      const body = 5.2 * (1 + 0.35 * a), thick = 1.25 * (1 + 0.45 * a);
      ellipsoid(b, x0, Y(mid(x0) - 0.4 * a), Z.disse + 0.9, body, thick, 1.1 + 0.3 * a, 0, undefined, 26, 12, true);
      for (const dir of [-1, 1]) for (const [len, off, r0] of [[22 + 8 * a, 0, 0.62], [12 + 5 * a, -1.0, 0.42]] as [number, number, number][]) {
        const path: [number, number, number][] = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, x = x0 + dir * (body * 0.7 + t * len);
          path.push([x, Y(mid(x) + off * t * t + 0.25 * Math.sin(t * 5 + dir)), Z.disse + 0.8 - 0.25 * t]);
        }
        tube(b, path, (i) => lerp(r0 * (1 + 0.3 * a), 0.1, i / 14), undefined, 8, true);
      }
      ellipsoid(bn, x0, Y(mid(x0) - 0.4 * a), Z.disse + 1.25 + 0.25 * a, 2.1, 0.75 * (1 + 0.3 * a), 0.85, 0, undefined, 16, 8);
      // one in each neighbour's Disse too (the next Disse past each plate), activated as this one is, a little smaller, away from this one along the flow
      for (const [s, xo] of [[-1, 21], [1, -27]] as [Side, number][]) {
        const xf = x0 + xo, sc = 0.8, farMid = (x: number) => s * (g.hepIn(x) + UM.hep + UM.disse * 0.5);
        ellipsoid(b, xf, Y(farMid(xf)), Z.disse + 0.9, body * sc, thick * sc, (1.1 + 0.3 * a) * sc, 0, undefined, 22, 10, true);
        for (const dir of [-1, 1]) {
          const path: [number, number, number][] = [], len = (18 + 7 * a) * sc;
          for (let i = 0; i <= 12; i++) { const t = i / 12, x = xf + dir * (body * sc * 0.7 + t * len); path.push([x, Y(farMid(x) + 0.25 * Math.sin(t * 5 + dir)), Z.disse + 0.8 - 0.25 * t]); }
          tube(b, path, (i) => lerp(0.5 * (1 + 0.3 * a), 0.1, i / 12), undefined, 8, true);
        }
        ellipsoid(bn, xf, Y(farMid(xf)), Z.disse + 1.2, 1.7, 0.65 * (1 + 0.3 * a), 0.75, 0, undefined, 14, 8);
      }
      b.build(this.hsc.geometry); bn.build(this.hscN.geometry);
    }

    // the basement membrane (cirrhosis): a band on Disse's lining side, shown by its own opacity
    {
      const b = new MeshBuilder();
      for (const s of [-1, 1] as Side[]) band(b, xs, (x) => Y(s * (g.wallIn(x) - 0.05)), (x) => Y(s * (g.wallIn(x) + 0.55)), Z.disse + 0.12);
      // and on the neighbour's lining side of its Disse
      for (const s of [-1, 1] as Side[]) band(b, xs, (x) => Y(s * (g.hepIn(x) + UM.hep + UM.disse - 0.55)), (x) => Y(s * (g.hepIn(x) + UM.hep + UM.disse + 0.05)), Z.disse + 0.12);
      b.build(this.bm.geometry);
    }

    // collagen in Disse (capillarization): fibres along it, more and thicker with col
    {
      let n = 0;
      const col = clamp(S.col, 0, 1);
      if (col > 0.03) for (const s of [-1, 1] as Side[]) for (let row = 0; row < 3; row++) for (let x = -REACH; x < REACH; x += 7) {
        if (n >= this.fibres.capacity) break;
        const k = (row + 0.5) / 3, h = hash(x * 3 + row * 17 + (s > 0 ? 5 : 0));
        const xc = x + 3.5 * h, yd = s * lerp(g.wallIn(xc) + 0.5, g.hepIn(xc) - 0.5, k);
        placeAt(this.m4, xc, Y(yd), Z.disse + 0.25 + 0.15 * row, 5 + 3 * h, 0.16 + 0.22 * col, 0.16 + 0.22 * col, 0.08 * (h - 0.5));
        if (h < col * 1.3) this.fibres.setAt(n++, this.m4);
      }
      // and in the next Disse past each plate (the neighbour's), fewer and finer: the same disease, more lightly
      if (col > 0.03) for (const s of [-1, 1] as Side[]) for (let row = 0; row < 2; row++) for (let x = -REACH; x < REACH; x += 8) {
        if (n >= this.fibres.capacity) break;
        const k = (row + 0.5) / 2, h = hash(x * 5 + row * 23 + (s > 0 ? 11 : 3));
        const xc = x + 4 * h, base = g.hepIn(xc) + UM.hep, yd = s * lerp(base + 0.4, base + UM.disse - 0.4, k);
        placeAt(this.m4, xc, Y(yd), Z.disse + 0.25 + 0.15 * row, 4.5 + 3 * h, 0.14 + 0.2 * col, 0.14 + 0.2 * col, 0.08 * (h - 0.5));
        if (h < col) this.fibres.setAt(n++, this.m4);
      }
      this.fibres.commit(n);
    }
  }

  // ---- what moves every frame ----------------------------------------------------------------------------------------------------

  /** The fenestrae: real gaps through the lining (the bead and its edges, from the lumen to Disse), each as wide as it is open (they close as the lining capillarizes); none under an endothelial
   *  cell's swell. The same slots as the host's (poreAt, its seeds), out past the scene's reach so no stretch of lining is without them. Rewritten only when the open share moves. */
  private stepPores(por: number): void {
    const key = Math.round(Math.max(0, Math.min(1, por)) * 1024);
    if (key === this.gapKey) return;
    this.gapKey = key;
    const d = this.gapData;
    d.fill(0);
    for (let side = 0; side < 2; side++) {
      const sd = side === 0 ? SEED.poreUp : SEED.poreDn, nsd = side === 0 ? SEED.nucUp : SEED.nucDn;
      for (let j = GAP_X0; j < GAP_X0 + GAP_SLOTS; j++) {
        const p = poreAt(j, sd);
        if (!p) continue;
        const o = poreOpenness(p.th, por);
        if (o < 0.04 || underNucleus(p.x, nsd)) continue;
        // (the slot of a pore at x is floor(x): the shader cuts |x - slot - 0.5| under the half width)
        const slot = Math.floor(p.x / SLOT) - GAP_X0;
        if (slot < 0 || slot >= GAP_SLOTS) continue;
        d[(side * GAP_SLOTS + slot) * 4] = Math.round(Math.min(1, (p.w * 0.5 * o) / 0.5) * 255);
      }
    }
    this.gapTex.needsUpdate = true;
  }

  /** The albumin: the host's own traffic (2D's), as small amber beads, in the stream inside the trough, through the wall and back along Disse. */
  private stepAlbumin(): void {
    const f = this.flat, g = f.g, pts = f.traffic.pts, cnt = f.spriteCount;
    let n = 0;
    for (let i = 0; i < cnt && n < this.albumin.capacity; i++) {
      const o = i * 5, x = pts[o]!, yd = pts[o + 1]!, r = pts[o + 2]!, a = pts[o + 3]!, k = pts[o + 4]!;
      if (k !== 0 || a < 0.02) continue;
      const h = g.halfW(x), ay = Math.abs(yd);
      let z: number;
      if (ay < h) { const t = ay / h; z = -h * Z.trough * Math.sqrt(Math.max(0, 1 - t * t)) * (0.35 + 0.25 * hash(i * 0.37)) ; }
      else z = lerp(0.1, Z.disse + 0.55, smooth(h, g.wallIn(x) + 0.4, ay));
      // (a small bead, smaller than 2D's dot: Mohammad, 20 Nov 2026, "protein much smaller")
      const rr = r * 0.75 * Math.min(1, a * 1.6);
      placeAt(this.m4, x, Y(yd), z, rr, rr, rr);
      this.albumin.setAt(n++, this.m4);
      // the next sinusoids carry the same disease, more lightly (Mohammad 20 Nov 2026: "fibrosis and proteins and stuff should be on the unfocused sinusoids too ... to a less degree"):
      // one of every three of this lumen's protein rides in each neighbour, shifted along so the two never mirror
      if (ay < h && i % 3 === 0) for (const s of [-1, 1] as Side[]) {
        if (n >= this.albumin.capacity) break;
        let xf = x + s * 41 + 13 * hash(i * 0.73); if (xf > REACH) xf -= 2 * REACH; else if (xf < -REACH) xf += 2 * REACH;
        const farH = UM.lum + UM.endo * 0.5, t = Math.min(0.85, ay / h), mid = g.hepIn(xf) + UM.hep + UM.disse + UM.endo + UM.lum;
        placeAt(this.m4, xf, Y(s * mid + Math.sign(yd || 1) * t * farH * 0.8), -farH * 0.7 * Math.sqrt(1 - t * t) * 0.5 + 0.1, rr * 0.9, rr * 0.9, rr * 0.9);
        this.albumin.setAt(n++, this.m4);
      }
    }
    this.albumin.commit(n);
  }

  /** The red cells: biconcave discs carried in the stream at the albumin's own lane speeds (fastest in the middle), tumbling a little; a few ride in each of the next sinusoids too. */
  private stepRbc(): void {
    const f = this.flat, g = f.g, v0 = -REACH, span = 2 * REACH + 16, flow = f.traffic.flowX;
    const farH = UM.lum + UM.endo * 0.5, farLim = farH - RBC_R * 0.62;
    let n = 0;
    for (const c of this.rbcs) {
      const sp = 1.5 * (1 - c.y * c.y) + 0.08;
      const x = v0 - 8 + ((((c.u * span + flow * sp) % span) + span) % span);
      let yd: number, z: number, fold = 1;
      if (c.lane === 0) {
        const h = g.halfW(x), lim = Math.max(0, h - RBC_R * 0.62);
        yd = clamp(c.y * h, -lim, lim);
        const t = Math.abs(yd) / Math.max(h, 1e-3);
        z = -h * Z.trough * Math.sqrt(Math.max(0, 1 - t * t)) * lerp(0.42, 0.62, c.z);
        // a squeeze where the lumen is narrow (the stellate cell's pinch): the disc folds a little
        fold = clamp(h / (RBC_R + 1.2), 0.62, 1);
      } else {
        const mid = g.hepIn(x) + UM.hep + UM.disse + UM.endo + UM.lum, o = clamp(c.y * farH, -farLim, farLim), t = Math.abs(o) / farH;
        yd = c.lane * (mid + o);
        z = -farH * 0.7 * Math.sqrt(Math.max(0, 1 - t * t)) * lerp(0.4, 0.6, c.z) + 0.1;
      }
      placeAt(this.m4, x, Y(yd), z, RBC_R, RBC_R * fold, RBC_R, c.ph + c.spin * flow * 0.02, c.tilt);
      this.rbc.setAt(n++, this.m4);
    }
    this.rbc.commit(n);
  }

  /** The streaks: the blood's in every lumen (lighter, at the lanes' speeds, the middle fastest) and the lymph's in Disse (darker, slow, back toward the portal tract), fixed to the tissue. */
  private stepStreaks(P: Pal): void {
    const f = this.flat, flow = f.traffic.flowX, lym = f.traffic.lymX;
    const blood = mix3(P.cLumen, [1, 1, 1], 0.42), lymph = mix3(P.cLymph, [1, 1, 1], 0.2);
    // (the blood's streaks follow Settings > Blood streaks, as every view's do; the lymph's in Disse always run)
    const bs = useSettings.getState().particles ? 1 : 0;
    // the wedged column's wash (a slide that asks for it, once landed): amber from the central vein's end toward the portal venule's, the blood in it still (2D's wedgeA, now drawn here)
    { const wk = f.washProgress, E = f.ends, W = (P as unknown as { cWedge?: RGB }).cWedge ?? [0.95, 0.66, 0.2]; this.trough.setWash(wk > 0 ? 1 : 0, E[0], E[1], wk, W); }
    this.trough.setStreaks(flow, Math.max(1, f.g.halfW(0)), blood, bs, 1);
    this.troughFar.setStreaks(flow, UM.lum + UM.endo * 0.5, blood, 0.5 * bs, 1);
    // (the lymph's own run is slow beside the blood's: its streaks go LYMPH_PACE times as fast, so they are seen to move, Mohammad 20 Nov "faster in lymph")
    // (quiet streaks one shade off Disse's own colour, never chevrons: the bold arrowheads that filled the band were wrong, Mohammad 20 Nov "WTF ARE THOSE CHEVRONS"; the shared
    // streak look of the Anatomy replaces these when it lands)
    this.disse.setStreaks(lym * LYMPH_PACE, UM.disse * 0.5 + 0.5, lymph, 0.7, 1);
    // the haze: from the middle of the first hepatocyte row toward the page, growing steadily, whole HAZE_RUN µm further out (Mohammad 20 Nov: "start from the middle of the hepatocyte, then increase as we move further out")
    const y0 = f.g.hepIn(0) + UM.hep * 0.5;
    this.haze.uHaze.value.set(y0, y0 + HAZE_RUN, HAZE_K, 0);
    rawRGB(this.haze.uHazeCol.value, P.cBg);
  }

  /** The two end arrows (2D's: the text's colour inside the labels' halo), in the lumen at the host's places, pointing the way the blood goes, fading with their names. */
  private arrowKey = '';
  private stepArrows(P: Pal): void {
    const f = this.flat, E = f.ends, dir = Math.sign(f.cur.v || 1), sh = f.endShown;
    const key = `${E[0].toFixed(2)}|${E[1].toFixed(2)}|${E[2].toFixed(2)}|${dir}`;
    if (key !== this.arrowKey) {
      this.arrowKey = key;
      const b = new MeshBuilder();
      // (each points toward its vessel, off the view: the portal venule's back upstream, the central vein's on downstream)
      for (const [x, d] of [[E[0], -dir], [E[1], dir]] as [number, number][]) pillow(b, arrowOutline(x, 0, E[2], d), 0.6, -0.6, Math.min(0.45, E[2] * 0.1), undefined, 3, [x + d * 0.12 * E[2], 0]);
      b.build(this.arrows.geometry);
    }
    // (2D lays the arrow in the labels' ink at half strength over the blood: here the same mix, opaque, so its ink never shows through it)
    const k = Math.max(sh[0], sh[1]);
    this.arrows.setTint(mix3(P.cLumen, P.cEndF, 0.5 * k)); this.arrows.setInk(mix3(P.cLumen, P.cEndE, 0.45 * k));
    // (none in the scene: the ends' arrows are part of their names, flat in the labels: SinusoidCaptions endArrow; Mohammad 20 Nov "the arrow should not be a 3D thing")
    this.arrows.group.visible = false;
  }

  dispose(): void {
    for (const p of [this.ground, this.trough, this.troughFar, this.bead, this.beadLine, this.disse, this.cells, this.nuclei, this.nucleoli, this.bile, this.endoN, this.endoNi, this.kup, this.kupN, this.hsc, this.hscN, this.bm, this.arrows]) p.dispose();
    for (const p of [this.villi, this.fibres, this.albumin, this.rbc]) p.dispose();
    this.gapTex.dispose();
  }
}

/** A flat band between two curves along x (plane y), facing the viewer at depth z. */
function band(b: MeshBuilder, xs: readonly number[], y0: (x: number) => number, y1: (x: number) => number, z: number, aux = false): void {
  const r0 = b.count;
  for (const x of xs) { b.v(x, y0(x), z, 0, 0, 1); b.v(x, y1(x), z, 0, 0, 1); if (aux) b.aux.push(-1, 1); }
  for (let i = 0; i < xs.length - 1; i++) { const a = r0 + i * 2; if (y1(xs[i]!) > y0(xs[i]!)) b.quad(a, a + 2, a + 3, a + 1); else b.quad(a, a + 1, a + 3, a + 2); }
}

/** Half the contact between two hepatocytes (µm): next to nothing, so neighbours touch and their two lines read as one thin line (Mohammad 20 Nov 2026: "the hepatocytes should be next
 *  to each other and just have like a circular gap around the bile duct between them"). */
export const CLEFT_HALF = 0.08;
/** The round gap the two neighbours bow apart into at the canaliculus (µm): a little wider than the canaliculus, so a thin ring of the gap's tone shows round it. */
export const CANAL_HOLE = 1.05;
/** The hepatocyte's rounded shoulder (µm): under the hole's radius, so the bevel never folds over itself round the canaliculus; a flatter, calmer tile. */
export const CELL_BEVEL = 0.6;

/** A hepatocyte's outline (plane units, counter-clockwise), from 2D's bent borders: the Disse face, the far side 20 µm in, the two borders, each border bowed into a half circle round the
 *  canaliculus at the middle of the plate; a hair taken off the border and the corners rounded. */
export function cellOutline(j: number, sd: number, s: Side, face: (x: number) => number, coarse = false): P2[] {
  const H = UM.hep, K = 5, KB = 6, A = 5, pts: P2[] = [];
  const at = (x: number, v: number): P2 => [x, Y(s * (face(x) + v))];
  const vc = H * 0.5, R = CANAL_HOLE;
  // (one border, from v0 to v1, the half circle round the canaliculus on it bowing into the cell: toward -x on the cell's right border, +x on its left)
  const border = (e: number, v0: number, v1: number, into: number) => {
    const dir = Math.sign(v1 - v0), xc = edgeAt(e, sd, vc);
    // (the border up to the hole, the half circle, the border on from it; v1 itself is the next run's first point)
    for (let i = 0; i < KB; i++) { const v = lerp(v0, v1, i / KB); if ((vc - v) * dir > R) pts.push(at(edgeAt(e, sd, v), v)); }
    for (let k = 0; k <= A; k++) { const th = (k / A) * Math.PI; pts.push(at(xc + into * R * Math.sin(th), vc - dir * R * Math.cos(th))); }
    for (let i = 0; i < KB; i++) { const v = lerp(v0, v1, i / KB); if ((v - vc) * dir > R) pts.push(at(edgeAt(e, sd, v), v)); }
  };
  const xa0 = edgeAt(j, sd, 0), xb0 = edgeAt(j + 1, sd, 0);
  for (let i = 0; i < K; i++) { const x = lerp(xa0, xb0, i / K); pts.push(at(x, 0)); }
  border(j + 1, 0, H, -1);
  const xa1 = edgeAt(j, sd, H), xb1 = edgeAt(j + 1, sd, H);
  for (let i = 0; i < K; i++) { const x = lerp(xb1, xa1, i / K); pts.push(at(x, H)); }
  border(j, H, 0, 1);
  // the contact: every point pulled in by a hair (counter-clockwise first, so the normals face out)
  let ring = pts;
  let area = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; area += p[0] * q[1] - q[0] * p[1]; }
  if (area < 0) ring = ring.slice().reverse();
  const nrm = outlineNormals(ring), GAP = CLEFT_HALF;
  ring = ring.map((p, i) => [p[0] - nrm[i]![0] * GAP, p[1] - nrm[i]![1] * GAP] as P2);
  return chaikin(ring, coarse ? 1 : 2, 0.22);   // (a plate in the blur: one round of rounding)
}

/** The end arrow's outline (2D's: a short broad shaft and a wide head, pointing along +x when dir is 1), its size `r` µm (2D's END[2]), at (x, y). */
function arrowOutline(x: number, y: number, r: number, dir: number): P2[] {
  const base: P2[] = [[-0.58 * r, -0.17 * r], [0, -0.17 * r], [0, -0.46 * r], [0.52 * r, 0], [0, 0.46 * r], [0, 0.17 * r], [-0.58 * r, 0.17 * r]];
  const pts = chaikin(base, 1, 0.1).map(([u, v]) => [x + dir * u, Y(y) + v] as P2);
  return dir < 0 ? pts.reverse() : pts;
}

/** A small seeded random (red cells' lanes). */
function mulberry(a: number): () => number {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A hash of a number to [0, 1). */
const hash = (x: number): number => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
