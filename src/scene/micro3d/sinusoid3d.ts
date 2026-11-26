// The sinusoid as a true 3D scene (Settings > Figure depth > 3D lobule and sinusoid; Mohammad, 20 Nov 2026: "You just rebuild in 3D then. And make it perfect. It should look 100% the
// same if not better"). The same cut through one sinusoid that 2D paints (sinusoid-gl.js), built as solid, cel-shaded shapes in the same micrometres, so the names, the arrows, the taps and
// the camera of the host (sinusoid/view.ts, the model with no picture of its own) fit it unchanged:
//
//   the lumen       an open trough cut along the sinusoid, the blood's pressure colour, red cells and albumin riding in it (fastest in the middle, 2D's lanes)
//   the lining      a thin shell of endothelium each side (src/scene/micro3d/sinusoid-wall.ts), cut open along the sinusoid: the cell is the shell's own swell at its nucleus, the nucleus an outlined section on the cut, the fenestrae straight bores through the shell's thickness to Disse (a half-pipe gutter on the cut, a whole round hole beside it), opening and closing with the lining's porosity
//   Disse           a recessed channel between the lining and the plate (the lymph's colour), the hepatocytes' microvilli reaching into it, collagen and a basement membrane as they build up,
//                   the stellate cell lying in it (it swells and darkens as it activates and pinches the lumen), albumin that crossed the wall running back toward the portal tract
//   the plates      hepatocytes as raised tiles with a rounded bevel and a domed nucleus, bile canaliculi on their borders; the next sinusoid and plate beyond each, as 2D repeats them outward
//   the Kupffer cell on the lower lining, its arms in the lumen
//
// Everything reads the host's own state (its eased targets, palette, traffic, places), so the two can never disagree: this file draws, the host keeps the model, the names and
// the clock. Every place is 2D's (layout.ts and the copied widths); every colour is 2D's palette for the look. Nothing here is per-pixel painting: the shapes are meshes, cel shaded
// (cel3d.ts), and only the albumin, the red cells and the fenestrae's gap table are rewritten while the view is up.
import { staticRouteTexture } from '../blood/routes.ts';
import { dustTuner } from '../blood/dust.ts';
import { useSettings } from '../../state/settings.ts';
import { DataTexture, Float32BufferAttribute, Group, Matrix4, NearestFilter, RGBAFormat, UnsignedByteType, Vector3, Vector4, type ShaderMaterial } from 'three';
import type { CelShared } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import type { SinusoidView } from '../sinusoid/view.ts';
import { U } from '../sinusoid/view.ts';
import { SIN_REL } from '../lobule/frames.ts';
import { HCT_HEALTHY } from '../lobule/model.ts';
import { CELL, SEED, SLOT, UM, canaliculusAt, cellOf, edgeAt, nucAt, poreAt, poreOpenness, underNucleus, type Pore } from '../sinusoid/layout.ts';
import { TROUGH_K, WALL, buildBore, buildCut, buildNucleusSection, buildShellSteps, newWeights, phiAt, wallColumns, type Weights } from './sinusoid-wall.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { SHAPE_NODES, SHAPE_RAMP, restDisseW, restHalfW, shapeInverse, shapeUniform } from './sinusoid-shape.ts';
import {
  MeshBuilder, MicroMany, MicroPart, COPY_W, Pacer, meshWork, type P2, type RGB, chaikin, ellipsoid, hazeUniforms, microMaterials, rawRGB, outlineNormals, pillow, placeAt, tube, unitRbc, unitRod, unitSphere,
} from './cel3d.ts';
import { type CellColours, cellColour } from '../sinusoid/lens.ts';

/** How far along the sinusoid (µm each way) the scene is built: past anything the camera can hold (the host's reach). */
/** Segments round a red cell's lathe (sinusoid3d: 16, was 40). */
export const RBC_SEG = 16;
/** The vertices the wall's polynomial fit takes in one step of the shapes' last section (about FIT_CHUNK x 3 of the build meter). */
const FIT_CHUNK = 4000;
const q64 = (x: number): number => Math.round(x * 64);
/** What the sinusoid's shapes are built from (everything but the stellate cell, basement and fibres' own scalar). */
export const shapeKey = (S: { lum: number; pinch: number; col: number }, xk: unknown): string => `${q64(S.lum)}|${q64(S.pinch)}|${q64(S.col)}|${xk}`;
/** What only the tail (stellate cell, basement membrane, collagen) is built from beyond the shapes: the activation. */
export const tailKey = (S: { act: number }): string => `${q64(S.act)}`;
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
// (26: the whole scene, its ground 12 µm down included, stands over the lobule's tubes (their tops about 11 µm up in these units) and tiles: at 8 the tube showed through the lumen and the
//  lobule's branches through the ground while it grew, a hybrid picture, eyes 20 Nov. holdScale keeps it its landed size on screen however high it stands.)
export const LIFT = 26;
/** How far (µm) the scene's lowest surface stands over the tallest lobule tube in view, at the least. */
export const LIFT_MARGIN = 2;
/** One µm of this scene in the lobule's local units (the scene's unit is U per µm and SIN_REL lobule units: lobule/frames.ts). */
export const UM_LOBULE = U * SIN_REL;
/** The dive share over which the scene grows out from its lumen (see update): from nothing to whole, which the lobule's standing aside follows (scene.ts LOBULE_UNDER_FROM). */
/** CSS px per µm from which the small shapes' lines are whole (see rimK). */
export const RIM_FULL_PX = 2.5;
/** The same for the albumin beads (about 0.4 µm round): whole from 8 CSS px per µm (eyes 20 Nov: they were the dark dots across the lumen in the dive, at 4 px per µm all line). */
export const ALB_RIM_FULL_PX = 8;
/** The dive's focus pull (Mohammad 20 Nov 2026: the disc and the band read as a window and "an old TV"): over FOCUS[0]-FOCUS[1] of the dive's share the whole picture goes soft, over
 *  FOCUS[1]-FOCUS[2] the sinusoid comes in over the lobule inside that blur (its screen-door fade, which the blur turns into a true dissolve), and over FOCUS[2]-1 it sharpens to its own
 *  focus band: one picture coming into focus, no edge or shape anywhere. Going out it runs back the same way. */
export const FOCUS = [0.2, 0.45, 0.68] as const;
/** The focus pull's blur at the dissolve's middle, against the rest's (Mohammad 20 Nov: the blur came in "kinda quickly too strongly"): only as soft as the dissolve needs, eased in with
 *  a smootherstep from FOCUS[0] so it has no start, peaking at the dissolve's middle, then held while the sinusoid's own band opens over FOCUS[2]-1 and its sides settle to the rest's. */
