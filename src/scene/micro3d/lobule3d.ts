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
import { ShapeUtils, Vector2, CanvasTexture, CustomBlending, DataTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, Float32BufferAttribute, Texture, Vector3, Vector4, type BufferAttribute, type BufferGeometry } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { CelObject } from '../materials/cel.ts';
import type { LobuleView } from '../lobule/view.ts';
import type { LookId } from '../../looks/looks.ts';
import type { Course, LobuleNet, P2 as LP2 } from '../lobule/geometry.ts';
import { LOBULE_R } from '../lobule/shots.ts';
import { AN_K, DISC_R, DUCT_R, LT_R, RS_N, lyTaper, congShare, inletRadius, sinRadius, twigR } from '../lobule/widths.ts';
/** The space of Disse's band and the widest bile canaliculus (lobule radii), which shrink to nothing as their layers go off (2D: lobule-zoom-field.js, lobule-bile.js). */
const BILE_BC_R = 0.0036;
import { CASING } from '../vessels/cel-ink.ts';
import { LensFade } from '../lenses/fade.ts';
import type { LensId } from '../lenses/model.ts';
import { type InkContext, type Seg, inkAcross, inkAt, inkSignature, laneShares, sinW } from '../lobule/ink.ts';
import { lookColours } from '../lobule/lz-colours.ts';
import { LOBULE_PALETTES } from '../lobule/tones.ts';
import { useTokens } from '../lobule/from2d/lobule-paint.generated.js';
import { PlateClient, type PlateExtra } from '../lobule/plate-client.ts';
import { ATLAS_W, collagenInput, paintCollagenWorld } from '../lobule/collagen-paint.ts';
import { CollagenAtlas } from '../lobule/collagen-atlas.ts';
import { collagenTau, flipRows } from '../lobule/collagen-tau.ts';
import { easeGrow, growGoal } from '../lobule/growth.ts';
import { CV_FILL, CV_MESH_IN, CV_WALL, cvScarGrowth } from '../lobule/cv-intima.ts';
import { cvGeom } from '../lobule/cv-band.ts';
import { deadAmount } from '../lobule/dead-cells.ts';
import { LOBULE_PLATE_FS, LOBULE_PLATE_VS, LOBULE_SCAR_VS, PLATE_BOX, paintPlateWorld, defaultCanvas, PLATE_PX, PLATE_S, type PlateState, plateInput, plateKey, plateQuantizer, plateShape } from '../lobule/plate.ts';
import { tissueInk } from '../lobule/cel.ts';
import { hexToRgb01 } from '../lenses/oklab.ts';
import { WASH_AMOUNT, washAmount, washFront } from '../lobule/wash.ts';
/** How quickly the wash comes in and goes away (ms, an exponential ease). */
const WASH_EASE_MS = 350;
import { CEL_STYLE } from '../cel-style.ts';
import { buildBile } from '../lobule/bile.ts';
import { endTaper, lymphCover, type Cover } from '../lobule/lymph.ts';
import { MICRO_DPR, MeshBuilder, MicroPart, Pacer, meshWork, type P2, type RGB, ellipsoid, microMaterials, pillow, tube } from './cel3d.ts';
import { joinsMode } from '../vessels/skin/joins-mode.ts';
import { bileWeldCourses, bloodWeldCourses, trimmedInside } from '../lobule/weld-courses.ts';
import { planWeldsInWorker, requestBakedWelds, watchWelds, type WeldRequest } from '../lobule/weld-client.ts';
import { HA_K, BD_K } from '../lobule/weld-bend.ts';
import type { WeldCourseOut, WeldPlan } from '../lobule/welds.ts';
import { type EmitOpts, type PartData, type SkinInk, emitCourse, emitSkin } from './lobule-welded.ts';

import { clock } from '../../clock/frame.ts';
import { cellOutline } from './sinusoid3d.ts';
import { FINE_REACH, fineBands, fineCellRange, fineCourses, fineShare, viewToLobule, UM_LOCAL, cellOf, h1 } from './lobule-fine.ts';
import { hexFrac } from '../lobule/geometry.ts';
import { SIN_LOCAL } from '../lobule/frames.ts';
import { CELL, PERIOD, UM } from '../sinusoid/layout.ts';
import { groundOf, tileColours } from '../lobule/tile-colours.ts';
const R = LOBULE_R;
/** Heights (local units, toward the viewer; R = 3): the hexagon's ground, the tiles' tops and bottoms, the tubes' centre line, Disse's sleeve, the mouths' lips and depth, the marks' plate.
 *  The plate stands over the tallest nucleus crown (0.0436 at septU 1) and 0.017 (3.8 µm) under the sinusoid scene's lowest surface (0.0634): it is depth-TESTED, so the sinusoid, standing over the lobule at the dive's landing, hides it (23 Nov, the dive's flash). */
export const LZ = { ground: -0.03, cellTop: 0.026, cellBot: -0.026, tube: 0.008, disse: -0.012, lip: 0.03, mouthDepth: 0.22, marks: 0.046 } as const;   // (cellBot a hair over the ground: a tile's wall ended under it, and its line, drawn down the wall, dipped in and out of the ground in dashes, eyes 20 Nov)
/** The lobule vessels' line (CSS px): the Anatomy's vessels' weight (about 2 px at the fit). */
export const VESSEL_LINE = 2;
/** Segments round a tube and round a mouth. */
export const TUBE_SEG = 10, MOUTH_SEG = 64;
/** The thin lymph tubes (terminal lymphatics and channels, a third of a sinusoid's width or less, a few pixels across under their outline) take 6 sides, as the bile's tubes do: the channels were 190k of the Lobule's 715k triangles, ink hull included. */
export const THIN_SEG = 6;
/** The share of a tile's short side its bevel takes. */
const BEVEL = 0.28;
const BILE_ID = 2_000_000;
/** The vessels that run over the plates (the sinusoids, their cross-links, the arteriole's twigs) lie with their axis at the tiles' tops: lower, a thin one was buried under every tile it
 *  crossed and showed only in the gaps, as short pieces floating between the cords (Mohammad, 20 Nov: "disconnected vessels in the middle"). */
export const OVER_Z = LZ.cellTop + 0.002;
/** How far the fine rows' cover stands over the lobule's own tiles' tops (local units, 0.4 µm): the tiles under a plate of the view give way to it, and its own
 *  tiles stand a quarter more over it; the tubes (OVER_Z, radius 0.02) stand over both. */
const FINE_LIFT = 0.0018;
/** How deep a lymph channel lies where it passes under a blood vessel (below the vessel's own underside, above the ground). */
/** Beside a sinusoid the tube lies low enough that its top never stands above the sinusoid's own surface where the two overlap (it stands 0.55 of its radius off the wall: its inner 45 % is under the vessel). */
export const LYMPH_Z = OVER_Z - 0.0075;
export const LYMPH_UNDER_Z = LZ.disse - 0.01;
/** The scene's fade is taken as whole from here up (FADE_GLSL's screen pattern drops pixels below 0.999). */
/** Where the bile is drawn: before every blood vessel and the lymph (all -1), writing no depth. */
export const BILE_ORDER = -1.8;
/** The distances from the centre (lobule radii) the dive's view of the lobule spans round the sinusoid's station (rho 0.59, and 0.15 beyond it for the view's stretch along
 *  the flow and its rows across, back to 0.3 where the tubes are widest): diveTopZ. */
const STATION_RHO = Math.hypot(SIN_LOCAL[0], SIN_LOCAL[1]) / LOBULE_R;
export const DIVE_RHO: readonly [number, number] = [0.3, STATION_RHO + 0.15];
export const FADE_SNAP = 0.98;
/** How far from each end of a vessel (in its own radii) no flow mark is drawn: where it runs into another vessel. */
export const END_HUSH_R = 3;
/** Where the sinusoids stop inside the central vein, as a share of its radius: just inside its rim, so each meets the rim and none is drawn over the pool. */
export const CV_HOLE_K = 0.96;
/** The tract's arteriole and ductule openings are drawn this much larger than 2D's dots, so each corner reads as one triad: venule, artery and duct side by side (Mohammad, 20 Nov): HA_K and BD_K, in weld-bend.ts. */
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
  field: { readonly wideNow: number; setHome(p: number): void };
  /** The lobule root's one fade (lobule/one-fade.ts): this scene reads its `detail` uniform and writes both values through `group.setFade`. */
  fade: { readonly detail: { value: number } };
  group: Group & { setFade(detail: number, ground: number): void };
  goalState: { congU: number; septU: number; fibSin: number; act: number; fibPre: number; fibPost: number };
  cur: { fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number; flow: number; portal: number; art: number; lymphRate: number; seal: number };
  layers: { lymph: boolean; zones: boolean; bile: boolean };
  lyFade: number; bileFade: number; zoneFade: number;
  look: LookId;
  isVisible: boolean;
  readonly sinSwell: { whole: number; share: number };
  /** A sinusoid's width now against its healthy width at distance `rho` from the centre (lum, and congestion's share of it). */
  sinScaleAt(rho: number): number;
  cvRadiusNow: number;
  /** The wedge's wash, 0..1 (0 when no slide runs it). */
  readonly washProgress: number;
  inkContext(): InkContext | null;
}

/** How a part's vertices take the lens's colour: a segment kind and each vertex's place along it (w) and brightness (k); or a fixed tone with the brightness only. */
interface Coloured {
  part: MicroPart; seg: Seg | null; w: Float32Array; k: Float32Array;
  /** Where a welded junction blends two colour families (a sinusoid leaving an inlet): the other segment, each vertex's place on it, and how much of it the vertex wears (0 to 1). */
  seg2?: Seg; w2?: Float32Array; m?: Float32Array;
  /** The lens's colours for each vertex now, and those that showed when the lens last changed (stepInk fades from one to the other). */
  to?: Float32Array; from?: Float32Array;
  /** Each vertex's place across its vessel (-1 .. 1), and the junction skins' arms (the stream lenses lay their streams by them: lobule/ink.ts inkAcross). */
  ac?: Float32Array; skins?: SkinInk[];
  /** Where each course's vertices lie in the part (course key, first vertex, one past the last): the dive's tube tone lifts one course. */
  ranges?: Map<string, [number, number]>;
}

const quant = (s: PlateState): PlateState => { const q = (x: number) => Math.round(clamp(x, 0, 1) * 32) / 32; return { congU: q(s.congU), septU: q(s.septU), fibSin: q(s.fibSin), act: q(s.act), fibPre: q(s.fibPre), fibPost: q(s.fibPost) }; };

/** How long the tiles take to ease from one build to the next (ms). */
/** Whether two builds of one attribute differ anywhere (exactly: a single float). */
const differs = (a: Float32Array, b: Float32Array): boolean => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; };
const CELL_EASE_MS = 900, MARKS_DIP_MS = 260, PLATE_CROSS_MS = 700;

/** The scene's fade below which a waiting weld plan may be laid in (nothing of it can be told). */
const WELD_SWAP_FADE = 0.02;

/** What the weld planner is given for a network (lobule/welds.ts): its courses as the scene draws them, and the discs of the vessels' mouths (a meeting inside a mouth is the pool's, not a junction). The same call
 *  makes the baked plan at build time (scripts/bake-welds.mjs) and asks for it at run time, so a baked file made for other numbers is known by its digest and never laid in. */
export function weldRequest(net: LobuleNet): WeldRequest {
  const h = { R, over: OVER_Z, tube: LZ.tube, bile: LZ.cellTop + 0.001 }, segs = { vessel: TUBE_SEG, bile: 6 };
  const mouthR: Partial<Record<Course['kind'], number>> = { pv: DISC_R.pv, ha: DISC_R.ha * HA_K, bd: DISC_R.bd * BD_K, lv: DISC_R.lv, cv: DISC_R.cv };
  const avoid = net.courses.filter((c) => mouthR[c.kind] !== undefined).map((c) => { const p = c.pts[Math.floor(c.pts.length / 2)]!; return { x: p[0] * R, y: -p[1] * R, r: mouthR[c.kind]! * R }; });
  return { courses: [...bloodWeldCourses(net, h, segs), ...bileWeldCourses(net, h, segs)], avoid };
}

/** Each terminal lymphatic runs on into the middle of the lymphatic's pool it ends at (2D ends it on the pool's rim, under the pool's drawing; here the pool is a solid with a wall, and a tube that stopped at
 *  the rim met that wall end to end, a butt joint with the outline between: Mohammad 20 Nov 2026, "they don't join the actual ductule at the end"). The bile's canals already end at their ductule's middle. */
export function lymphIntoPools(lt: readonly Course[], lv: readonly Course[]): Course[] {
  const mids = lv.map((c) => c.pts[Math.floor(c.pts.length / 2)]!);
  return lt.map((c) => {
    const e = c.pts[c.pts.length - 1]!;
    let best: LP2 | null = null, bd = Infinity;
    for (const m of mids) { const d = Math.hypot(m[0] - e[0], m[1] - e[1]); if (d < bd) { bd = d; best = m; } }
    if (!best || bd > DISC_R.lv * 1.5 || bd < 1e-6) return c;
    return { ...c, pts: [...c.pts, [best[0], best[1]] as LP2], rho: [...c.rho, c.rho[c.rho.length - 1]!] };
  });
}


/** The key of the state the tiles are built for (the model's congestion and septal asks, in 32 steps). */
const cellKeyOf = (g: { congU: number; septU: number }): string => { const q = (x: number): number => Math.round(clamp(x || 0, 0, 1) * 32); return `${q(g.congU)}|${q(g.septU)}`; };

/** How much of the lobule's own detail stays on a dive: it follows the field's breadth, but never less than the body has yet to cover (`body` is the body's share, 0 gone, 1 whole). Before, it was gone by
 *  the time the body was half back, and the screen was darker than both ends of the move: the black dive, slide 7 to 8, Black look. One picture both ways: the same on the way in. */
export const lobuleStays = (wideNow: number, body: number): number => Math.max(1 - wideNow, 1 - Math.min(1, Math.max(0, body)));
/** How much of the neighbours' ground is drawn on a dive (`body` the body's share, 0 gone, 1 whole): what the body leaves, 1 - body (eased in over the first tenth), so it moves
 *  hardly faster than the body does.
 *  The ground is the dive frame's backdrop, so it must be 0 at the frame the dive frame is switched on (the body's first step under 1). Before, it was whole at that frame: the page
 *  behind and around the body turned to the lobules' tone in one frame, and back in one frame on the way out (the Anatomy to Lobule flicker, Mohammad 26 Nov). (It was whole by half-way
 *  until the body was made to go before the camera reaches the liver's surface: over that shorter run, twice the body's pace was a step of a third a frame. The straight share dips no
 *  more than 0.03 toward the page in the middle, tests/dive-nothing-switches.test.ts.) */
export const GROUND_EASE = 0.1;
export const groundStays = (body: number): number => {
  const u = 1 - Math.min(1, Math.max(0, body)), e = GROUND_EASE;
  // (eased in over the first tenth, so the frame the dive frame is switched on, the body's first small step under 1, has next to none of it; straight after, at the body's own pace)
  return (u < e ? (0.5 * u * u) / e : u - 0.5 * e) / (1 - 0.5 * e);
};

export class Lobule3D {
  readonly group = new Group();
  private readonly flat: Flat;
  private readonly fade: { value: number };
  private on = false;
  private hidLobule = false;
  private cellKey = '';
  private cellLook = '';
  private cellGen: Generator<void> | null = null;
  private cellPrime: Generator<void> | null = null;
  private cellNext: { cb: MeshBuilder; nb: MeshBuilder } | null = null;
  private cellTween: { from: Float32Array[]; to: Float32Array[]; /** which of the six arrays differ between the two builds: only those are eased and sent to the GPU each frame (the rest are the same bytes in both) */ live: boolean[]; t: number } | null = null;
  private cellAt = -1;
  private marksFade = 1;
  // the marks plate's second slot (a patient change is painted in a worker, and the new plate crossfades over the old: plate-client.ts)
  private readonly plates = new PlateClient();
  /** A plate is mixing in (the one shader samples both, plate.ts mixB). */
  private crossing = false;
  private texFront: Texture | null = null;
  private texSpare: Texture | null = null;
  private askedKey = '';
  private readonly plateQ = plateQuantizer();
  private plateReady: { key: string; bmp: ImageBitmap; look: string; coll: ImageBitmap | null } | null = null;
  // the collagen layer (collagen-paint.ts) and its arrival times (collagen-tau.ts): painted once per look, never for a change of fibrosis; the growth of the three channels (septa, tracts, the vein) eased on the clock
  private readonly atlas = new CollagenAtlas();   // (one atlas resident; a second only while a look crossfades, Plan 31c)
  private readonly blankColl: Texture;
  private collStale = false;   // (a lost context took the atlas: painted again on the next step)
  private collLook = '';
  private collNext = '';   // (the look of the atlas crossfading in)
  private tauTex: DataTexture | null = null;
  private readonly grow: [number, number, number] = [0, 0, 0];
  private crossT = 0;
  private marksAt = -1;
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
  /** The lymph channels beside the sinusoids (2D's `ly`): thin tubes tapering toward the central vein. */
  private readonly duct: MicroPart;
  private readonly bile: MicroPart;
  private readonly mouthPv: MicroPart;
  private readonly mouthHa: MicroPart;
  private readonly mouthBd: MicroPart;
  private readonly mouthLv: MicroPart;
  private readonly mouthCv: MicroPart;
  /** SOS: the scar inside the central vein (2D's plug, lobule-zoom.js: from the wall in, the open lumen narrowing to 1 - CV_FILL of it), faded, one clean ring, nothing across the open lumen. */
  private readonly cvScar: MicroPart;
  private cvScarBase = '';
  /** The sinusoid view's own rows round its station (lobule-fine.ts): the tubes the lobule lacks, the plates between them (a tile and a nucleus each) and the cover
   *  that makes the tiles under them give way. They have a
   *  dissolve of their own, `fineFade`: the lobule's fade times how much of them their size on screen shows (fineShare), so they are not there at the lobule's own framing. */
  private readonly fineTubes: MicroPart;
  private readonly fineCells: MicroPart;
  private readonly fineNuclei: MicroPart;
  private readonly fineCover: MicroPart;
  private readonly fineFade = { value: 0 };
  /** How much of the fine rows the camera's distance shows now (0 to 1), set by `setFineView`. */
  private fineK = 0;
  private fineLook = '';
  private readonly coloured: Coloured[] = [];
  /** The dive's anticipation (setTubeLift): the course whose tone is lifted, by how much (0 to 1 of the way to white), and the part's vertex colours it is written in. */
  private tubeLift = { key: '', amount: 0 };
  /** The welded junctions laid into the vessels now (lobule/welds.ts), and a plan that has come from the worker and waits for the Lobule to be out of sight. */
  private weldPlan: WeldPlan | null = null;
  private pendingWelds: WeldPlan | null = null;
  private vesselsBuilt = false;
  /** One idle slice: the vessels' meshes (true when this call built them). */
  prepareVessels(): boolean {
    if (this.vesselsBuilt) return false;
    if (!this.vgen) this.vgen = this.vesselSteps();
    if (this.vgen.next().done) { this.vgen = null; this.vesselsBuilt = true; }
    return true;
  }
  private vgen: Generator<void> | null = null;
  private pumpVessels(): void {
    clock.after(() => {
      if (this.disposed || this.vesselsBuilt) return;
      this.prepareVessels();
      if (!this.vesselsBuilt) this.pumpVessels();
    }, 30);
  }
  get vesselsReady(): boolean { return this.vesselsBuilt; }
  private weldsAsked = false;
  private disposed = false;
  // the marks plate: 2D's painter with the cells left out
  private readonly marks: Mesh;
  private readonly marksMat: ShaderMaterial;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly tex: CanvasTexture | null;
  private readonly shape: ReturnType<typeof plateShape>;
  private readonly sins: { c: Course; r: number }[];
  /** How many times the marks were painted (tests: a state change paints once). */
  paints = 0;