export const FOCUS_PEAK = 0.4;
const smoother = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };
/** The blur's strength at dive share `d` (FOCUS_PEAK at the dissolve's middle, 1 landed, as at rest). */
export function focusBlur(d: number): number {
  const mid = (FOCUS[1] + FOCUS[2]) / 2;
  return d < mid ? FOCUS_PEAK * smoother(FOCUS[0], mid, d) : FOCUS_PEAK + (1 - FOCUS_PEAK) * smoother(FOCUS[2], 1, d);
}
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
/** The bile canaliculus's radius (µm): a round lumen about 1.6 µm across between two hepatocytes. */
export const CANAL_R = 0.72;
/** A red cell's radius (µm). Mohammad 26 Nov 2026: "don't make the RBCs any bigger than they are now; just make them much more", so the blood fills with more cells, never bigger ones:
 *  this number is the size, and tests/sinusoid-rbc-density.test.ts pins it. */
export const RBC_R = 1.05;
/** The stretch the red cells run over (µm along the flow): the albumin's, which the blur hides the ends of (TRAFFIC_REACH). */
export const RBC_SPAN = 2 * TRAFFIC_REACH + 16;
/** How much of its picture a red cell covers (µm²): its disc turned a little off the view (the tilts run 0.2 to 0.9 rad). */
export const RBC_SHADOW = Math.PI * RBC_R * RBC_R * 0.8;
/** The red cells' count is the blood's: the share of the lumen's picture they cover equals the hematocrit (`HCT_HEALTHY` 0.42 for a healthy patient), so anemia thins the stream and a transfusion packs it.
 *  Cells are not drawn larger to fill the lumen (that is RBC_R's rule), so a healthy sinusoid carries `RBC_N` of them over its stretch,
 *  the blood nearly touching cell to cell with the lens colour and the protein showing between. */