  /** `lazy`: Scene's way, the vessels' meshes are left to its idle slices (prepareVessels); built here otherwise (tests, the debug page). */
  constructor(flat: LobuleView, shared: CelShared, lazy = false) {
    this.flat = flat as unknown as Flat;
    this.fade = this.flat.fade.detail;   // (the lobule root's one dissolve: lobule/one-fade.ts)
    this.group.name = 'lobule3d';
    const res = shared.res, S = CEL_STYLE.MICRO;
    const mk = (name: string, o: Parameters<typeof microMaterials>[2] = {}) => new MicroPart(new MeshBuilder().build(), microMaterials(res, this.fade, { vertexColors: true, ...o }), `lobule3d/${name}`);
    this.ground = mk('ground', { ink: null, vertexColors: false });
    this.cells = mk('hepatocytes', { ink: null, rim: S.LINE });   // (each tile's line inside its own fill: the hull's line ran down the tile's wall and broke into dashes, eyes 20 Nov; S.LINE since the rim reads its width exactly, it drew this one about 1.5 px with the half-width estimate)
    this.nuclei = mk('nuclei', { ink: null });
    // (the vessels' line is the Anatomy's weight, VESSEL_LINE CSS px, so a lobule vessel reads outlined as a vessel of the body does: Mohammad 20 Nov 2026, "the lobule sinusoid vessels need black
    //  outlines like the vessels in anatomy"; at 1.25 px it broke into dots against the tiles)
    this.sin = { s0: mk('sinusoids-0', { inkR: true, px: VESSEL_LINE, flow: true, swell: true }), s1: mk('sinusoids-1', { inkR: true, px: VESSEL_LINE, flow: true, swell: true }), s2: mk('sinusoids-2', { inkR: true, px: VESSEL_LINE, flow: true, swell: true }), an: mk('sinusoids-links', { inkR: true, px: VESSEL_LINE * 0.8, flow: true, swell: true }) };
    // (the fine rows: the same materials as the lobule's own, with a fade of their own)
    const mkFine = (name: string, o: Parameters<typeof microMaterials>[2] = {}) => {
      return new MicroPart(new MeshBuilder().build(), microMaterials(res, this.fineFade, { vertexColors: true, ...o }), `lobule3d/${name}`);
    };
    this.fineTubes = mkFine('sinusoids-fine', { inkR: true, px: VESSEL_LINE, flow: true, swell: true });
    this.fineCells = mkFine('hepatocytes-fine', { ink: null, rim: S.LINE });
    this.fineNuclei = mkFine('nuclei-fine', { ink: null });
    this.fineCover = mkFine('ground-fine', { ink: null });
    this.inlets = mk('inlets', { inkR: true, px: VESSEL_LINE, flow: true });
    this.twigs = mk('arteriole-twigs', { inkR: true, px: S.LINE_SMALL * 0.8, flow: true });
    this.lt = mk('terminal-lymphatics', { inkR: true, px: S.LINE_SMALL * 0.8, flow: true });
    this.duct = mk('lymph-channels', { inkR: true, px: S.LINE_SMALL * 0.8, flow: true, swell: true, hug: true });
    this.bile = mk('canaliculi', { inkR: true, px: S.LINE_SMALL * 0.7, flow: true });
    this.mouthPv = mk('portal-venules', { px: VESSEL_LINE });
    this.mouthHa = mk('arterioles', { px: VESSEL_LINE * 0.8 });
    this.mouthBd = mk('ductules', { px: S.LINE_SMALL });
    this.mouthLv = mk('lymphatics', { px: S.LINE_SMALL });
    this.mouthCv = mk('central-vein', { px: VESSEL_LINE });
    // the marks plate (above the tiles, under the vessels: drawn after the tiles, testing depth and writing none, the vessels after it)
    this.shape = { ...plateShape(this.flat.net), cells: [] };
    this.sins = this.flat.net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
    this.canvas = defaultCanvas(PLATE_PX);   // (the plate's one canvas maker, plate.ts: a 2D canvas sent as a texture, no GL context of its own)
    this.tex = this.canvas ? new CanvasTexture(this.canvas) : null;
    const never = new DataTexture(new Uint8Array([255, 128, 0, 0]), 1, 1); never.needsUpdate = true;
    if (this.tex) { this.tex.flipY = true; this.tex.premultiplyAlpha = true; this.tex.generateMipmaps = true; this.tex.minFilter = LinearMipmapLinearFilter; this.tex.magFilter = LinearFilter; this.tex.anisotropy = 4; }
    const blank = new DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true; this.blankColl = blank;
    this.marksMat = new ShaderMaterial({ name: 'lobule marks',
      vertexShader: LOBULE_PLATE_VS, fragmentShader: LOBULE_PLATE_FS, uniforms: { map: { value: this.tex ?? blank }, mapB: { value: blank }, mapC: { value: blank }, mapCB: { value: blank }, mapT: { value: never }, uP: { value: new Vector3() }, mixB: { value: 0 }, opacity: { value: 1 }, uDpr: MICRO_DPR, fade: this.fade, uBase: { value: new Vector3() }, uBaseK: { value: 0 }, uCv: { value: new Vector4() }, uCvCol: { value: new Vector3() }, uScarK: { value: 1 }, uSide: { value: 2 * PLATE_BOX * R } },   // (a new plate is MIXED in by the one shader, mapB at mixB, never drawn as a second layer: two see-through layers at 1-e and e leave a quarter of the page showing at the middle of the fade, a flash on every swap)
      transparent: false, depthWrite: false, depthTest: true, side: DoubleSide,   // (depth-TESTED, writing none: the vessels still draw over it, and the sinusoid scene that stands over the lobule at the dive's landing hides it; it was depth-blind, so Disse's lining, the septa and the tracts were painted over the whole sinusoid until the lobule dropped out, then popped off: 23 Nov)
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    // SOS's scar inside the central vein: the plate's own painting (cv-intima.ts) shown over the vein's pool by this one shader, the plate's textures and mix shared with the marks, laid whole over the tissue's tone
    // (no see-through: it is the same collagen as the bands outside the wall, Plan 24)
    this.cvScar = new MicroPart(new MeshBuilder().build(), { ink: null, toon: new ShaderMaterial({ name: 'lobule central-vein scar',
      vertexShader: LOBULE_SCAR_VS, fragmentShader: LOBULE_PLATE_FS, uniforms: { ...this.marksMat.uniforms, opacity: { value: 0 }, uBaseK: { value: 1 }, uScarK: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    }) }, 'lobule3d/central-vein-scar');
    buildCvScar(this.cvScar.geometry, DISC_R.cv * R, CV_SCAR_Z()); this.cvScar.setOpacity(0);   // (the ring at its fullest, once: the shader shows as much of it as has grown, collagen-tau.ts)
    const side = 2 * PLATE_BOX * R;
    this.marks = new Mesh(new PlaneGeometry(side, side), this.marksMat);
    this.marks.position.z = LZ.marks; this.marks.name = 'lobule3d/marks'; this.marks.frustumCulled = false;
    this.texFront = this.tex;
    // draw order: the ground and the tiles, then the marks over them, then every vessel (depth-tested against the tiles)
    this.ground.renderOrder = -6; this.cells.renderOrder = -5; this.nuclei.renderOrder = -5;
    this.fineCover.renderOrder = -5; this.fineCells.renderOrder = -4.9; this.fineNuclei.renderOrder = -4.9;
    const vessels = [
      this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.fineTubes, this.inlets, this.twigs, this.lt, this.duct, this.bile,
      this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv,
    ];
    // (the flat view's field of neighbour lobules is see-through and so draws after every solid part; the marks, drawn among the solids, were painted over by it outside the hexagon, which
    // cut the periportal scar off at the edge: Mohammad 20 Nov "it's clipped like at the hexagon". The marks and the vessels draw in the see-through list after the field instead, the vessels
    // still writing and testing depth, opaque as before)
    this.marksMat.transparent = true; this.marks.renderOrder = -2;
    for (const v of vessels) {
      v.renderOrder = -1;
      for (const m of [v.toonMesh, v.inkMesh]) if (m) { const mat = m.material as ShaderMaterial; mat.transparent = true; mat.depthWrite = true; }
    }
    // (the bile lies in the lowest tier, UNDER every blood vessel and the lymph, as 2D draws it (lobule-pick.js tiers; Mohammad 20 Nov 2026: "bile ducts go right through blood vessels still in lobule"): it is drawn before them and
    //  writes no depth, so wherever a canal of Hering, a duct or a canaliculus meets a sinusoid, an inlet or a cross-link, the vessel is drawn over it, never the other way round. Its line goes first, its body over it)
    this.bile.inkMesh!.renderOrder = BILE_ORDER - 0.05; this.bile.toonMesh.renderOrder = BILE_ORDER;
    for (const m of [this.bile.inkMesh!, this.bile.toonMesh]) (m.material as ShaderMaterial).depthWrite = false;
    this.cvScar.renderOrder = 0;
    for (const p of [this.ground, this.cells, this.nuclei, this.fineCover, this.fineCells, this.fineNuclei, ...vessels, this.cvScar]) this.group.add(p.group);
    this.group.add(this.marks);
    // (the vessels' meshes are the constructor's heavy part: Scene's idle slices build them in a slice of their own, prepareVessels, hidden; update() builds them at once if nobody has)
    if (!lazy) this.buildVessels();
    this.group.visible = false;
    flat.group.add(this.group);   // (the Lobule's root takes everything under it into its one fade)
    // (on a page the baked plan (1.7 MB) is NOT asked for here: it is not part of the first download. The quiet ladder asks for it once the page is usable and the link is not
    // saving data (boot/warm.ts rung `welds`, `wantWelds`),
    // and the first dive into the Lobule asks at once and waits for it (`weldsWait`, scene.ts microStep). Off a page, a test, at once as before)
    if (typeof window === 'undefined') this.askWelds();
  }

  // ---- welded junctions (lobule/welds.ts) -------------------------------------------------------------------------------------------

  /**
   * Asks for the weld plan, once (never with `?joins=old`): the baked file first, a worker only when there is none. The plan is laid in while the Lobule is out of sight, so
   * no junction changes in front of the eye.
   */
  private askWelds(): void {
    if (this.weldsAsked || this.disposed || joinsMode() === 'old') { if (!this.weldsAsked) this.settleWelds(); return; }
    this.weldsAsked = true;
    const stop = watchWelds((k) => { this.weldProgress = k; this.onWeldProgress?.(k); });
    const lay = (plan: WeldPlan | null): void => { if (!plan || this.disposed) return; this.pendingWelds = plan; this.layWelds(); };
    const req = weldRequest(this.flat.net);
    void requestBakedWelds(req).then((plan) => {
      stop();
      if (plan) { lay(plan); this.settleWelds(); return; }
      // (no baked plan: a person never waits for ten seconds of planning. The Lobule is let in with its round-ended tubes, and the plan made in a worker is laid in while it is
      // out of sight, as it always was)
      this.settleWelds();
      void planWeldsInWorker(req).then(lay);
    });
  }
  /** The plan is in, or known to be unavailable: whoever waited for it (the dive) may go on. */
  private settleWelds(): void { if (this.weldsSettled) return; this.weldsSettled = true; this.weldProgress = 1; this.onWeldProgress?.(1); this.onWeldsSettled?.(); }
  private weldsSettled = false;
  /** How far the baked file has come (0 to 1), and who is told. */
  private weldProgress = 0;
  onWeldProgress: ((k: number) => void) | null = null;
  /** Called once when the weld plan is in or known to be unavailable (scene.ts takes up the micro views' preparation again). */
  onWeldsSettled: (() => void) | null = null;
  /**
   * Whether the Lobule still waits for its baked weld plan: only on a page, from the moment the Lobule is built until the plan has come or failed. A Lobule shown before the plan is in
   * would draw round-ended tubes, and the plan could be laid in only after it went out of sight again, so the dive waits (scene.ts) and the vessels are built once, welded.
   */
  get weldsWait(): boolean { return typeof window !== 'undefined' && !this.weldsSettled && joinsMode() !== 'old'; }
  /** The plan is wanted now (the quiet ladder's turn, or a dive): asks for it if nobody has. */
  wantWelds(): void { this.askWelds(); }
  get weldsProgress(): number { return this.weldProgress; }
  /** Lays a waiting plan into the vessels, when the Lobule is not on the screen. */
  private layWelds(): void {
    // (out of sight, or so faded in or out that the swap cannot be told: the baked plan is here at boot, so a Lobule entered from the body comes in already welded)
    if (!this.pendingWelds || (this.group.visible && this.fade.value > WELD_SWAP_FADE)) return;
    if (this.vgen) return;   // (mid-build: the plan waits and lays in after)
    this.weldPlan = this.pendingWelds; this.pendingWelds = null;
    if (!this.vesselsBuilt) return;   // (not built yet: the plan is simply used when they are)
    // (rebuilt part by part in timer slices, never in one task: the welded plan comes from the worker at an arbitrary moment, and the whole rebuild was one long task that could land in a drawn frame)
    this.vesselsBuilt = false; this.vgen = null;
    this.pumpVessels();
  }
  /** Welds laid in now (tests and the debug page). */
  get weldCount(): number { return this.weldPlan?.skins.length ?? 0; }
  /** Lays a plan in at once (tests). */
  layWeldsForTest(plan: WeldPlan): void { this.pendingWelds = plan; this.group.visible = false; this.layWelds(); if (!this.vesselsBuilt) this.buildVessels(); }

  get enabled(): boolean { return this.on; }

  /** One frame, after the flat lobule's own update. `on` is the Settings switch. True while anything of this scene changed. */
  /** `force`: the priming pass (Scene's idle slices): everything a first shown frame would build is built now, hidden, so the first show costs a frame's worth. */
  update(on: boolean, under = 0, now = 0, rate = 1, force = false, body = 0): boolean {
    if (!this.vesselsBuilt) this.buildVessels();
    if (!this.weldsAsked && on && this.flat.isVisible) this.askWelds();   // (the Lobule is wanted and nobody has asked yet: ask now)
    if (this.pendingWelds && (!this.group.visible || this.fade.value <= WELD_SWAP_FADE)) this.layWelds();
    const f = this.flat, changed = on !== this.on;
    this.on = on;
    // `under`: how far the camera has gone down onto the sinusoid (0 on the lobule, 1 landed). The lobule dissolves away as the sinusoid comes in (Mohammad: "Should fade when zooming"), and once
    // landed neither this scene nor the flat lobule is drawn: the lobule's solid tiles and tubes stand above the sinusoid's plane and would cut across it in the foreground
    // (and on the way in from the body it comes in as the field narrows onto it: the hex lobules tile the liver from afar, the neighbours resolve, then this lobule's own detail fades in until the
    //  landing, and the reverse on the way out; the field's breadth is the camera's distance against the lobule's framing, field.ts fieldWide)
    const come = lobuleStays(f.field.wideNow, body);
    // (whole once it is all but whole: the fade dissolves pixels in a screen pattern below 0.999, and a field that settles a hair short of 0 left the lobule speckled at rest, its lines dotted)
    const fv = (1 - under) * come, fs = fv > FADE_SNAP ? 1 : fv;
    // (the neighbours' plate goes under the sinusoid on the same curve as the tiles and tubes, `1 - under`; it is NOT also faded by the field's own breadth `come`, which is how the
    //  field itself widens. It comes in from the body on its own curve, groundStays: nothing of it while the body is whole, so the dive frame's switch is never seen)
    // (the ONE dissolve, written here and nowhere else: every tile, tube, mark and the marks plate drop the same pixels of one screen pattern at `fs`, the neighbours' ground fades at `1 - under`, and
    //  nothing else is scaled by either; the root group hands both to everything under it, lobule/one-fade.ts)
    f.group.setFade(fs, (1 - under > FADE_SNAP ? 1 : 1 - under) * groundStays(body));
    // (the fine rows' own dissolve: the lobule's, times how much of them the camera's distance shows; whole when both are, so they stand aside with the lobule under the landed sinusoid)
    { const fk = fs * this.fineK; this.fineFade.value = fk > FADE_SNAP ? 1 : fk; }
    const shown = force || (on && f.isVisible && under < 1);
    this.group.visible = shown && !force;
    // (the whole lobule, its neighbouring field too: the sinusoid's own ground lies below the lobule's plane, so the field would show through the clefts between its cells)
    const hide = on && under >= 1 && f.isVisible;
    if (hide !== this.hidLobule) { this.hidLobule = hide; f.group.visible = !hide && f.isVisible; }
    // (unseen, a lens change is not faded: the lobule comes back in the lens on now, as the sinusoid does)
    if (hide || !shown) { this.inkLens = null; return changed; }
    const look = f.look, c = f.cur;
    // The tiles are built for the state the model ASKS for, once, in small steps across frames, and eased between the two builds on the CPU (no rebuild per eased step: 388 cells a step, a stall each on a phone).
    // The first build, a look change, or a build that lands while the lobule is still dissolved (the zoom's far end) is laid at once.
    const goal = f.goalState, ck = cellKeyOf(goal), unseen = fs < 0.05;
    if (look !== this.cellLook) { this.cellLook = look; this.cellKey = ck; this.cellGen = null; this.cellTween = null; this.buildCells(look, goal.congU, goal.septU); }
    else if (ck !== this.cellKey) { this.cellKey = ck; this.cellGen = this.cellSteps(look, goal.congU, goal.septU); }
    const cellsBusy = this.stepCells(unseen);
    if (look !== this.lookKey) { this.lookKey = look; this.applyLook(look); }
    const fineBusy = this.stepFineTiles(), inkBusy = this.stepInk(now);
    const marksBusy = this.stepMarks(unseen);
    // widths and layers as the state has them now: each sinusoid swells and shrinks with congestion and capillarization (inflate, the absolute change of its radius), the lymph and the bile
    // shrink away with their layers and only then hide
    const inf = (p: MicroPart, v: number) => { p.mats.toon.uniforms.inflate!.value = v; };
    {
      const sw = f.sinSwell;
      for (const k of ['s0', 's1', 's2', 'an'] as const) this.sin[k].setSwell(sw.whole, sw.share);
      this.fineTubes.setSwell(sw.whole, sw.share);
    }   // (per vertex: its own radius and its place's share, cel3d SWELL)
    const lyF = f.lyFade, biF = f.bileFade;
    inf(this.lt, -LT_R * R * (1 - lyF)); this.duct.setSwell(-(1 - lyF), 0); this.duct.setHug(f.sinSwell.whole, f.sinSwell.share); inf(this.bile, -BILE_BC_R * R * (1 - biF));
    const lymphOn = lyF > 0.002, bileOn = biF > 0.002;
    this.lt.group.visible = lymphOn; this.duct.group.visible = lymphOn; this.mouthLv.group.visible = lymphOn; this.bile.group.visible = bileOn;
    // the central vein opens and narrows with congestion and its collagen (the flat view's radius)
    const kcv = f.cvRadiusNow / DISC_R.cv;
    this.mouthCv.group.scale.set(kcv, kcv, 1);
    // (the sinusoids end in the central vein's pool as one surface: nothing of a sinusoid, its shade or its line, is drawn inside the pool's rim, Mohammad 20 Nov 2026: "I hate that the vessels look
    //  like they have shadows inside the central vein"; congestion swells them over the pool's top, which is what showed. The vessels' own rule, a child's line masked inside its parent.)
    const hole = f.cvRadiusNow * R * CV_HOLE_K;
    for (const k of ['s0', 's1', 's2', 'an'] as const) this.sin[k].setHole(hole);
    this.fineTubes.setHole(hole);
    this.stepCvScar(kcv);
    this.buildGround(kcv, lymphOn);
    const washing = this.stepWash(now);
    const flowing = this.stepFlow(now, rate, lymphOn, bileOn);
    return flowing || washing || changed || cellsBusy || marksBusy || inkBusy || fineBusy;
  }

  // ---- the flow marks (quiet chevrons inside each vessel; they stop at the central vein's mouth and with the simulation) ------------------------

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
    const rgb = hexToRgb01((LOBULE_PALETTES[this.flat.look].tones as Record<string, string>).amber!) as RGB, a = this.washShown;
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.fineTubes, this.sin.an, this.mouthCv]) p.setRadialWash(a, this.washFrontNow, R, rgb);
    return this.washShown !== goal;
  }