export const RBC_N = Math.round(HCT_HEALTHY * 2 * UM.lum * RBC_SPAN / RBC_SHADOW);
/** The next sinusoids' share of that (they are out of focus beyond the plates, and each is a cost in triangles): each of the two carries this many at a healthy hematocrit. */
export const RBC_FAR_SHARE = 0.5;
export const RBC_FAR = Math.round(RBC_N * RBC_FAR_SHARE);
/** The most the stream is packed (against healthy: a hematocrit of 0.525): what a transfusion can reach, and what the instance buffers are sized for. */
export const RBC_DENSITY_MAX = 1.25;
/** Rings of a red cell's profile (its dimple is drawn from them); the cell is a few pixels across, so 8 read as smooth as 16 and the thousand cells of a healthy stream cost half the triangles. */
export const RBC_RINGS = 8;
/** The stream's density against healthy (1) from the hematocrit: the cells in each lane are `RBC_N * density` (a float: the one cell beyond the whole ones grows in as it is added, never pops). */
export const rbcDensity = (hct: number): number => clamp(hct / HCT_HEALTHY, 0, RBC_DENSITY_MAX);
/** The red cells drawn in this sinusoid's lumen and in each of the two next ones at a hematocrit (fractions count the cell growing in). */
const RBC_CAP_MAIN = Math.ceil(RBC_N * RBC_DENSITY_MAX), RBC_CAP_FAR = Math.ceil(RBC_FAR * RBC_DENSITY_MAX), RBC_CAP = RBC_CAP_MAIN + 2 * RBC_CAP_FAR;
export const rbcWanted = (hct: number): { main: number; far: number } => { const d = rbcDensity(hct); return { main: RBC_N * d, far: RBC_FAR * d }; };

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
  cur: { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number; hct: number };
  pal: { palette(dark: boolean): Record<string, unknown> };
  traffic: { pts: Float32Array; readonly flowX: number; readonly lymX: number };
  geo: { xs: number; xk: number; pores: Pore[][] };
  g: { halfW(x: number): number; disseW(x: number): number; wallIn(x: number): number; hepIn(x: number): number };
  endShown: [number, number];
  dive: number | null;
  lifeTime: number;
  readonly pxPerUm: number;
  look: LookId;
  spriteCount: number;
  readonly washProgress: number;
  VW: { vis: [number, number] };
  isVisible: boolean;
  trafficSpeed: number;
  ends: readonly [number, number, number];
  /** The red cells' colouring under Blood origin or First pass (sinusoid/lens.ts), null under every other lens. */
  readonly cellColours?: CellColours | null;
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
  private tailKey = '';
  /** The scene's one shape uniform (lumen, pinch, collagen, xs): sinusoid-shape.ts. */
  readonly shapeU = shapeUniform();
  /** The host's geometry functions while the shapes are built at a moved state (the rest's, and the rest's with H and D each one micrometre wider); null otherwise: the host's own. */
  private shapeGen: Generator<void> | null = null;
  private shapeG: { halfW(x: number): number; wallIn(x: number): number; disseW(x: number): number; hepIn(x: number): number } | null = null;
  private shapePass = 0;
  private get anchored(): Set<MicroPart> { return new Set([this.cells, this.nuclei, this.nucleoli, this.bile]); }
  private shapeSnaps: Float32Array[][] = [];
  /** The shapes are built (at rest, with their `dH`, `dD`, `dH2` moves): until then the scene draws nothing, and the next `prepareShapeStep` does one more pass. */
  shapeReady = false;
  private lookKey = '';
  private hscKey = -1;
  /** The wall's per-vertex colour weights (see sinusoid-wall.ts) and the palette they were last painted from. */
  private shellW: Weights = newWeights();
  private cutW: Weights = newWeights();
  private lastPal: Pal | null = null;
  private readonly m4 = new Matrix4();
  // the parts
  private readonly ground: MicroPart;
  private readonly trough: MicroPart;
  private readonly troughFar: MicroPart;
  private readonly bead: MicroPart;
  private readonly beadLine: MicroPart;
  private readonly bores: MicroPart;
  private readonly disse: MicroPart;
  private readonly cells: MicroPart;
  private readonly nuclei: MicroPart;
  private readonly nucleoli: MicroPart;
  private readonly bile: MicroPart;
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
  /** The red cells of the three lanes (this sinusoid's, then the next one's each way), each lane in the order they are added as the hematocrit rises; `rbcStart` is where each lane begins. */
  private readonly rbcs: { u: number; y: number; z: number; tilt: number; spin: number; ph: number; lane: -1 | 0 | 1 }[] = [];
  private readonly rbcStart: [number, number, number, number] = [0, 0, 0, 0];

  constructor(flat: SinusoidView, shared: CelShared) {
    this.flat = flat as unknown as Flat;
    this.res = shared.res;
    this.group.name = 'sinusoid3d';
    // the scene is built in micrometres, the plane's y up: one group scales it to the host's units (it turns with the host's group in a portrait room)
    this.group.scale.setScalar(U);
    // (while the camera dives in it stands a little proud of the lobule's plate it sits in, so it is drawn over the lobule, never through it; at rest it lies in the host's own plane, where the names are pinned)
    const mk = (name: string, o: Parameters<typeof microMaterials>[2] = {}) => new MicroPart(new MeshBuilder().build(), microMaterials(this.res, this.fade, { haze: this.haze, rimK: this.rimK, ...o }), `sinusoid3d/${name}`);
    const many = (name: string, geo: ReturnType<typeof unitSphere>, cap: number, o: Parameters<typeof microMaterials>[2] = {}, colours = false) => new MicroMany(geo, microMaterials(this.res, this.fade, { haze: this.haze, rimK: this.rimK, ...o }), cap, `sinusoid3d/${name}`, colours);
    const S = CEL_STYLE.MICRO;
    this.ground = mk('ground', { ink: null });
    // (open sheets carry no hull ink: their edges are inked by the lining's own lines)
    // (the Anatomy's dust in place of the lanes, in the blood's and the lymph's own colours: Mohammad 20 Nov, the same streaks everywhere. Each stream one lane table, its lattice's pitch its half width in µm)
    const dustOf = (half: number) => ({ routeTex: { value: staticRouteTexture(1, new Map(), () => half) }, dustP: dustTuner.uniform });
    this.trough = mk('lumen', { ink: null, streaks: true, dust: dustOf(UM.lum), shape: { u: this.shapeU } });
    this.troughFar = mk('lumen-beyond', { ink: null, streaks: true, dust: dustOf(UM.lum), shape: { u: this.shapeU } });
    // (the fenestrae are real gaps through the lining, the bead and its edges alike: one texel a 1 µm slot, each side; stepPores writes how open each is)
    const gaps = { tex: this.gapTex, x: new Vector4(GAP_X0, GAP_SLOTS, 0.5, 0) };
    // (the lining's two edges are its own line, drawn in its fill against the plate's up: its rounded bead turns square to the plate at the lumen's rim and at Disse's side. They were thin ribbons
    //  laid over it, half buried in the bead and under the lining cells' lenses, so the lumen's edge read as a dark line with holes 6-12 px long, eyes 20 Nov)
    // (the wall is a shell round the lumen cut open at z = 0, sinusoid-wall.ts: its inner surface down the curve ('endothelium', the bores' second holes round gaps in it), the cut itself
    //  ('endothelium-cut', the first bore of each slot a full-width gap through it, so it shows the half-pipe below), and the bores' insides. Their colours are per-vertex weights, painted in colour(): the cell's
    //  lighter sheet melts into the wall's and the wall into the blood's, never a step or a line)
    this.bead = mk('endothelium', { ink: null, gaps, holes: { s: WALL.s2, dx: WALL.dx2 }, rim: S.LINE_SMALL, vertexColors: true, shape: { u: this.shapeU, second: true } });
    this.beadLine = mk('endothelium-cut', { ink: null, gaps, rim: S.LINE_SMALL, rimUp: true, rimUV: true, vertexColors: true, shape: { u: this.shapeU } });
    this.bores = mk('endothelium-bores', { ink: null, vertexColors: true });
    this.disse = mk('disse', { ink: null, streaks: true, dust: dustOf(UM.disse * 0.5 + 0.5), shape: { u: this.shapeU } });
    this.cells = mk('hepatocytes', { px: S.LINE, shape: { u: this.shapeU, anchored: true } });
    // (the small solid shapes, the nuclei, the canaliculi, the lining's cells, the Kupffer and stellate cells, albumin and the red cells, draw their line inside their own fill (cel3d.ts uRim):
    //  whole and smooth on every screen, never fighting the surface behind; their hull lines broke into dashes and specks, eyes 20 Nov)
    this.nuclei = mk('nuclei', { ink: null, rim: S.LINE, rimUp: true, shape: { u: this.shapeU, anchored: true } });
    this.nucleoli = mk('nucleoli', { ink: null, shape: { u: this.shapeU, anchored: true } });
    this.bile = mk('canaliculi', { ink: null, rim: S.LINE_SMALL, rimUp: true, shape: { u: this.shapeU, anchored: true } });
    this.endoNi = mk('endothelial-nuclei', { ink: null, rim: S.LINE_SMALL, rimUp: true, rimUV: true, shape: { u: this.shapeU } });   // (the nucleus the cut passes through: its section on the cut)
    this.kup = mk('kupffer', { ink: null, rim: S.LINE });
    this.kupN = mk('kupffer-nucleus', { ink: null });
    // (see-through: the body and its nucleus blend over the stream but still write depth and draw before the line, so the line behind the body never shows through it; colour premultiplied)
    for (const [p, o] of [[this.kup, 10], [this.kupN, 11]] as const) {
      const m = p.mats.toon; m.transparent = true; m.depthWrite = true; m.premultipliedAlpha = true; m.uniforms.opacity!.value = KUP_ALPHA; p.toonMesh.renderOrder = o;
    }
    this.hsc = mk('stellate', { ink: null, rim: S.LINE_SMALL, rimUp: true });
    this.hscN = mk('stellate-nucleus', { ink: null });
    this.bm = mk('basement', { ink: null, transparent: true });
    this.arrows = mk('ends', { px: S.LINE_SMALL });
    this.villi = many('microvilli', unitRod(6), 900, { px: S.LINE_SMALL });
    this.fibres = many('collagen', unitRod(6), 800, { ink: null });
    this.albumin = many('albumin', unitSphere(12, 8), 2000, { ink: null, rim: S.LINE_SMALL, rimK: this.rimKAlb });   // (its own ramp: a bead well under a micrometre is all line long before a red cell is)
    // (RBC_SEG round. 40 was set against a dashed outline (22 segments, eyes 20 Nov) before the ink hull went DoubleSide and stopped culling by normal (6f7d101), which is what the dashes were;
    //  the cell is a few px across, so 16 segments read round and cost 40% of the triangles: 2560 to 1024 a cell, review 21 Nov #12)
    this.rbc = many('red-cells', unitRbc(RBC_SEG, RBC_RINGS), RBC_CAP, { ink: null, rim: S.LINE }, true);
    // (order: the ground first, then the solid shapes; the see-through membrane and the arrows last)
    for (const p of [this.ground, this.disse, this.troughFar, this.trough, this.bead, this.beadLine, this.bores, this.cells, this.nuclei, this.nucleoli, this.bile, this.endoNi, this.kup, this.kupN, this.hsc, this.hscN, this.bm, this.arrows]) this.group.add(p.group);
    for (const p of [this.villi, this.fibres, this.albumin, this.rbc]) this.group.add(p.group);
    this.bm.renderOrder = 20;
    // (each lane's cells sit on a low-discrepancy lattice in (along, across, depth), so however many are drawn they are spread evenly, never clumped or leaving a hole:
    //  a random scatter of a thousand cells piled some on top of each other beside empty stretches)
    const r = mulberry(91), lanes = [[0, RBC_CAP_MAIN], [-1, RBC_CAP_FAR], [1, RBC_CAP_FAR]] as const;
    for (const [lane, cap] of lanes) {
      this.rbcStart[lane === 0 ? 0 : lane < 0 ? 1 : 2] = this.rbcs.length;
      for (let k = 0; k < cap; k++) {
        const o = lattice(k + 1, lane === 0 ? 0 : 0.37 * (lane + 1));
        this.rbcs.push({ u: o[0], y: o[1] * 1.5 - 0.75, z: o[2], tilt: 0.2 + r() * 0.7, spin: (r() - 0.5) * 0.8, ph: r() * Math.PI * 2, lane });
      }
    }
    this.rbcStart[3] = this.rbcs.length;
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
  /** The tallest lobule tube in view (local units of the lobule, Lobule3D.diveTopZ): the scene stands so that its ground, 12 µm down in its own units, is over it by LIFT_MARGIN at the least, however far congestion has widened the tubes. */
  setLobuleTop(z: number): void { this.lobTop = z; }
  private lobTop = 0;
  /** The lift (µm): LIFT, or higher where the lobule's tubes stand higher (congestion). */
  liftUm(): number { return Math.max(LIFT, this.lobTop / UM_LOBULE - Z.ground + LIFT_MARGIN); }
  /** The lift (toward the eye, over the lobule while the two cross) never changes the scene's size on screen: the group shrinks by the eye's distance to its plane against the lifted
   *  distance, about the point under the eye, so the lumen stays exactly as wide as the lobule's tube it grows out of (eyes 20 Nov: lumen 70 px against the tube's 40, a 1.7x step at the
   *  handoff, with the camera smooth: the lift of 8 µm was near half the eye's height there). Call after the camera has moved and update() has set the lift. */
  holdScale(eyeWorld: Vector3): void {
    const g = this.group, lift = g.position.z, p = g.parent;
    let k = 1, fx = 0, fy = 0;
    if (lift > 0 && p) {
      p.updateWorldMatrix(true, false);
      const e = p.worldToLocal(this.eyeL.copy(eyeWorld));
      if (e.z > lift * 1.01) { k = (e.z - lift) / e.z; fx = e.x; fy = e.y; }
    }
    g.scale.setScalar(U * k);
    g.position.x = fx * (1 - k); g.position.y = fy * (1 - k);
  }
  private readonly eyeL = new Vector3();
  /** The lines' share by the scene's size on screen (cel3d uRimK): whole from RIM_FULL_PX CSS px per µm, none at a third of it. */
  private readonly rimK = { value: 1 };
  /** The same for the albumin beads, whole from ALB_RIM_FULL_PX. */
  private readonly rimKAlb = { value: 1 };

  /** `force`: the priming pass (Scene's idle slices): everything a first shown frame would build is built now, hidden. */
  update(on: boolean, rate = 1, force = false, upTo = 9): boolean {
    const f = this.flat;
    const changed = on !== this.on;
    this.on = on;
    const shown = force || (on && f.isVisible);
    // (paused, the blood stands still: the red cells, the albumin and the streaks stop with the simulation, Mohammad 20 Nov 2026; `rate` is the scene's one eased pause/play rate, so they ease to a stop and back up)
    f.trafficSpeed = Math.min(1, Math.max(0, rate)) * (on ? PACE : 1);
    this.group.visible = shown && !force;
    if (!shown) return changed;
    // the dive: the scene comes in over the lobule as the camera lands (the host's own share), whole at rest
    const d = f.dive;
    // (the sinusoid comes in inside the blur, FOCUS: dithered, which the blur over it turns into a smooth dissolve; whole before the picture sharpens)
    this.fade.value = d == null ? 1 : smooth(FOCUS[1], FOCUS[2], d);
    { const k = f.pxPerUm; this.rimK.value = k > 0 ? smooth(RIM_FULL_PX / 3, RIM_FULL_PX, k) : d != null ? 0 : 1; this.rimKAlb.value = k > 0 ? smooth(ALB_RIM_FULL_PX / 3, ALB_RIM_FULL_PX, k) : d != null ? 0 : 1; }   // (a smooth ramp in the scene's size, never a switch; unmeasured in a dive (its first frame), none, so a line never shows whole for a frame and then thins)   // (a red cell 7 µm across keeps its whole line from about 17 px wide; smaller, the line goes before the cell is a dot)
    this.group.position.z = d == null ? 0 : this.liftUm() * U * (1 - smooth(0.9, 1, d));   // (down only once the lobule has stood aside, scene.ts LOBULE_UNDER_FROM + 0.04)
    const dark = LOOKS[f.look].scheme === 'dark';
    const P = f.pal.palette(dark) as unknown as Pal;
    const S = f.cur;
    const q = (x: number) => Math.round(x * 64);
    // (only what the SHAPES read keys the rebuild: the lumen, its pinch, the collagen's Disse (disseW) and the pores' slots. The basement membrane's share (`bm`, its opacity, set below) and the microvilli's (`mv`, read in
    //  colour()) are no geometry, so an ease of either no longer remeshes the whole scene 64 times; the stellate cell's activation redoes only the stellate cell, the basement and the collagen: buildTail. Review 21 Nov, the dive's stalls.)
    while (!this.shapeReady) this.prepareShapeStep();   // (the idle slices have normally done this long before; a view shown first does the rest here)
    this.shapeU.value.set(S.lum, S.pinch, S.col, f.geo.xs);   // (the shapes follow the state on the GPU: nothing is rebuilt for the lumen, the pinch or the collagen)
    const key = shapeKey(S, f.geo.xk);
    if (key !== this.builtKey) { this.builtKey = key; this.tailKey = tailKey(S); this.buildTail(); this.kupT = Number.NaN; this.stepLife(true); this.gapKey = -1; }
    else if (tailKey(S) !== this.tailKey) { this.tailKey = tailKey(S); this.buildTail(); }
    if (upTo < 2) return changed;   // (the idle priming does one piece a step, `upTo` 1..4: each piece is keyed, so the next call skips what is done and nothing is built twice)
    // (the colours are the palette's: the stellate cell's activation tints only the stellate cell, `colourHsc`; before, an activation different from the one the idle priming saw repainted the whole wall's
    //  per-vertex colours inside the first shown frame, 8 ms on a laptop, 100 ms and more on an iPhone)
    const lk = `${f.look}|${P.cLumen.join(',')}|${P.cLymph.join(',')}`;
    if (lk !== this.lookKey) { this.lookKey = lk; this.hscKey = -1; this.colour(P); }
    if (upTo < 3) return changed;
    const ak = q(S.act);
    if (ak !== this.hscKey) { this.hscKey = ak; this.colourHsc(P, S.act); }
    if (upTo < 4) return changed;
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
  /** How far the blur has eased from one level over the whole screen (0) to the resting band (1): the dive's share, see focusBand. */
  focusOpen = 1;
  focusBand(a: Vector3, b: Vector3, e0: Vector3, e1: Vector3, ends?: { mid: Vector3; f0: Vector3; f1: Vector3 }): number {
    if (!this.on || !this.group.visible) return 0;
    this.group.updateWorldMatrix(true, false);
    const d = this.flat.dive, rest = this.flat.g.hepIn(0) + UM.hep * 0.5, w = (v: Vector3, x: number, y: number) => this.group.localToWorld(v.set(x, y, 0));
    // (the focus pull is one blur over the WHOLE screen, never a window opening: the band keeps its resting geometry through the dive and `open` (0 closed: the picture blurs the same everywhere, 1 the
    //  resting band) is only how far each pixel's blur has eased from that one level to its own, post-dof.ts bandOpen. The sharp strip used to open outward from the axis and the ends, which read as a
    //  box or a reveal to the right and left, Mohammad 20 Nov 2026: "just blur as you zoom in, then unblur the entire screen")
    const open = d == null ? 1 : smooth(FOCUS[2], 1, d);
    this.focusOpen = open;
    const y0 = rest;
    w(a, -20, 0); w(b, 20, 0); w(e0, 0, y0); w(e1, 0, y0 + BLUR_RUN);
    // the two ends melt away well before the scene stops (Mohammad 20 Nov: "don't let me see the end of the sinusoid like that ... blur the ends")
    if (ends) { w(ends.mid, 0, 0); w(ends.f0, REACH - END_BLUR[0], 0); w(ends.f1, Math.max(REACH - END_BLUR[1], REACH - END_BLUR[0] + 2), 0); }
    return d == null ? this.fade.value : focusBlur(d);
  }

  // ---- colours -------------------------------------------------------------------------------------------------------------------

  private colour(P: Pal): void {
    // the hepatocytes' line: their own colour darkened (2D's cleft tone), run round every microvillus too, the one thin line where two neighbours touch, and the ring round each canaliculus
    // (the ground under the cells takes the same tone: it shows only in that hair of contact and in the round gap; Mohammad 20 Nov 2026: "next to each other and just have like a circular
    // gap around the bile duct between them")
    const cellInk = mul3(P.cCell, CELL_LINE_K);
    this.ground.setTint(cellInk);
    this.trough.setTint(P.cLumen); this.trough.setInk(deep(P.cEndoE, 0.9));
    this.troughFar.setTint(mix3(P.cLumen, P.cBg, 0.2)); this.troughFar.setInk(deep(P.cEndoE, 0.9));
    this.bead.setTint([1, 1, 1]); this.bead.setInk(P.cEndoE); this.beadLine.setTint([1, 1, 1]); this.beadLine.setInk(P.cEndoE);   // (the wall's colours are per vertex: paintWall)
    this.bores.setTint(mix3(P.cEndo, P.cEndoE, 0.4));
    this.lastPal = P; this.paintWall();
    this.disse.setTint(P.cLymph);
    this.cells.setTint(P.cCell); this.cells.setInk(cellInk);
    this.nuclei.setTint(mix3(P.cCell, P.cNuc, 0.55)); this.nuclei.setInk(inkOf(P.cNuc));
    this.nucleoli.setTint(mix3(P.cNuc, P.cCell, 0.15));
    this.bile.setTint(P.cBile); this.bile.setInk(inkOf(P.cBile));
    this.endoNi.setTint(P.cEndoN); this.endoNi.setInk(inkOf(P.cEndoE));
    this.kup.setTint(mix3(P.cKup, P.cLumen, 0.45)); this.kup.setInk(deep(P.cKup, 0.55));   // (a little faded, outlined in its own colour, darker: Mohammad 20 Nov 2026)
    this.kupN.setTint(deep(P.cKup, 0.62));   // (the nucleus a deeper shade of the cell itself; it sat in the comment above, so the nucleus drew white, eyes 20 Nov)
    this.bm.setTint(P.cBm);
    this.villi.setTint(P.cCell); this.villi.setInk(cellInk);   // (the hepatocyte's own colour, outlined: "outline the villi")
    this.fibres.setTint(P.cCol);
    this.albumin.setTint(P.cAlb); this.albumin.setInk(inkOf(P.cAlbE));
    // (a red cell is a clear, bright red in two tones with a bold dark line of its own red, as every solid here: 2D's darker red read as brown under the shade, Mohammad 20 Nov "should not be colored brown")
    // (the red is each cell's own colour, not the part's tint, so a lens that colours the cells by their source (sinusoid/lens.ts) eases each one from it:
    //  the tint is white, stepRbc writes the colour)
    this.rbcRed = mix3(P.cRbc, [0.96, 0.3, 0.32], 0.45); this.rbc.setTint([1, 1, 1]); this.rbc.setInk(inkOf(P.cRbc));
  }
  private rbcRed: RGB = [0.9, 0.3, 0.32];
  private readonly rbcCol: [number, number, number] = [0, 0, 0];

  /** The stellate cell's colour by its activation (a few uniforms). */
  private colourHsc(P: Pal, act: number): void {
    const hc = mix3(P.cHscQ, P.cHscA, clamp(act, 0, 1));
    this.hsc.setTint(hc); this.hsc.setInk(inkOf(hc)); this.hscN.setTint(P.cHscN);
  }

  /** The wall's colours: per vertex, the lining's colour, the cell's lighter sheet by its share, and the blood's by the fade down the curve (cf. sinusoid-wall.ts Weights). */
  private paintWall(): void {
    const P = this.lastPal;
    if (!P) return;
    for (const [part, w] of [[this.bead, this.shellW], [this.beadLine, this.cutW]] as const) {
      const col = part.geometry.getAttribute('color');
      if (!col || col.count !== w.cell.length) continue;
      const a = col.array as Float32Array;
      // (no array per vertex: a lerp of a lerp, written straight in; the same numbers as mix3(mix3(endo, endoS, cell), lumen, lum))
      const e = P.cEndo, es = P.cEndoS, lu = P.cLumen;
      for (let i = 0; i < w.cell.length; i++) {
        const c = w.cell[i]!, l = w.lum[i]!;
        for (let k = 0; k < 3; k++) { const m = e[k]! + (es[k]! - e[k]!) * c; a[i * 3 + k] = m + (lu[k]! - m) * l; }
      }
      col.needsUpdate = true;
    }
  }

  // ---- the shapes that follow the state (rebuilt at 1/64 steps of it) ------------------------------------------------------------

  private buildShape(): void { for (const _ of this.shapeSteps()); }
  /** The shapes' build in sections: each `yield` is a place an idle slice may end (a pass is hundreds of ms on a phone, as one task). */
  private *shapeSteps(): Generator<void> {
    const g = this.shapeG ?? this.flat.g;
    const X0 = -REACH, X1 = REACH, DX = 1;
    const pace = new Pacer();   // (a step ends once STEP_WORK of vertices are written and copied, cel3d.ts meshWork)
    const xs: number[] = [];
    for (let x = X0; x <= X1 + 1e-6; x += DX) xs.push(x);

    // the ground under everything (seen only in the clefts between cells)
    { const b = new MeshBuilder(); const a = b.v(X0 - 20, -ACROSS - 20, Z.ground, 0, 0, 1), c = b.v(X1 + 20, -ACROSS - 20, Z.ground, 0, 0, 1), e = b.v(X1 + 20, ACROSS + 20, Z.ground, 0, 0, 1), h = b.v(X0 - 20, ACROSS + 20, Z.ground, 0, 0, 1); b.quad(a, c, e, h); b.build(this.ground.geometry); }
    if (pace.due()) yield;

    // the lumen: an open trough, an ellipse across (the lumen's half width wide, Z.trough of it deep)
    {
      // (from the wall's own surface down: the shell (sinusoid-wall.ts) covers the curve up to WALL.phi1 from the cut, so the trough stops where it ends and the two meet exactly)
      const b = new MeshBuilder(), K = 20, rows: number[] = [], T1 = Math.PI / 2 - WALL.phi1;
      for (const x of xs) {
        rows.push(b.count);
        const h = g.halfW(x), D = h * Z.trough;
        for (let k = 0; k <= K; k++) {
          const th = -T1 + (k / K) * 2 * T1, yd = h * Math.sin(th), z = -D * Math.cos(th);
          // (the inward normal of the ellipse: toward the axis and the viewer)
          b.v(x, Y(yd), z, 0, Y(-D * Math.sin(th)), h * Math.cos(th)); b.aux.push(Math.sin(th));
        }
      }
      for (let i = 0; i < rows.length - 1; i++) b.strip(rows[i]!, rows[i + 1]!, K + 1);
      yield* b.buildSteps(this.trough.geometry, pace);
    }
    if (pace.due()) yield;

    // the wall (sinusoid-wall.ts): the shell round the lumen, its cut, and the nucleus's section on the cut. The colours are weights, painted in paintWall()
    {
      const wx = wallColumns(X0, X1);
      const sh = new MeshBuilder(), cu = new MeshBuilder(), nu = new MeshBuilder(), shW = newWeights(), cuW = newWeights();
      for (const side of [-1, 1] as (-1 | 1)[]) {
        yield* buildShellSteps(sh, shW, g, wx, side, 'in', Z.disse, pace);
        yield* buildShellSteps(sh, shW, g, wx, side, 'out', Z.disse, pace);
        buildCut(cu, cuW, g, wx, side);
        const nsd = side < 0 ? SEED.nucUp : SEED.nucDn;
        for (let n = Math.floor(X0 / 38) - 1; n <= Math.ceil(X1 / 38) + 1; n++) buildNucleusSection(nu, g, side, nucAt(n, nsd));
        if (pace.due()) yield;
      }
      yield* sh.buildSteps(this.bead.geometry, pace); yield* cu.buildSteps(this.beadLine.geometry, pace); yield* nu.buildSteps(this.endoNi.geometry, pace);
      this.shellW = shW; this.cutW = cuW;
      if (pace.due()) yield;
      this.paintWall();
      this.gapKey = -1;   // (the bores follow the lumen's width: written again)
    }
    if (pace.due()) yield;

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
      yield* b.buildSteps(this.disse.geometry, pace);
    }
    if (pace.due()) yield;
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
      yield* b.buildSteps(this.troughFar.geometry, pace);
    }
    if (pace.due()) yield;

    // the plates: hepatocytes as raised tiles (their borders 2D's own bent lines), each with its domed nucleus; the bile canaliculi on the borders
    {
      const cells = new MeshBuilder(), nuc = new MeshBuilder(), nol = new MeshBuilder(), bile = new MeshBuilder();
      const plate = function* (sd: number, s: Side, face: (x: number) => number, far = false, beyond = false): Generator<void> {
        // (beyond: a plate in the blur has no canaliculi, too fine to read there; far: one deep in it keeps its tiles and nuclei, coarser, without the nucleoli: a phone still draws the whole scene)
        const j0 = Math.floor(X0 / CELL) - 1, j1 = Math.ceil(X1 / CELL) + 1;
        for (let j = j0; j <= j1; j++) {
          if (pace.due()) yield;   // (a plate is hundreds of cells: it ends a step between them)
          const outline = cellOutline(j, sd, s, face, beyond);
          pillow(cells, outline, Z.cell, Z.cellBot, CELL_BEVEL, undefined, far ? 2 : 4);
          const c = cellOf(j, sd), xn = lerp(c.x0, c.x1, c.nu), v = c.nv * UM.hep;
          const put = (x: number, r: number) => {
            const yd = s * (face(x) + v);
            ellipsoid(nuc, x, Y(yd), Z.cell + NUC_LIFT, r, r * 1.08, 0.42, 0, undefined, far ? 14 : 28, far ? 6 : 10, true, true);   // (its rim a hair over the cell's top, so its line never shares the cell's depth)
            if (far) return;
            const a = 1.7 + 2.2 * ((j * 7 + sd) % 5) / 5;
            ellipsoid(nol, x + r * 0.3 * Math.cos(a), Y(yd) + r * 0.3 * Math.sin(a), Z.cell + 0.32, r * 0.13, r * 0.13, 0.12, 0, undefined, 12, 6);
          };
          if (c.bi) { const dx = (c.x1 - c.x0) * 0.17; put(xn - dx, c.nr * 0.8); put(xn + dx, c.nr * 0.8); } else put(xn, c.nr);
          // the canaliculus between this cell and the one before it: a small round lumen in the cleft at the middle of the plate, seen in cross-section as a circle (Mohammad 20 Nov 2026:
          // "the bile ductule should be like a circle in between each hepatocyte"; it was a long tapering channel down the border)
          if (!beyond) {
            const v = UM.hep * 0.5, x = edgeAt(j, sd, v);
            ellipsoid(bile, x, Y(s * (face(x) + v)), Z.cell + 0.1, CANAL_R, CANAL_R, 0.3, 0, undefined, 24, 6, true, true);
          }
        }
      };
      const seeds: Record<Side, number> = { [-1]: SEED.plateUp, 1: SEED.plateDn } as Record<Side, number>;
      for (const s of [-1, 1] as Side[]) {
        yield* plate(seeds[s], s, (x) => g.hepIn(x));
        for (let r = 1; r <= BEYOND; r++) { yield* plate(seeds[s] + 101 * r, s, (x) => g.hepIn(x) + r * PERIOD, r > 1, true); }
      }
      yield* cells.buildSteps(this.cells.geometry, pace); yield* nuc.buildSteps(this.nuclei.geometry, pace); yield* nol.buildSteps(this.nucleoli.geometry, pace); yield* bile.buildSteps(this.bile.geometry, pace);
    }
    if (pace.due()) yield;

  }

  /** The parts the shapes are built for (not the ground: it does not follow the state; not the Kupffer cell: its arms are rebuilt on the scene's life; not the tail). */
  private shapedParts(): MicroPart[] { return [this.trough, this.troughFar, this.bead, this.beadLine, this.disse, this.cells, this.nuclei, this.nucleoli, this.bile, this.endoNi]; }
  /** One pass of the shapes' preparation (see sinusoid-shape.ts): they are built at the rest state, at the rest with D one micrometre wider, and at the rest with H moved to each of SHAPE_NODES, each pass a task
   *  of its own so none lands in a drawn frame. Returns true when all are done. */
  prepareShapeStep(): boolean {
    if (this.shapeReady) return true;
    const offs: [number, number, number][] = [...SHAPE_NODES.map((n) => [n, 0, 0] as [number, number, number]), [0, 1, 0], [1, 0, SHAPE_RAMP], [0, 0, 0]], parts = this.shapedParts();
    if (this.shapePass >= offs.length) return this.finishShapes(parts);
    const [h, d, k] = offs[this.shapePass]!;
    this.shapeG = {
      halfW: (x) => restHalfW(x) + h + k * x, disseW: (x) => restDisseW(x) + d,
      wallIn: (x) => restHalfW(x) + h + k * x + UM.endo, hepIn: (x) => restHalfW(x) + h + k * x + UM.endo + restDisseW(x) + d,
    };
    this.shapeGen ??= this.shapeSteps();
    let more = true;
    try { more = !this.shapeGen.next().done; } catch (e) { this.shapeGen = null; this.shapeG = null; throw e; }
    if (more) return false;   // (the next call goes on with the pass's next section)
    this.shapeGen = null; this.shapeG = null;
    this.shapeSnaps.push(parts.map((p) => Float32Array.from(p.geometry.getAttribute('position').array)));
    this.shapePass++;
    return false;   // (the moves of the last pass's samples follow in the calls after: finishShapes)
  }
  private finishShapes(parts: MicroPart[]): boolean {
    // (the moves are worked out part by part, the wall's fifth-degree fit in chunks of vertices: each call of this method does one of them, and the last one makes the shapes ready)
    this.finalGen ??= this.shapeFinalSteps(parts);
    if (!this.finalGen.next().done) return false;
    this.finalGen = null;
    this.shapeSnaps = [];
    this.shapeReady = true;
    this.builtKey = ''; this.tailKey = '';   // (the tail, the Kupffer cell and the pores are laid on the state at the next update)
    return true;
  }

  private finalGen: Generator<void> | null = null;
  /** What follows the passes: each part's moves (`dD`, `dH`, the anchored parts' `ax`, the wall's five columns) from the samples the passes took, one part at a time, the wall's polynomial in chunks of FIT_CHUNK vertices. */
  private *shapeFinalSteps(parts: MicroPart[]): Generator<void> {
    const N = SHAPE_NODES.length, p0 = this.shapeSnaps[N + 2]!, pD = this.shapeSnaps[N]!, pR = this.shapeSnaps[N + 1]!, inv = shapeInverse();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const z = p0[i]!, c = pD[i]!, samples = SHAPE_NODES.map((_, k) => this.shapeSnaps[k]![i]!);
      for (const smp of [c, pR[i]!, ...samples]) if (smp.length !== z.length) throw new Error(`sinusoid shape: ${p.toonMesh.name} changed its vertex count with the state`);
      const second = p === this.bead, dd = new Float32Array(z.length);
      for (let k = 0; k < z.length; k++) dd[k] = c[k]! - z[k]!;
      p.geometry.setAttribute('dD', new Float32BufferAttribute(dd, 3));
      meshWork.n += COPY_W * z.length / 3;
      yield;   // (a big part's own moves are several steps: its first, the second linear one below, then the anchored one)
      if (!second) {
        // (linear in H: one sample is the whole move)
        const dh = new Float32Array(z.length), a = samples[0]!, n = SHAPE_NODES[0]!;
        for (let k = 0; k < z.length; k++) dh[k] = (a[k]! - z[k]!) / n;
        p.geometry.setAttribute('dH', new Float32BufferAttribute(dh, 3));
        meshWork.n += COPY_W * z.length / 3;
        yield;
        if (this.anchored.has(p)) {
          // (the x each vertex follows: its move at H = rest + 1 + RAMP x is its slope times 1 + RAMP times that x)
          const r = pR[i]!, ax = new Float32Array(z.length / 3);
          for (let k = 0; k < ax.length; k++) {
            const o = k * 3; let aa = 0, ar = 0;
            for (let c = 0; c < 3; c++) { aa += dh[o + c]! * dh[o + c]!; ar += dh[o + c]! * (r[o + c]! - z[o + c]!); }
            ax[k] = aa > 1e-6 ? (ar / aa - 1) / SHAPE_RAMP : z[o]!;
          }
          p.geometry.setAttribute('ax', new Float32BufferAttribute(ax, 1));
          meshWork.n += ax.length / 4;
        }
        yield;
        continue;
      }
      // (the wall's shell lays its columns at equal arc length down an ellipse that scales with H: a polynomial of the fifth degree through the five samples, per vertex)
      const co = [0, 1, 2, 3, 4].map(() => new Float32Array(z.length));
      for (let k0 = 0; k0 < z.length; k0 += FIT_CHUNK * 3) {
        const k1 = Math.min(z.length, k0 + FIT_CHUNK * 3);
        for (let k = k0; k < k1; k++) for (let r = 0; r < N; r++) { let v = 0; for (let q = 0; q < N; q++) v += inv[r]![q]! * (samples[q]![k]! - z[k]!); co[r]![k] = v; }
        meshWork.n += 1.5 * (k1 - k0) / 3;
        yield;
      }
      ['dH', 'dH2', 'dH3', 'dH4', 'dH5'].forEach((nm, r) => p.geometry.setAttribute(nm, new Float32BufferAttribute(co[r]!, 3)));
    }
  }

  /** The parts that follow the stellate cell's activation and the collagen: the stellate cells, the basement membrane and the fibres in Disse (built after the shapes they lie on). */
  private buildTail(): void {
    const g = this.flat.g, geo = this.flat.geo, S = this.flat.cur;
    const xs: number[] = [];
    for (let x = -REACH; x <= REACH + 1e-6; x += 1) xs.push(x);
    // the stellate cell: a spindle in the upper Disse at xs, long processes along it; it grows as it activates
    {
      const b = new MeshBuilder(), bn = new MeshBuilder();
      const a = clamp(S.act, 0, 1), x0 = geo.xs;
      const mid = (x: number) => -(g.wallIn(x) + g.disseW(x) * 0.5 + 0.2);
      const body = 5.2 * (1 + 0.35 * a), thick = 1.25 * (1 + 0.45 * a);
      ellipsoid(b, x0, Y(mid(x0) - 0.4 * a), Z.disse + 0.9, body, thick, 1.1 + 0.3 * a, 0, undefined, 48, 12, true, true);
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
        ellipsoid(b, xf, Y(farMid(xf)), Z.disse + 0.9, body * sc, thick * sc, (1.1 + 0.3 * a) * sc, 0, undefined, 40, 10, true, true);
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
    const d = this.gapData, g = this.flat.g, bb = new MeshBuilder();
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
        // (the bore itself: the gutter the cut makes and the whole cylinder lower on the curve, as wide as the gap is, from the lumen to the wall's far face)
        if (Math.abs(p.x) <= REACH) buildBore(bb, g, side === 0 ? -1 : 1, p.x, p.w * 0.5 * o);
      }
    }
    bb.build(this.bores.geometry);
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
      else z = lerp(-0.15, Z.disse + 0.55, smooth(h, g.wallIn(x) + 0.4, ay));   // (through the wall, under its cut: seen only in the gutters of the bores)
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

  /** The red cells: biconcave discs carried in the stream at the albumin's own lane speeds (fastest in the middle), tumbling a little; a few ride in each of the next sinusoids too.
   *  How many is the blood's (rbcWanted: the patient's hematocrit against a healthy one); a cell that is being added or taken grows or shrinks over one cell's share, never pops. */
  private stepRbc(): void {
    const f = this.flat, g = f.g, v0 = -TRAFFIC_REACH - 8, span = RBC_SPAN, flow = f.traffic.flowX;
    const farH = UM.lum + UM.endo * 0.5, farLim = farH - RBC_R * 0.62;
    // Blood origin and First pass: each cell wears the colour of the source its fixed draw falls in (the blood has mixed by here), eased in from its own red
    const lens = f.cellColours, red = this.rbcRed, col = this.rbcCol, want = rbcWanted(f.cur.hct);
    let n = 0;
    for (let l = 0; l < 3; l++) {
      const start = this.rbcStart[l]!, total = this.rbcStart[l + 1]! - start, wanted = l === 0 ? want.main : want.far;
      for (let k = 0; k < total; k++) {
        const have = clamp(wanted - k, 0, 1);
        if (have <= 0) break;
        const c = this.rbcs[start + k]!;
        // (the colour is the cell's own, fixed by its place in the list, whoever else is drawn: a cell never changes source as the stream thins)
        if (lens) cellColour(lens, hash((start + k) * 0.618 + 0.37), red, col);
        else { col[0] = red[0]!; col[1] = red[1]!; col[2] = red[2]!; }
        const sp = 1.5 * (1 - c.y * c.y) + 0.08;
        const x = v0 + ((((c.u * span + flow * sp) % span) + span) % span);
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
        // (a whole cell is RBC_R; only the one being added or taken is smaller, never larger)
        const r = RBC_R * smooth(0, 1, have);
        placeAt(this.m4, x, Y(yd), z, r, r * fold, r, c.ph + c.spin * flow * 0.02, c.tilt);
        this.rbc.setAt(n++, this.m4, col);
      }
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
    for (const p of [this.ground, this.trough, this.troughFar, this.bead, this.beadLine, this.bores, this.disse, this.cells, this.nuclei, this.nucleoli, this.bile, this.endoNi, this.kup, this.kupN, this.hsc, this.hscN, this.bm, this.arrows]) p.dispose();
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
/** The k-th point (each coordinate 0..1) of the R3 lattice (Roberts' generalized golden ratio, the plastic-like constant of three dimensions), `shift` along its first axis:
 *  any run of the first n points is spread evenly. */
const GOLD3 = 1.2207440846057596;
const lattice = (k: number, shift = 0): [number, number, number] => {
  const f = (x: number) => x - Math.floor(x);
  return [f(0.5 + shift + k / GOLD3), f(0.5 + k / (GOLD3 * GOLD3)), f(0.5 + k / (GOLD3 * GOLD3 * GOLD3))];
};