  private flowAt = -1;
  /** The drawing buffer's pixel ratio (the scene's render asks the renderer): the heads are sized in device px. */
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
    // (no mark is scaled by the dive's fade: the tube's own dissolve already drops its pixels, marks and all, at the scene's one fade. A mark that was ALSO scaled by it (soft = k * fade) went as the fade squared and
    //  a weaker one (the lymph's 0.4) earlier still, so the lymph went first and the blood's vessels after it, and the lobule's vessels flashed: Mohammad 20 Nov 2026)
    const W: RGB = [1, 1, 1], soft = (k: number) => k, dpr = this.dpr;
    // every fluid is seen to move at the fit (Mohammad, 20 Nov 2026): the blood's dark heads (few and small on these thin tubes, the shader's screen rules), the lymph's and the bile's in their own tones
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.fineTubes]) p.setFlow(this.flowT.blood, 0.16, W, soft(1), 0, 0.0082 * R, true, dpr);
    this.sin.an.setFlow(this.flowT.blood, 0.12, W, soft(1), 0, 0.0043 * R, true, dpr);
    this.inlets.setFlow(this.flowT.blood, 0.3, W, soft(1), 0, 0.012 * R, true, dpr);
    this.twigs.setFlow(this.flowT.blood * 1.6, 0.1, [1, 0.88, 0.86], soft(1), 0, 0.006 * R, true, dpr);
    this.lt.setFlow(this.flowT.lymph, 0.12, W, soft(0.4), 0, LT_R * R, false, dpr);
    this.duct.setFlow(this.flowT.lymph, 0.12, W, soft(0.4), 0, DUCT_R * R, false, dpr);
    this.bile.setFlow(this.flowT.bile, 0.07, [1, 0.97, 0.7], soft(0.55), 1, 0.004 * R, false, dpr);
    void lymphOn; void bileOn;
    return rate > 0.001;
  }

  // ---- colours -------------------------------------------------------------------------------------------------------------------

  private applyLook(look: LookId): void {
    const L = lookColours(look), P = LOBULE_PALETTES[look].tones;
    const gap = L.rgb01('--og-liver-2'), bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg');
    this.ground.setTint(floorOf(bg, gap, L.dark, tissueInk(look)));
    const ink = tissueInk(look);
    // the hepatocytes keep the tissue's casing; every vessel (sinusoids, inlets, twigs, lymphatics, canaliculi, the tract's mouths, the central vein) the Anatomy's dark line of its own colour
    this.cells.setInk(ink);
    this.fineWant = look;   // (the fine rows' plates take the look's colours, laid in slices: stepFineTiles)
    const cas = CASING[look].rgb.map((v) => v / 255);
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.fineTubes, this.twigs, this.lt, this.duct, this.bile, this.mouthCv, this.mouthLv, this.mouthPv, this.inlets, this.mouthHa, this.mouthBd]) {
      p.setVesselInk(cas);
    }
    // the parts of one tone (the lens does not colour them, as in 2D)
    const tone = (k: string) => hexToRgb01((P as Record<string, string>)[k]!);
    // (the arterioles' tone is their vertices' now, segment 'art' of the lens's ink: the artery's own under every lens, the hepatic artery's blood under the stream lenses)
    this.mouthBd.setTint(tone('bile')); this.bile.setTint(tone('bile'));
    this.lt.setTint(tone('lymph')); this.duct.setTint(tone('lymph')); this.mouthLv.setTint(tone('lymph'));
    // the lens-coloured parts carry their colour in the vertices (stepInk), so their tint is white; this is the one place any vessel tint is written (a geometry build never writes a material uniform)
    for (const p of [this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.fineTubes, this.inlets, this.mouthPv, this.mouthCv, this.twigs, this.mouthHa]) p.setTint([1, 1, 1]);
    this.inkKey = '';
  }

  /** The lens's colours along the vessels (2D's inkOf: the portal venule's at the edge to the central vein's) and, under Blood origin and First pass, across them (the streams side by
   *  side, each vertex at its place across): lobule/ink.ts inkAcross, the one rule. Rewritten whenever a colour would change (inkSignature: the colours
   *  themselves, never a hand-kept list of inputs). */
  private stepInk(now: number): boolean {
    const ctx = this.flat.inkContext();
    if (!ctx) return false;
    // a new lens fades in from the colours showing (lenses/fade.ts, the one fade of every view); a rebuild or a new look (inkKey '') lands at once
    const lensChanged = this.inkLens != null && ctx.lens !== this.inkLens && this.inkKey !== '';
    if (lensChanged) {
      for (const e of this.coloured) {
        const col = e.part.geometry.getAttribute('color') as BufferAttribute | undefined;
        if (!col) continue;
        const arr = col.array as Float32Array;
        if (e.from?.length !== arr.length) e.from = new Float32Array(arr.length);
        e.from.set(arr);
      }
      this.inkFade.start(now);
    }
    this.inkLens = ctx.lens;
    const key = inkSignature(ctx), keyChanged = key !== this.inkKey;
    if (keyChanged) { this.inkKey = key; this.writeInk(ctx); }
    if (!keyChanged && !lensChanged && !this.inkFade.moving) return false;
    const k = this.inkFade.step(now);
    for (const e of this.coloured) {
      const col = e.part.geometry.getAttribute('color') as BufferAttribute | undefined;
      if (!col || !e.to) continue;
      const arr = col.array as Float32Array, to = e.to, from = this.inkFade.moving && e.from?.length === arr.length ? e.from : null;
      if (from) for (let i = 0; i < arr.length; i++) arr[i] = from[i]! + (to[i]! - from[i]!) * k;
      else arr.set(to);
      // (the lifted course keeps its lift through a lens change or a rewrite of the colours)
      if (this.tubeLift.amount > 0) this.liftRange(e, arr, arr, this.tubeLift.key, this.tubeLift.amount);
      col.needsUpdate = true;
    }
    return this.inkFade.moving;
  }
  /** The tone of one sinusoid course lifted a little toward lighter, in its own lens colour (owner, 27 Nov: "one anchor the eye rides through the zoom"): as a dive toward the sinusoid starts, the
   *  tube the camera is going into brightens by `amount` (0 to 1 of the way to white), easing back as the sinusoid lands. `key` is the course's `${kind}${id}`; 0 puts the lens's own colour back.
   *  Written into the part's vertex colours (the same buffer the lens's colours go to), only for that course's vertices, and only when the amount changes. */
  setTubeLift(key: string, amount: number): void {
    const was = this.tubeLift, a = Math.min(1, Math.max(0, amount));
    if (was.key === key && Math.abs(was.amount - a) < 1e-4) return;
    const old = was.key;
    this.tubeLift = { key, amount: a };
    for (const e of this.coloured) {
      if (!e.to || !e.ranges) continue;
      const col = e.part.geometry.getAttribute('color') as BufferAttribute | undefined;
      if (!col) continue;
      // (a lens fade in flight rewrites the whole colour each step, lift included: nothing to do here then)
      if (this.inkFade.moving) { col.needsUpdate = true; continue; }
      if (old !== key && e.ranges.has(old)) this.liftRange(e, col.array as Float32Array, e.to, old, 0);
      if (e.ranges.has(key)) this.liftRange(e, col.array as Float32Array, e.to, key, a);
      col.needsUpdate = true;
    }
  }
  /** The part's colours for one course's vertices: `from`'s colour taken `amount` of the way to white, into `arr`. */
  private liftRange(e: Coloured, arr: Float32Array, from: Float32Array, key: string, amount: number): void {
    const r = e.ranges?.get(key);
    if (!r) return;
    for (let i = r[0] * 3; i < r[1] * 3; i++) { const c = from[i]!; arr[i] = c + (1 - c) * amount; }
  }
  private inkLens: LensId | null = null;
  private readonly inkFade = new LensFade();

  /** The lens's colours for every coloured vertex now, into each part's `to` (stepInk shows them, faded in from `from` across a lens change). */
  private writeInk(ctx: InkContext): void {
    const lanes = ctx.lens === 'origin' || ctx.lens === 'firstpass';
    const N = 64, tmp: [number, number, number] = [0, 0, 0], tmp2: [number, number, number] = [0, 0, 0];
    // per segment and place along: the colour (every lens) and the sources' shares (the stream lenses), read once, not per vertex
    const luts = new Map<Seg, { col: Float32Array; sh: Float32Array }>();
    const lutOf = (seg: Seg) => {
      let l = luts.get(seg);
      if (l) return l;
      l = { col: new Float32Array((N + 1) * 3), sh: new Float32Array((N + 1) * 5) };
      const f: number[] = [];
      for (let i = 0; i <= N; i++) {
        inkAt(ctx, seg, i / N, tmp); l.col[i * 3] = tmp[0]; l.col[i * 3 + 1] = tmp[1]; l.col[i * 3 + 2] = tmp[2];
        if (lanes && seg !== 'art') { laneShares(ctx, seg, i / N, f); l.sh.set(f, i * 5); }
      }
      luts.set(seg, l);
      return l;
    };
    const colourAt = (seg: Seg, w: number, across: number, out: [number, number, number]) => {
      const l = lutOf(seg), j = Math.round(clamp(w, 0, 1) * N);
      if (!lanes || seg === 'art') { out[0] = l.col[j * 3]!; out[1] = l.col[j * 3 + 1]!; out[2] = l.col[j * 3 + 2]!; return out; }
      return inkAcross(ctx, seg, j / N, across, out, l.sh.subarray(j * 5, j * 5 + 5));
    };
    for (const e of this.coloured) {
      const col = e.part.geometry.getAttribute('color') as BufferAttribute | undefined;
      if (!col) continue;
      if (e.to?.length !== col.array.length) e.to = new Float32Array(col.array.length);
      const arr = e.to;
      // (each vertex's place across its vessel, -1 .. 1: what the streams are laid by; a part without it takes the middle)
      const ac = lanes ? e.ac : undefined;
      for (let v = 0; v < e.k.length; v++) {
        const k = e.k[v]!, across = ac ? ac[v]! : 0;
        if (e.seg && e.seg2 && e.w2 && e.m && e.m[v]! > 0) {
          // (a junction that joins two colour families: the one's colour at its place and the other's at its, blended by the skin's weights, a gradient through the junction)
          colourAt(e.seg, e.w[v]!, across, tmp); colourAt(e.seg2, e.w2[v]!, across, tmp2);
          const t = e.m[v]!;
          for (let q = 0; q < 3; q++) arr[v * 3 + q] = lerp(tmp[q]!, tmp2[q]!, t) * k;
        } else if (e.seg) { colourAt(e.seg, e.w[v]!, across, tmp); arr[v * 3] = tmp[0] * k; arr[v * 3 + 1] = tmp[1] * k; arr[v * 3 + 2] = tmp[2] * k; }
        else { arr[v * 3] = k; arr[v * 3 + 1] = k; arr[v * 3 + 2] = k; }
      }
      // a junction under the stream lenses: each arm's streams, at the vertex's place across THAT arm, blended by the skin's weights, so every stream runs on into the junction from each side and
      // they meet in it (one place across for the whole skin, the host's, left the other arms' half to one stream: the plain blocks at the joints, 26 Nov)
      if (lanes && e.skins && e.seg) for (const sk of e.skins) for (let j = 0; j < sk.n; j++) {
        const v = sk.v0 + j, k = e.k[v]!;
        let r = 0, g = 0, b = 0, tot = 0;
        for (let i = 0; i < 4; i++) {
          const wt = sk.wt[4 * j + i]!;
          if (wt <= 1e-4) continue;
          colourAt(sk.other[i] && e.seg2 ? e.seg2 : e.seg, sk.place[4 * j + i]!, sk.acr[4 * j + i]!, tmp);
          r += tmp[0] * wt; g += tmp[1] * wt; b += tmp[2] * wt; tot += wt;
        }
        if (tot > 0) { arr[v * 3] = (r / tot) * k; arr[v * 3 + 1] = (g / tot) * k; arr[v * 3 + 2] = (b / tot) * k; }
      }
    }
  }

  // ---- the tiles -----------------------------------------------------------------------------------------------------------------

  /** The first cell build in steps (`primeCells`), so the idle priming of the lobule never lays every tile inside one slice: false while there is more, true once the tiles for the model's state stand (update() then finds
   *  them built and builds nothing). */
  primeCells(): boolean {
    const look = this.flat.look, goal = this.flat.goalState;
    if (look === this.cellLook) return true;
    this.cellPrime ??= this.cellSteps(look, goal.congU, goal.septU);
    if (!this.cellPrime.next().done) return false;
    this.cellPrime = null;
    const { cb, nb } = this.cellNext!; this.cellNext = null;
    cb.build(this.cells.geometry); nb.build(this.nuclei.geometry);
    this.cells.setTint([1, 1, 1]); this.nuclei.setTint([1, 1, 1]);
    this.cellLook = look; this.cellKey = cellKeyOf(goal); this.cellGen = null; this.cellTween = null;
    return true;
  }

  /** Every hepatocyte as 2D paints it (lobule-paint.js paintLobule): its colour by zone and tone, zone 3's cells dead in congestion, the plates thickening and losing order in cirrhosis. */
  private buildCells(look: LookId, cu: number, sj: number): void {
    const g = this.cellSteps(look, cu, sj);
    while (!g.next().done);
    const { cb, nb } = this.cellNext!; this.cellNext = null;
    cb.build(this.cells.geometry); nb.build(this.nuclei.geometry);
    this.cells.setTint([1, 1, 1]); this.nuclei.setTint([1, 1, 1]);
  }

  private cellAttrs(): BufferAttribute[] {
    const at = (g: BufferGeometry, k: string) => g.getAttribute(k) as BufferAttribute;
    return [at(this.cells.geometry, 'position'), at(this.cells.geometry, 'normal'), at(this.cells.geometry, 'color'), at(this.nuclei.geometry, 'position'), at(this.nuclei.geometry, 'normal'), at(this.nuclei.geometry, 'color')];
  }

  /** One frame of the tiles' change: a few ms of the next build, then the ease between the old build and the new. True while either runs. */
  private stepCells(unseen: boolean): boolean {
    const nowMs = clock.now(), dt = this.cellAt < 0 ? 0 : Math.min(100, nowMs - this.cellAt);
    this.cellAt = nowMs;
    if (this.cellGen) {
      while (clock.now() - nowMs < 3) {
        if (!this.cellGen.next().done) continue;
        this.cellGen = null;
        const nx = this.cellNext!; this.cellNext = null;
        const to = [nx.cb.p, nx.cb.n, nx.cb.c, nx.nb.p, nx.nb.n, nx.nb.c].map((a) => Float32Array.from(a)), at = this.cellAttrs();
        if (to.some((a, i) => a.length !== at[i]!.array.length)) { nx.cb.build(this.cells.geometry); nx.nb.build(this.nuclei.geometry); this.cellTween = null; }
        else if (unseen) { to.forEach((a, i) => { (at[i]!.array as Float32Array).set(a); at[i]!.needsUpdate = true; }); this.cellTween = null; }
        else { const from = at.map((a) => Float32Array.from(a.array as Float32Array)); this.cellTween = { from, to, live: to.map((b, j) => differs(from[j]!, b)), t: 0 }; }
        break;
      }
    }
    const tw = this.cellTween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / CELL_EASE_MS);
      const e = tw.t * tw.t * (3 - 2 * tw.t), at = this.cellAttrs();
      // (an array the two builds share byte for byte, the tiles' colours when only the septa moved, the nuclei's normals and colours: nothing to ease and nothing to send to the GPU. 670 000 floats a frame for 900 ms were the lobule's whole per-frame cost, MASLD 7, audit 1161e159)
      for (let j = 0; j < at.length; j++) { if (!tw.live[j]) continue; const out = at[j]!.array as Float32Array, a = tw.from[j]!, b = tw.to[j]!; for (let i = 0; i < out.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * e; at[j]!.needsUpdate = true; }
      if (tw.t >= 1) this.cellTween = null;
    }
    return !!this.cellGen || !!this.cellTween;
  }

  /** The tiles for a state, a slice of cells at a time (each `yield` is a place a frame's share may end); the finished builders are left in `cellNext`. A dead cell's nucleus is built collapsed, so every state has the same
   *  vertices and the two builds can be eased between. */
  private *cellSteps(look: LookId, cu: number, sj: number): Generator<void> {
    const tc = tileColours(look), dark = tc.dark, net = this.flat.net, ground = tc.ground, nucInk = tc.nucInk, nucA = tc.nucA;
    const cb = new MeshBuilder(), nb = new MeshBuilder();
    let n = 0;
    for (const k of net.cells) {
      if (++n % 24 === 0) yield;
      // (how dead, 0 to 1, a smooth function of the place, dead-cells.ts: a ghost's fill, alpha, size, height and nucleus all ease by it, so zone 3 fades out from the vein and no tile is a coin toss beside its neighbour)
      const dk = cu > 0.08 && k.q < 0.45 ? deadAmount(cu, k.q, Math.atan2(k.y, k.x)) : 0;
      const live = tc.fill(k.q, k.tone), ghost = dark ? [0.42, 0.33, 0.3] : [0.93, 0.86, 0.72];
      const fill: RGB = dk > 0 ? [live[0]! + (ghost[0]! - live[0]!) * dk, live[1]! + (ghost[1]! - live[1]!) * dk, live[2]! + (ghost[2]! - live[2]!) * dk] : [live[0]!, live[1]!, live[2]!];
      const alpha = (dark ? 0.8 : 0.92) + (0.6 - (dark ? 0.8 : 0.92)) * dk;
      const col = mix3(ground, fill, alpha);
      const dz = sj * Math.min(k.l, k.w) * 0.45, cx = k.x + k.jx * dz, cy = k.y + k.jy * dz, a = k.a + k.ja * sj * 0.9;
      const sz = 1 - 0.3 * dk, lw = k.l * sz * (1 + 0.12 * sj), ww = k.w * sz * (1 + 0.3 * sj);
      const outline = roundRect(cx, cy, lw, ww, Math.min(lw, ww) * 0.38, a);
      const top = LZ.cellTop * (1 - 0.6 * dk);
      pillow(cb, outline, top, LZ.cellBot, Math.min(lw, ww) * R * BEVEL, col, 3);
      {
        // the nucleus: 2D's dot at nu along the cell, a low dome in the cell's colour under the nodule ink
        const nr = Math.max(1e-6, Math.max(0.0023, ww * 0.16) * R * (1 - dk)), ca = Math.cos(a), sa = Math.sin(a);
        const nx = cx + k.nu * lw * ca, ny = cy + k.nu * lw * sa;
        const nc = mix3(col, nucInk, Math.min(1, nucA * 2.4));
        ellipsoid(nb, nx * R, -ny * R, top - nr * 0.55, nr, nr, nr * 0.8, 0, nc, 12, 6);
      }
    }
    this.cellNext = { cb, nb };
  }

  /** The tiles of the sinusoid view's rows (lobule-fine.ts) for a look: every plate the view draws between its rows, as a raised tile in the lobule's own tone for
   *  its place (the same rule as the lobule's cells, tileColours) with a
   *  domed nucleus, and under them a cover in the gap colour a hair over the lobule's own tiles, so the tiles beneath give way (the plates are the view's, and a
   *  lobule cell half under one would show its edge beside the new tile's).
   *  The outlines are the view's own (sinusoid3d cellOutline) turned into the lobule's frame, so each tile is where the view draws its cell. Rebuilt for a look (the
   *  colours are the look's); never per frame. */
  private *fineTileSteps(look: LookId): Generator<void> {
    const tc = tileColours(look), cb = new MeshBuilder(), nb = new MeshBuilder(), gb = new MeshBuilder(), [j0, j1] = fineCellRange();
    const coverZ = LZ.cellTop + FINE_LIFT, topZ = coverZ + FINE_LIFT * 0.25, botZ = coverZ - 0.002, tmp: [number, number, number] = [0, 0, 0];
    const to = (x: number, y: number): P2 => { viewToLobule(x, y, tmp); return [tmp[0], tmp[1]]; };
    for (const band of fineBands()) {
      // the cover: from this band's inner row to its outer (the lumens' edges are drawn over it by the tubes)
      const y0 = band.side * -band.r * PERIOD, y1 = band.side * -(band.r + 1) * PERIOD;
      const q = [to(-FINE_REACH, y0), to(FINE_REACH, y0), to(FINE_REACH, y1), to(-FINE_REACH, y1)].map((p) => gb.v(p[0], p[1], coverZ, 0, 0, 1, tc.ground));
      gb.quad(q[0]!, q[1]!, q[2]!, q[3]!);
      for (let j = j0; j <= j1; j++) {
        const outline = cellOutline(j, band.seed, band.side, band.face, true).map((p) => to(p[0], p[1]));
        const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
        const col = tc.tile(hexFrac(cx / R, -cy / R), h1(j, band.seed + 7));
        pillow(cb, outline, topZ, botZ, CELL * UM_LOCAL * 0.28, col, 3);
        const c = cellOf(j, band.seed), xn = c.x0 + (c.x1 - c.x0) * c.nu, v = c.nv * UM.hep, nr = c.nr * UM_LOCAL, nc = tc.nucleus(col);
        const put = (x: number) => { const p = to(x, -band.side * (band.face(x) + v)); ellipsoid(nb, p[0], p[1], topZ - nr * 0.55, nr, nr, nr * 0.8, 0, nc, 12, 6); };
        if (c.bi) { const dx = (c.x1 - c.x0) * 0.17; put(xn - dx); put(xn + dx); } else put(xn);
        yield;
      }
    }
    cb.build(this.fineCells.geometry); nb.build(this.fineNuclei.geometry); gb.build(this.fineCover.geometry);
    this.fineCells.setTint([1, 1, 1]); this.fineNuclei.setTint([1, 1, 1]); this.fineCover.setTint([1, 1, 1]);
    this.fineCells.setInk(tissueInk(look));
    this.fineLook = look;
  }
  /** One frame of the fine tiles' build for the look wanted: a few ms of it (a cell a yield), the way the lobule's own tiles are laid (stepCells). True while more is to do. */
  private stepFineTiles(): boolean {
    if (this.fineWant === this.fineLook) return false;
    this.fineGen ??= this.fineTileSteps(this.fineWant as LookId);
    const t0 = clock.now();
    while (clock.now() - t0 < 3) if (this.fineGen.next().done) { this.fineGen = null; return this.fineWant !== this.fineLook; }
    return true;
  }
  private fineWant: LookId | '' = '';
  private fineGen: Generator<void> | null = null;
  /** The camera's distance from the sinusoid's station (scene units) in a picture `heightPx` tall at a lens of `fovDeg`: how much of the fine rows it shows (fineShare). True when that changed. */
  setFineView(distance: number, heightPx: number, fovDeg: number): boolean {
    const k = fineShare(distance, heightPx, fovDeg);
    if (k === this.fineK) return false;
    this.fineK = k;
    return true;
  }
  /** How much of the fine rows shows now (0 to 1). */
  get fineShown(): number { return this.fineK; }

  /** The hexagon's ground (2D: the lobule filled in the gap colour at 1.015), with a hole under every mouth so the openings go down into the slab. */
  private groundKey = '';
  private buildGround(kcv: number, lymph: boolean): void {
    const key = `${Math.round(kcv * 50)}|${lymph}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const net = this.flat.net, crn = net.corners.map((p) => new Vector2(p[0] * 1.015 * R, -p[1] * 1.015 * R));
    if (ShapeUtils.isClockWise(crn)) crn.reverse();
    const holes: Vector2[][] = [];
    // (a hole only where its disc lies wholly inside the hexagon: a hole across the edge (a triad on a vertex) made the triangulation throw spikes out past the vertices, which read as the
    //  lobule cut off at the sides of a phone; the mouth there sits over the ground's edge as it is)
    const inside = (x: number, y: number, rr: number) => {
      for (let i = 0; i < crn.length; i++) {
        const A = crn[i]!, B = crn[(i + 1) % crn.length]!, ex = B.x - A.x, ey = B.y - A.y, l = Math.hypot(ex, ey);
        if (((x - A.x) * ey - (y - A.y) * ex) / l > -rr) return false;   // (counter-clockwise: inside is to the left of each edge)
      }
      return true;
    };
    const hole = (c: Course, r: number) => {
      const p = c.pts[Math.floor(c.pts.length / 2)]!, h: Vector2[] = [];
      if (!inside(p[0] * R, -p[1] * R, r * R)) return;
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
  private stepMarks(unseen: boolean): boolean {
    const nowMs = clock.now(), dt = this.marksAt < 0 ? 0 : Math.min(100, nowMs - this.marksAt);
    this.marksAt = nowMs;
    const growing = this.stepGrow(dt / 1000, unseen);
    return this.stepPlates(unseen, dt) || growing;
  }
  /** The growth of the septa, the portal tracts and the vein's wall, eased at a fixed rate on the clock towards what the model asks (growth.ts): the collagen layer shows more or less, nothing is painted. True while any is moving. */
  private stepGrow(dtS: number, unseen: boolean): boolean {
    const goal = growGoal(this.flat.goalState), u = this.marksMat.uniforms.uP!.value as Vector3;
    let moving = false;
    for (let i = 0; i < 3; i++) { this.grow[i] = unseen ? goal[i]! : easeGrow(this.grow[i]!, goal[i]!, dtS); if (this.grow[i] !== goal[i]) moving = true; }
    u.set(this.grow[0], this.grow[1], this.grow[2]);
    this.flat.field.setHome(this.grow[1]);   // (the neighbour field clears a disc at each corner only as far as the tract collagen has grown: Healthy leaves the field as it was)
    return moving;
  }
  private stepPlates(unseen: boolean, dt: number): boolean {
    const f = this.flat;
    if (this.collStale && this.marksKey !== '') { this.collStale = false; const L = lookColours(f.look), B = PLATE_BOX * PLATE_S; this.paintCollagenHere(L, B, PLATE_PX / (2 * B)); }
    // (the key comes from the goal through ONE quantiser with hysteresis, plate.ts plateQuantizer: a goal sitting on a step of 1/32, as a live model's does, held one key; with none it flipped
    //  between two and the plate was repainted and crossfaded back and forth, Mohammad 22 Nov: "the fibrosis bands around the portal tract are flashing")
    const s: PlateState = { ...this.plateQ(f.goalState), septU: 0, fibPre: 0, fibPost: 0 };   // (the tissue plate has none of the collagen that grows: it is repainted for the look, the congestion, the stellate cells and the Disse lining only)
    const zones = f.layers.zones;
    const key = `${plateKey(s, f.look)}|${zones ? 'z' : ''}`;
    // A new state is painted ONCE, for where the model is going, in a worker (the 2048 px repaint is 100 to 300 ms on a phone: never on this thread), and the new plate crossfades over the old when it arrives.
    // The first plate, and a page with no worker, are painted here (the old plate dips while the new is painted).
    if (key !== this.marksKey && this.marksKey !== '' && this.plates.available) {
      // (a plate already crossfading in is finished first, never dropped half way: its fade froze at the middle, the next plate then began from 0 on the old plate's texture, and the stale plate
      //  was kept as the front one under the new key)
      if (key !== this.askedKey && !this.plateReady) {
        this.askedKey = key;
        const look = f.look;
        this.plates.ask({ look, s: quant(s), zones, skip: 2, cvR: DISC_R.cv, collagen: this.collLook !== look, tau: !this.tauTex }, (bmp, extra?: PlateExtra) => {
          if (extra?.tau && !this.tauTex) this.installTau(extra.tau);
          if (!bmp) { this.askedKey = ''; return; }   // (no worker after all: the next step paints here)
          if (this.askedKey !== key) { bmp.close(); extra?.collagen?.close(); return; }
          this.plateReady = { key, bmp, look, coll: extra?.collagen ?? null }; this.crossT = 0;
        });
      }
    } else if (key !== this.marksKey) {
      if (this.marksKey !== '' && !unseen && this.marksFade > 0) { this.marksFade = Math.max(0, this.marksFade - dt / MARKS_DIP_MS); this.marksMat.uniforms.opacity!.value = this.marksFade; return true; }
      this.paintMarks(key, s);
    }
    const rd = this.plateReady;
    if (rd) {
      if (this.crossT === 0 && !this.crossing) {
        const t = this.texSpare ?? (this.texSpare = this.newPlateTexture());
        const old = t.image as ImageBitmap | null; t.image = rd.bmp; t.needsUpdate = true; if (old && typeof old.close === 'function') old.close();
        this.marksMat.uniforms.mapB!.value = t; this.crossing = true;
        if (rd.coll) {
          this.atlas.stageBitmap(rd.coll);   // (closed once the GPU has it, collagen-atlas.ts)
          this.collNext = rd.look;
        }
        this.syncColl();
      }
      this.crossT = unseen ? 1 : Math.min(1, this.crossT + dt / PLATE_CROSS_MS);
      const e = this.crossT * this.crossT * (3 - 2 * this.crossT);
      this.marksMat.uniforms.mixB!.value = e;
      if (this.crossT >= 1) {
        // the new plate is the front one; the old one's texture is the spare for the next
        const t = this.marksMat.uniforms.mapB!.value as Texture, was = this.texFront;
        this.marksMat.uniforms.map!.value = t; this.texFront = t; this.texSpare = was === this.tex ? this.tex : was;
        this.marksMat.uniforms.mapB!.value = this.texSpare; this.marksMat.uniforms.mixB!.value = 0; this.crossing = false;
        if (rd.coll) { this.atlas.commit(); this.collLook = rd.look; }   // (the old look's atlas is disposed here: no spare is kept)
        this.syncColl();
        this.marksKey = rd.key; this.plateReady = null; this.crossT = 0;
        return key !== rd.key;   // (the goal moved on while it faded in: the next plate is asked next frame)
      }
      return true;
    }
    if (key !== this.marksKey && this.askedKey === key) return true;   // (the worker is painting)
    if (this.marksFade < 1) { this.marksFade = unseen ? 1 : Math.min(1, this.marksFade + dt / (MARKS_DIP_MS * 2)); this.marksMat.uniforms.opacity!.value = this.marksFade; return this.marksFade < 1; }
    return false;
  }
  /** The arrival times (collagen-tau.ts, bottom row first), once: a texture of their own, read with a linear filter and no mips. */
  private installTau(data: Uint8Array): void {
    const t = new DataTexture(data, PLATE_PX, PLATE_PX); t.flipY = false; t.generateMipmaps = false; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.needsUpdate = true;
    this.tauTex = t; this.marksMat.uniforms.mapT!.value = t;
  }
  private newPlateTexture(): Texture {
    const t = new Texture();
    t.flipY = false; t.premultiplyAlpha = false; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4;
    return t;
  }
  private paintMarks(key: string, s: PlateState): void {
    const f = this.flat, zones = f.layers.zones;
    this.marksKey = key;
    this.paints++;
    if (!this.canvas || !this.tex) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const L = lookColours(f.look);
    useTokens((name: string, a?: number | string) => L.tk(name, a));
    const q = (x: number) => Math.round(clamp(x, 0, 1) * 32) / 32;
    const input = { ...plateInput(this.shape, this.sins, DISC_R.cv, { congU: q(s.congU), septU: 0, fibSin: q(s.fibSin), act: q(s.act), fibPre: 0, fibPost: 0 }, f.look), zonesOn: zones };
    const B = PLATE_BOX * PLATE_S, n = PLATE_PX, sc = n / (2 * B);
    paintPlateWorld(skipFirstFills(ctx, 2), n, sc, -B, -B, input);
    this.tex.needsUpdate = true;
    // the collagen at its fullest, once per look (never for a change of fibrosis), and its arrival times, once
    if (this.collLook !== f.look) this.paintCollagenHere(L, B, sc);
    if (!this.tauTex) this.installTau(flipRows(collagenTau(this.shape, DISC_R.cv * PLATE_S, n, B), n));
  }

  /** The collagen at its fullest on the page (the first look, a page with no worker, a lost context): the 32 MB canvas lives only until the GPU has it. */
  private paintCollagenHere(L: ReturnType<typeof lookColours>, B: number, sc: number): void {
    const cv = defaultCanvas(PLATE_PX); if (!cv) return;
    cv.width = PLATE_PX * ATLAS_W;   // (an atlas two plates wide: the tracts and the vein, the septa)
    const cctx = cv.getContext('2d'); if (!cctx) return;
    useTokens((name: string, a?: number | string) => L.tk(name, a));
    paintCollagenWorld(cctx, PLATE_PX, sc, -B, -B, collagenInput(this.shape, DISC_R.cv, this.flat.look));
    this.atlas.setCanvas(cv); this.collLook = this.flat.look; this.syncColl();
  }
  /** The plate shader's two collagen samplers: the look on screen and the one crossfading in (the same when none is). */
  private syncColl(): void {
    const u = this.marksMat.uniforms;
    u.mapC!.value = this.atlas.now ?? this.blankColl; u.mapCB!.value = this.atlas.next ?? this.blankColl;
  }
  /** The graphics context came back (Stage.tsx rebuild): the atlas went with it and its pixels are gone, so it is painted again on the next step. */
  contextRestored(): void {
    this.atlas.reset(); this.collLook = ''; this.collStale = true; this.syncColl();
    const rd = this.plateReady; if (rd?.coll) { rd.coll.close(); this.plateReady = { ...rd, coll: null }; }
    this.askedKey = '';
  }

  // ---- the vessels (built once; their widths follow the state through `inflate`, their colours through stepInk) -----------------

  /** The vessels' meshes in one go (what is left of them, when Scene's idle slices have begun). */
  private buildVessels(): void { if (!this.vgen) this.vgen = this.vesselSteps(); while (!this.vgen.next().done); this.vgen = null; this.vesselsBuilt = true; }
  /** The same, one part at a time: each `yield` is a place an idle slice may end. */
  private *vesselSteps(): Generator<void> {
    const net = this.flat.net, plan = this.weldPlan, pace = new Pacer(), done = this.coloured;   // (a step ends once STEP_WORK of vertices are written and copied: cel3d.ts meshWork)
    this.coloured.length = 0;
    const by = (...k: Course['kind'][]) => net.courses.filter((c) => k.includes(c.kind));
    type Alt = { seg2: Seg; w2: number[]; m: number[] };
    type InkData = { ac?: number[]; skins?: SkinInk[]; ranges?: Map<string, [number, number]> };
    const coloured = function* (part: MicroPart, b: MeshBuilder, seg: Seg | null, w: number[], k: number[], alt?: Alt, ink?: InkData): Generator<void> {
      yield* b.buildSteps(part.geometry, pace);
      done.push({
        part, seg, w: Float32Array.from(w), k: Float32Array.from(k), ...(alt ? { seg2: alt.seg2, w2: Float32Array.from(alt.w2), m: Float32Array.from(alt.m) } : {}),
        ...(ink?.ac ? { ac: Float32Array.from(ink.ac) } : {}), ...(ink?.skins?.length ? { skins: ink.skins } : {}), ...(ink?.ranges ? { ranges: ink.ranges } : {}),
      });
    };
    // the welded tubes (lobule/welds.ts): each course's kept stretches, then the skin of every junction whose host it is, written with the same per-vertex numbers the unwelded tubes have
    const kindOf = new Map<string, Course['kind']>(net.courses.map((c) => [`${c.kind}${c.id}`, c.kind]));
    const welded = function* (cs: Course[], seg: number, withSwell: boolean, alt: ((rho: number) => number) | null, family: (kind: Course['kind']) => boolean): Generator<void, PartData> {
      // (ac, skins: each vertex's place across and the junctions' arms, for the stream lenses)
      const d: PartData = {
        b: new MeshBuilder(), W: [], K: [], ir: [], ac: [], skins: [],
        ...(withSwell ? { sw: [] as number[] } : {}), ...(alt ? { W2: [] as number[], M: [] as number[] } : {}), ranges: new Map<string, [number, number]>(),
      };
      const keys = new Set(cs.map((c) => `${c.kind}${c.id}`));
      const opts = (out: WeldCourseOut): EmitOpts => ({
        R, seg, endHush: END_HUSH_R * out.rad[0]!, ...(withSwell ? { cong: congShare } : {}), ...(alt ? { altW: alt } : {}),
        // (no marks just outside the central vein, where the sinusoids pour into it)
        marksAt: (o, i) => !(withSwell && Math.hypot(o.pts[i]![0], o.pts[i]![1]) / R < DISC_R.cv * 1.6),
      });
      for (const c of cs) {
        const v0 = d.b.count;
        emitCourse(d, plan!.courses.get(`${c.kind}${c.id}`)!, opts(plan!.courses.get(`${c.kind}${c.id}`)!));
        d.ranges!.set(`${c.kind}${c.id}`, [v0, d.b.count]);
        if (pace.due()) yield;
      }
      for (const sk of plan!.skins) if (keys.has(sk.host)) { emitSkin(d, sk, plan!.courses, opts(plan!.courses.get(sk.host)!), (key) => family(kindOf.get(key)!)); if (pace.due()) yield; }
      return d;
    };
    // each vertex's place across its tube (the stream lenses' lanes: lobule/ink.ts inkAcross), from its normal as a ring has it, on every vertex, the round ends too. `seg` the tube's ring size
    const acrossFor = (AC: number[], b: MeshBuilder, before: number, ringVerts: number, capVerts: number, seg: number, pts: readonly (readonly number[])[]) => {
      const path = pts.map((q) => [q[0]!, q[1]!] as const);
      for (let v = before; v < before + ringVerts; v++) {
        const i = Math.floor((v - before) / seg), a = path[Math.max(0, i - 1)]!, d = path[Math.min(path.length - 1, i + 1)]!;
        let tx = d[0] - a[0], ty = d[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        AC.push(-ty * b.n[v * 3]! + tx * b.n[v * 3 + 1]!);
      }
      // (the round ends' place across, from their normals and the end's direction, as a ring's)
      for (let e = 0; e < 2; e++) {
        const i = e === 0 ? 0 : path.length - 1, a = path[Math.max(0, i - 1)]!, d = path[Math.min(path.length - 1, i + 1)]!;
        let tx = d[0] - a[0], ty = d[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        for (let v = before + ringVerts + e * capVerts; v < before + ringVerts + (e + 1) * capVerts; v++) AC.push(-ty * b.n[v * 3]! + tx * b.n[v * 3 + 1]!);
      }
    };
    type TubesOut = { b: MeshBuilder; W: number[]; K: number[]; caps: Map<Course, number>; IR: number[]; ac: number[] };
    /** Tubes along courses: radius per sample, colour place per sample (w), brightness 1. */
    const tubes = function* (cs: Course[], radius: (c: Course, i: number) => number, w: (c: Course, i: number) => number, z: number | ((c: Course, i: number) => number) = LZ.tube, SEG = TUBE_SEG): Generator<void, TubesOut> {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [], caps = new Map<Course, number>(), IR: number[] = [], AC: number[] = [];
      for (const c of cs) {
        if (pace.due()) yield;
        const pts = c.pts.map((p, i) => at3(p, typeof z === 'number' ? z : z(c, i)));
        const before = b.count;
        tube(b, pts, (i) => Math.max(1e-4, radius(c, i) * R), [1, 1, 1], SEG, true);
        // (tube() writes the rings in order, then the two caps: the first cap's rings are the first sample's, the last's the last's)
        const ringVerts = c.pts.length * SEG, capVerts = (b.count - before - ringVerts) / 2;
        caps.set(c, capVerts);
        for (let i = 0; i < c.pts.length; i++) for (let s = 0; s < SEG; s++) { W.push(w(c, i)); K.push(1); }
        for (let v = 0; v < capVerts; v++) { W.push(w(c, 0)); K.push(1); }
        for (let v = 0; v < capVerts; v++) { W.push(w(c, c.pts.length - 1)); K.push(1); }
        // (each vertex's own tube radius, the one the ring was written with: the ink's width never outgrows it)
        for (let i = 0; i < c.pts.length; i++) for (let s = 0; s < SEG; s++) IR.push(Math.max(1e-4, radius(c, i) * R));
        for (let v = 0; v < capVerts; v++) IR.push(Math.max(1e-4, radius(c, 0) * R));
        for (let v = 0; v < capVerts; v++) IR.push(Math.max(1e-4, radius(c, c.pts.length - 1) * R));
        flowAux(b, before, pts, ringVerts, capVerts, c.id * 0.137, (i) => (c.kind[0] === 's' || c.kind === 'an') && c.rho[i]! < DISC_R.cv * 1.6, SEG, END_HUSH_R * radius(c, 0) * R);
        acrossFor(AC, b, before, ringVerts, capVerts, SEG, pts);
      }
      return { b, W, K, caps, IR, ac: AC };
    };
    const sinR = (c: Course, i: number) => sinRadius(c.kind as 's0' | 's1' | 's2' | 'an', c.rho[i]!);
    const sinWAt = (c: Course, i: number) => sinW(c.rho[i]!);
    for (const kind of ['s0', 's1', 's2', 'an'] as const) {
      // (a sinusoid ends inside the central vein's mouth: its last samples there are dropped, so it pours over the lip rather than lying across the opening)
      const cs = by(kind).map((c) => trimInside(c, DISC_R.cv * 0.78));
      if (plan) {
        const d = yield* welded(cs, TUBE_SEG, true, () => 0, (k) => k !== 'tw');
        yield* coloured(this.sin[kind], d.b, 'sin', d.W, d.K, { seg2: 'art', w2: d.W2!, m: d.M! }, d);
        this.sin[kind].geometry.setAttribute('swell', new Float32BufferAttribute(d.sw!, 2));
        this.sin[kind].geometry.setAttribute('inkR', new Float32BufferAttribute(d.ir!, 1));
        continue;
      }
      const t = yield* tubes(cs, sinR, sinWAt, OVER_Z);
      yield* coloured(this.sin[kind], t.b, 'sin', t.W, t.K, undefined, t);
      this.sin[kind].geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1));
      // each vertex's radius and its place's share of congestion's widening (cel3d SWELL): the width runs smoothly along every course and through every join (widths.ts congShare)
      const sw: number[] = [];
      for (const c of cs) {
        const n = c.pts.length, at = (i: number) => { const r = sinR(c, i) * R; sw.push(r, r * congShare(c.rho[i]!)); };
        for (let i = 0; i < n; i++) for (let k = 0; k < TUBE_SEG; k++) at(i);
        const cap = t.caps.get(c)!;
        for (let v = 0; v < cap; v++) at(0);
        for (let v = 0; v < cap; v++) at(n - 1);
      }
      this.sin[kind].geometry.setAttribute('swell', new Float32BufferAttribute(sw, 2));
      if (pace.due()) yield;
    }
    // the sinusoid view's own rows the lobule lacks round its station (lobule-fine.ts), built as plain tubes of the second generation: the lobule's own width, colour along the flow and flow marks
    {
      const fc = fineCourses(net, OVER_Z);
      if (fc.length) {
        const t = yield* tubes(fc, sinR, sinWAt, OVER_Z);
        yield* coloured(this.fineTubes, t.b, 'sin', t.W, t.K, undefined, t);
        this.fineTubes.geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1));
        const sw: number[] = [];
        for (const c of fc) {
          const n = c.pts.length, at = (i: number) => { const r = sinR(c, i) * R; sw.push(r, r * congShare(c.rho[i]!)); };
          for (let i = 0; i < n; i++) for (let k = 0; k < TUBE_SEG; k++) at(i);
          const cap = t.caps.get(c)!;
          for (let v = 0; v < cap; v++) at(0);
          for (let v = 0; v < cap; v++) at(n - 1);
        }
        this.fineTubes.geometry.setAttribute('swell', new Float32BufferAttribute(sw, 2));
      }
    }
    if (plan) { const d = yield* welded(by('in'), TUBE_SEG, false, sinW, (k) => k === 'in'); yield* coloured(this.inlets, d.b, 'in', d.W, d.K, { seg2: 'sin', w2: d.W2!, m: d.M! }, d); this.inlets.geometry.setAttribute('inkR', new Float32BufferAttribute(d.ir!, 1)); }
    else { const t = yield* tubes(by('in'), (c, i) => inletRadius(i, c.pts.length, Math.hypot(c.pts[i]![0] - c.pts[0]![0], c.pts[i]![1] - c.pts[0]![1])), (c, i) => i / (c.pts.length - 1)); yield* coloured(this.inlets, t.b, 'in', t.W, t.K, undefined, t); this.inlets.geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1)); }
    if (pace.due()) yield;
    if (plan) { const d = yield* welded(by('tw'), TUBE_SEG, false, null, () => false); yield* coloured(this.twigs, d.b, 'art', d.W, d.K, undefined, d); this.twigs.geometry.setAttribute('inkR', new Float32BufferAttribute(d.ir!, 1)); }
    else { const t = yield* tubes(by('tw'), (c, i) => twigR(i / (c.pts.length - 1), RS_N), () => 0, OVER_Z); yield* coloured(this.twigs, t.b, 'art', t.W, t.K, undefined, t); this.twigs.geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1)); }
    if (pace.due()) yield;
    // the terminal lymphatics along the edges
    { const t = yield* tubes(lymphIntoPools(by('lt'), by('lv')), () => LT_R, () => 0, LZ.tube, THIN_SEG); yield* coloured(this.lt, t.b, null, t.W, t.K); this.lt.geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1)); }
    if (pace.due()) yield;
    // the lymph channels (2D's `ly`, "a thin channel beside each sinusoid, between the sinusoid and its plate", geometry.ts): a thin lymph tube along the OUTSIDE of its sinusoid, from the limiting plate in, tapering
    // to a thread before the central vein (widths.ts lyTaper); it runs out against the blood, so the course is laid from the vein to the edge. Mohammad 20 Nov 2026: "those lymph vessels should be drawn like on the
    // outside of the blood vessels and taper to nothing closer to 90% of the way to the central vein". They were a flat sleeve centred ON each sinusoid, a third wider than the sinusoid each side: where two sinusoids
    // part at a small angle the two sleeves covered the cleft between them, the broad grey-green wedges. Each vertex keeps its own radius in `swell`, so the layer's fade shrinks every width by its own share (no tube inverts).
    {
      const lym = by('ly').map((c) => ({ ...c, pts: [...c.pts].reverse(), rho: [...c.rho].reverse(), ...(c.free ? { free: [c.free[1], c.free[0]] as [boolean, boolean] } : {}) }));
      const r = (c: Course, i: number) => DUCT_R * lyTaper(c.rho[i]!) * endTaper(c, i);
      // ... and where one passes a blood vessel it goes UNDER it, not through it (Mohammad, 20 Nov 2026: "pass UNDER the sinusoid's blood vessel not through it to connect to their interportal vessels"): the channel's reach
      // from the terminal lymphatic crosses the inlet venule, and nothing else; its depth eases from the beside-the-sinusoid level to LYMPH_UNDER_Z over a few tube widths (lymphCover), so it dives as it nears the vessel, runs
      // wholly beneath it and rises again on the far side, joined to the lymphatic's own axis at its end (no blunt stub standing in the blue)
      const covers: Cover[] = [
        ...by('in').map((c) => ({ pts: c.pts, rad: c.pts.map((q, i) => inletRadius(i, c.pts.length, Math.hypot(q[0] - c.pts[0]![0], q[1] - c.pts[0]![1]))), band: 3 })),
        ...by('lt').map((c) => ({ pts: c.pts, rad: c.pts.map(() => LT_R), band: 3 })),
        ...[...by('s0'), ...by('s1'), ...by('s2')].map((c) => ({ pts: c.pts, rad: c.pts.map((_, i) => sinRadius(c.kind as 's0', c.rho[i]!)), band: 0.4 })),
        // (a cross-link meets the sinusoid's side where its lymph runs: the channel dives under it over a few tube widths rather than stopping at its mouth)
        ...by('an').map((c) => ({ pts: c.pts, rad: c.pts.map((_, i) => sinRadius('an', c.rho[i]!)), band: 2.5 })),
      ];
      const under = new Map<(typeof lym)[number], number[]>();
      for (const c of lym) { under.set(c, lymphCover(c.pts, (i) => r(c, i), covers)); meshWork.n += c.pts.length * covers.length / 4; if (pace.due()) yield; }   // (a course at a time: each tests its samples against every vessel it may pass under)
      const t = yield* tubes(lym, r, () => 0, (c, i) => LYMPH_Z + (LYMPH_UNDER_Z - LYMPH_Z) * under.get(c)![i]!, THIN_SEG), sw: number[] = [], hg: number[] = [];
      for (const c of lym) {
        if (pace.due()) yield;
        // (the tube hugs its sinusoid's wall: each vertex carries the plan direction out from the sinusoid's axis, the wall's radius and the place's share of congestion's widening, so the vertex shader moves it out by the
        //  wall's own growth, cel3d HUG: a swollen sinusoid takes its lymph with it instead of covering it)
        const sib = net.courses[c.sib!]!, hug = c.pts.map((q) => {
          let bd = Infinity, fx = q[0], fy = q[1], rho = c.rho[0]!;
          for (let j = 0; j + 1 < sib.pts.length; j++) {
            const a = sib.pts[j]!, e = sib.pts[j + 1]!, bx = e[0] - a[0], by2 = e[1] - a[1], bb = bx * bx + by2 * by2, u = bb ? Math.min(1, Math.max(0, ((q[0] - a[0]) * bx + (q[1] - a[1]) * by2) / bb)) : 0, x = a[0] + bx * u, y = a[1] + by2 * u, d = Math.hypot(q[0] - x, q[1] - y);
            if (d < bd) { bd = d; fx = x; fy = y; rho = sib.rho[j]! + (sib.rho[j + 1]! - sib.rho[j]!) * u; }
          }
          const l = Math.hypot(q[0] - fx, q[1] - fy) || 1;
          // (a stretch that does not stand against its sinusoid, the reach across the inlet to the terminal lymphatic, does not move with it)
          return [(q[0] - fx) / l, -(q[1] - fy) / l, bd < sinRadius(sib.kind as 's0', rho) + 3 * DUCT_R ? sinRadius(sib.kind as 's0', rho) * R : 0, congShare(rho)] as const;
        });
        meshWork.n += c.pts.length * 3;
        const n = c.pts.length, at = (i: number) => { const v = Math.max(1e-4, r(c, i) * R); sw.push(v, 0); hg.push(...hug[i]!); };
        for (let i = 0; i < n; i++) for (let k = 0; k < THIN_SEG; k++) at(i);
        const cap = t.caps.get(c)!;
        for (let v = 0; v < cap; v++) at(0);
        for (let v = 0; v < cap; v++) at(n - 1);
      }
      yield* coloured(this.duct, t.b, null, t.W, t.K); this.duct.geometry.setAttribute('swell', new Float32BufferAttribute(sw, 2)); this.duct.geometry.setAttribute('inkR', new Float32BufferAttribute(t.IR, 1)); this.duct.geometry.setAttribute('hug', new Float32BufferAttribute(hg, 4));
    }
    if (pace.due()) yield;
    // the Bile layer, laid out as 2D lays it (bile.ts, a port of lobule-bile.js): a channel beside each plate's sinusoid from a quarter of the way out, thickening outward, a short
    // canal of Hering square into a duct along the edge outside the lymphatic, each half edge's duct into its corner's ductule; 2D's radii; arrowheads toward the ductule
    {
      if (plan) {
        const d: PartData = { b: new MeshBuilder(), W: [], K: [], ir: [] }, keys = new Set<string>();
        for (const out of plan.courses.values()) if (out.key.startsWith('bile')) keys.add(out.key);
        const o: EmitOpts = { R, seg: 6, endHush: 0 };
        for (const k of keys) emitCourse(d, plan.courses.get(k)!, o);
        for (const sk of plan.skins) if (keys.has(sk.host)) emitSkin(d, sk, plan.courses, o, () => true);
        yield* coloured(this.bile, d.b, null, d.W, d.K);
        this.bile.geometry.setAttribute('inkR', new Float32BufferAttribute(d.ir!, 1));
      } else {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [], IR: number[] = [];
      buildBile(net).forEach((c, n) => {
        const pts = c.pts.map((p) => at3(p, LZ.cellTop + 0.001)), before = b.count;
        tube(b, pts, (i) => Math.max(2e-4, c.radius[i]! * R), [1, 1, 1], 6, true);
        for (let v = before; v < b.count; v++) { W.push(0); K.push(1); }
        const ringVerts = pts.length * 6, capV = (b.count - before - ringVerts) / 2;
        for (let i = 0; i < pts.length; i++) for (let k = 0; k < 6; k++) IR.push(Math.max(2e-4, c.radius[i]! * R));
        for (let v = 0; v < capV; v++) IR.push(Math.max(2e-4, c.radius[0]! * R));
        for (let v = 0; v < capV; v++) IR.push(Math.max(2e-4, c.radius[pts.length - 1]! * R));
        flowAux(b, before, pts, ringVerts, capV, n * 0.29, null, 6);
      });
      yield* coloured(this.bile, b, null, W, K);
      this.bile.geometry.setAttribute('inkR', new Float32BufferAttribute(IR, 1));
      }
    }
    if (pace.due()) yield;
    // the mouths: each end-on vessel (venule, arteriole, ductule, lymphatic, central vein) a round wall FULL of its own colour, never an empty cylinder (Mohammad 20 Nov 2026: "the blood vessels
    // and bile should not look like empty cyllindars, just filll them with the color")
    const mouths = function* (part: MicroPart, cs: Course[], r: number, seg: Seg | null, vessel = false, top?: number): Generator<void> {
      const b = new MeshBuilder(), W: number[] = [], K: number[] = [], AC: number[] = [];
      for (const c of cs) {
        const p = c.pts[Math.floor(c.pts.length / 2)]!, before = b.count, cx = p[0] * R;
        mouth(b, p[0] * R, -p[1] * R, r * R, LZ.lip, LZ.mouthDepth * Math.min(1, r / DISC_R.pv), K, MOUTH_SEG, vessel, top);
        // (a vessel seen end on: its streams lie side by side across its round mouth, its place across the disc's width)
        for (let v = before; v < b.count; v++) AC.push(Math.max(-1, Math.min(1, (b.p[v * 3]! - cx) / (r * R))));
      }
      for (let v = 0; v < b.count; v++) W.push(seg === 'cv' ? 1 : 0);
      yield* coloured(part, b, seg, W, K, undefined, { ac: AC });
    };
    // each pool's top: a hair above the tallest tube that runs into it (the inlets into the venule, the twigs into the arteriole, the canals of Hering into the ductule, the terminal
    // lymphatics into the lymphatic, the sinusoids into the central vein), so a tube that reaches it is lost inside it and none runs over it
    const POUR = 1.04, N_IN = by('in')[0]?.pts.length ?? 40;
    yield* mouths(this.mouthPv, by('pv'), DISC_R.pv, 'pv', true, (LZ.tube + inletRadius(0, N_IN, 0) * R) * POUR);
    yield* mouths(this.mouthHa, by('ha'), DISC_R.ha * HA_K, 'art', true, (OVER_Z + twigR(0, RS_N) * R) * POUR);
    yield* mouths(this.mouthBd, by('bd'), DISC_R.bd * BD_K, null, true, (LZ.cellTop + 0.001 + 0.0078 * R) * POUR);
    yield* mouths(this.mouthLv, by('lv'), DISC_R.lv, null, true, (LZ.tube + LT_R * R) * POUR);
    yield* mouths(this.mouthCv, by('cv'), DISC_R.cv, 'cv', true, (OVER_Z + sinRadius('s2', DISC_R.cv) * R) * POUR);
    // the rebuild overwrote every vertex colour: the lens colours are written again at the next stepInk, whichever path finished the build
    this.inkKey = '';
  }

  /** SOS (Mohammad 20 Nov 2026: "fiber collagen to be inside the central vein as well ... so it shows it's blocked"; 22 Nov: it must look like the bands outside): the ring is one mesh at its fullest and the one shader shows as much of it as the
   *  vein's growth has reached (collagen-tau.ts B: the lumen closes in as the cuff grows out). It comes in with the disease and goes with it, never repainted. */
  private stepCvScar(kcv: number): void {
    const on = this.grow[2] > 0.0005, u = this.marksMat.uniforms;
    // (the one band, cv-band.ts: the same numbers for the marks plate past the wall and the scar mesh inside it, the live wall and the eased growth; the mesh's uv does not know its scale, so it is told)
    const g = cvGeom(this.flat.cvRadiusNow, this.flat.net.rcv0, this.grow[2]);
    (u.uCv!.value as Vector4).set(g.rL, g.rw, g.rC, g.k);
    this.cvScar.setOpacity(on ? (u.opacity!.value as number) : 0);
    this.cvScar.group.scale.set(kcv, kcv, 1);
    (this.cvScar.mats.toon.uniforms.uScarK!).value = kcv;
    if (!on) return;
    const base = `${this.flat.look}`;
    if (base !== this.cvScarBase) {
      this.cvScarBase = base;
      const L = lookColours(this.flat.look), gap = L.rgb01('--og-liver-2'), cell = L.rgb01('--og-liver-1'), sep = L.rgb01('--lz-septum');
      (u.uCvCol!.value as Vector3).set(sep[0]!, sep[1]!, sep[2]!);
      (this.marksMat.uniforms.uBase!.value as Vector3).set(gap[0]! + (cell[0]! - gap[0]!) * 0.85, gap[1]! + (cell[1]! - gap[1]!) * 0.85, gap[2]! + (cell[2]! - gap[2]!) * 0.85);
    }
  }

  /** Vertex count of everything this scene draws (tests and the budget). */
  get vertexCount(): number {
    let n = 0;
    for (const p of [this.ground, this.cells, this.nuclei, this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.inlets, this.twigs, this.lt, this.duct, this.bile, this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv, this.cvScar]) n += p.geometry.getAttribute('position')?.count ?? 0;
    return n;
  }
  /** The parts (tests). */
  get partsForTest(): MicroPart[] { return [this.ground, this.cells, this.nuclei, this.sin.s0, this.sin.s1, this.sin.s2, this.sin.an, this.inlets, this.twigs, this.lt, this.duct, this.bile, this.mouthPv, this.mouthHa, this.mouthBd, this.mouthLv, this.mouthCv, this.cvScar, this.fineCover, this.fineCells, this.fineNuclei, this.fineTubes]; }
  /** The height (local units) of the tallest blood-vessel tube standing within the dive's view of the lobule (the sinusoid's own station, rho 0.3 to 0.6): its axis at OVER_Z and its radius as drawn now, congestion's
   *  widening included. The sinusoid scene stands over this (sinusoid3d.ts lift), so no lobule tube ever pokes through its ground while the two cross (23 Nov, the dive's flash). */
  diveTopZ(): number {
    let r = 0;
    for (let i = 0; i <= 6; i++) {
      const rho = DIVE_RHO[0] + ((DIVE_RHO[1] - DIVE_RHO[0]) * i) / 6, sc = this.flat.sinScaleAt(rho);
      for (const k of ['s0', 's1', 's2', 'an'] as const) r = Math.max(r, sinRadius(k, rho) * sc);
    }
    return OVER_Z + r * R;
  }
  private buildFineForTest(): void { if (this.fineWant !== this.fineLook) { const g = this.fineTileSteps(this.fineWant as LookId); while (!g.next().done); } }
  /** Builds the tiles for a look and state without the flat view's frame (tests). */
  buildForTest(look: LookId, congU = 0, septU = 0): void {
    if (!this.vesselsBuilt) this.buildVessels();
    this.buildCells(look, congU, septU);
    this.applyLook(look); this.buildGround(1, true);
    this.buildFineForTest();
  }

  dispose(): void {
    this.disposed = true;
    for (const p of this.partsForTest) p.dispose();
    this.marks.geometry.dispose(); this.marksMat.dispose(); this.tex?.dispose(); this.texSpare?.dispose(); this.atlas.dispose(); this.tauTex?.dispose(); this.plates.dispose(); this.plateReady?.bmp.close(); this.plateReady?.coll?.close();
  }
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------------

/** What shows between the cells: where the tiles do not reach (the wedges beside a sinusoid, where the cords part around it) and in the narrow gaps between them, one colour, the dark of the tile's own casing.
 *  2D's gap colour (groundOf) is pale, and 2D's cells have only a hair of line, so there the clefts read as tissue; here every tile is outlined and its gap is dark, so the same pale ground in a
 *  wider cleft stood out as a grey-green plate (Mohammad 20 Nov 2026: "those big plates"). The cells keep their colours (buildCells mixes them over groundOf, as 2D). */
export function floorOf(bg: RGB, gap: RGB, dark: boolean, ink: RGB): [number, number, number] {
  return mix3(groundOf(bg, gap, dark), ink, FLOOR_INK);
}
/** The share of the casing's ink in the floor: nearly all, a trace of the gap's hue. */
export const FLOOR_INK = 0.85;



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
export function flowAux(b: MeshBuilder, before: number, pts: readonly (readonly [number, number, number])[], ringVerts: number, capVerts: number, phase: number, hush: ((i: number) => boolean) | null, seg = TUBE_SEG, endHush = 0): void {
  const m = pts.length, arc: number[] = [phase];
  for (let i = 1; i < m; i++) arc.push(arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  // (no marks within endHush of either end: there a vessel runs into another, and a chevron half under the other's wall showed as a dark speck, eyes 20 Nov on the RHF lobule)
  const nearEnd = (i: number) => endHush > 0 && (arc[i]! - arc[0]! < endHush || arc[m - 1]! - arc[i]! < endHush);
  const across = (v: number, i: number) => {
    const a = pts[Math.max(0, i - 1)]!, c = pts[Math.min(m - 1, i + 1)]!;
    let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = b.n[v * 3]!, ny = b.n[v * 3 + 1]!;
    return hush?.(i) || nearEnd(i) ? 3 : -ty * nx + tx * ny;
  };
  for (let v = before; v < before + ringVerts; v++) { const i = Math.floor((v - before) / seg); b.aux.push(arc[i]!); b.aux2.push(across(v, i)); }
  // (the round ends carry no flow marks: their along-the-vessel place is one number across the whole cap, so a chevron that fell on it filled the cap, a black square at every
  //  end and kink, eyes 20 Nov on the RHF lobule; 3 hushes the marks, as inside the central vein)
  for (let v = before + ringVerts; v < before + ringVerts + capVerts; v++) { b.aux.push(arc[0]!); b.aux2.push(3); }
  for (let v = before + ringVerts + capVerts; v < before + ringVerts + 2 * capVerts; v++) { b.aux.push(arc[m - 1]!); b.aux2.push(3); }
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

/** SOS's scar in the central vein (its shape: lobule/cv-intima.ts, shared with the plate's painter). The onset is the span of fibPost over which it eases in, never a see-through strength. */
export { CV_FILL, cvScarGrowth };
/** Just over the central vein's pool top (its mouth's top, buildVessels' POUR), under nothing else. */
const CV_SCAR_Z = (): number => (OVER_Z + sinRadius('s2', DISC_R.cv) * R) * 1.04 + 0.002;

/** The scar's mesh, flat at height z over a vein of radius rw: a plain annulus from CV_MESH_IN of the wall out to the wall. The shader draws the lumen's edge and the band on it (cv-band.ts), so the mesh has no shape of its own:
 *  a round lumen, no lobes, nothing to disagree with the collagen outside the wall. */
export function buildCvScar(geo: import('three').BufferGeometry, rw: number, z: number): void {
  const b = new MeshBuilder(), N = 96;
  const outer: number[] = [], inner: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
    outer.push(b.v(rw * CV_WALL * c, rw * CV_WALL * sn, z, 0, 0, 1)); inner.push(b.v(rw * CV_MESH_IN * c, rw * CV_MESH_IN * sn, z, 0, 0, 1));
  }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; b.quad(inner[i]!, outer[i]!, outer[j]!, inner[j]!); }
  b.build(geo);
}
