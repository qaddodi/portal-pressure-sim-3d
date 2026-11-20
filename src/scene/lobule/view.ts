// The lobule in 3D: one flat histology plate, as 2D draws it (WP5, atlas-look-plan.md §5), built once at start-up from the same network the 2D app
// draws (geometry.ts), so opening the view is a camera move and nothing is built (the views open instantly). The tissue (plates, membranes, nuclei,
// zones, nutmeg, collagen, stellate cells) is 2D's own painter on one flat plate (plate.ts); the vessels lie on it in one plane, the end-on ones
// (central vein, the tracts' venule, arteriole, ductule and lymphatic) as flat discs; the neighbouring lobules are 2D's field, out of focus (field.ts).
// Every part is named (parts.ts) and the artist's model can replace it part by part.
//
//   const lobule = new LobuleView(cel.shared, { look, phone });  cel.scene.add(lobule.group);
//   lobule.setVisible(true);                                       // the view is on (nothing is drawn or stepped while it is off)
//   lobule.setModel(lobuleModel(frame, healthy));                  // from the engine frame; states ease in, nothing jumps
//   lobule.setLayers({ lymph: true, zones: false });               // the toolbar's Layers (the 2D app starts with lymph on)
//   lobule.setLit(litParts(['lobule:sinusoid']));                  // the slide's terms: flow-mark option A runs chevrons on these
//   lobule.startWash(now) / stopWash();                            // HVPG slide 5: the wedge's amber from the central vein out
//   lobule.update(now) → true while anything moves                 // called by the scene, in the clock's order
//
// Lymph chevrons run on the ducts (the terminal lymphatics, the tracts' lymphatics and the space of Disse beside each sinusoid) while the Lymph layer is
// on, out along Disse toward the tract (owner, 5d3b7e86: hepatic lymph rises in cirrhosis, and the chevrons quicken with it). The sinusoid view shows none.
import { type BufferGeometry, type Camera, Color, Group, LinearSRGBColorSpace, Matrix4, Plane, type Ray, type Object3D, Vector3 } from 'three';
import { CelObject, type CelShared, rawColor } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE, FLOW_FADE_MS, PULSE_MS, markSpeed } from '../flow.ts';
import type { LensId } from '../lenses/model.ts';
import { Batch, type V3 } from './batch.ts';
import { shadeUniforms } from './shading.ts';
import { type LobuleHit, type PickTube, lobuleHit } from './pick.ts';
import { buildBile } from './bile.ts';
import { type Course, type LobuleNet, type P2, buildLobule, zoneOf } from './geometry.ts';
import { type LobuleModel, easeToward, lymphProtein, lymphRate, lymphSeal, smooth } from './model.ts';
import { disseColour } from './disse.ts';
import { LOBULE_PARTS, type LobulePartName, PartSet } from './parts.ts';
import { LOBULE_PALETTES, tone } from './tones.ts';
import { LOBULE_R, lobuleToScene, slabZ } from './shots.ts';
/** Tags hang just over the plate (it is flat: a point any higher would slide against the tissue as the view turns). */
const ANCHOR_Z = 0.05;
import { lobuleWorld } from './frames.ts';
import { type InkContext, type Seg, sinW } from './ink.ts';
import { InkSet } from './ink-set.ts';
import { WASH_DELAY_MS, washAmount, washFront, washProgress } from './wash.ts';
import { LobulePlate, type MakeCanvas, defaultCanvas } from './plate.ts';
import { ZonesOverlay } from './zones.ts';
import { NeighbourField, fieldQuantizer } from './field.ts';
import { lookColours } from './lz-colours.ts';
import { DISC_EDGE } from './from2d/disc-glsl.generated.js';
import { AN_K, DISC_R, LT_R, RS_N, TW_R, disseRadius, inletRadius, sinRadius, twigR } from './widths.ts';
import { type Disc, type Joiner, buildDiscs, writeMouths } from './mouths.ts';
import { HEAD_K, HEAD_KIND, HEAD_PERIOD, lobuleShade } from './shading.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';

const R = LOBULE_R;
const MARK_PITCHES = 5;   // uv.x counts in this many tube radii (the heads' own spacing is 2D's, in CSS px: shading.ts)
/** Where each tube's uv.x starts, in those units: tubes of one object do not share a start, so their heads never stand in a row across the lobule (2D gives each vessel its own phase, (t.id * 977) % PERIOD). */
const markOffset = (p: P2): number => { const h = Math.sin(p[0] * 127.1 + p[1] * 311.7) * 43758.5453; return (h - Math.floor(h)) * 7; };

/** Scene radii of the parts (lobule radii × R). The sinusoid's is the 2D app's lumen, drawn about twice as wide; the rest keep the 2D ratios. */
const RAD = {
  // (2D's own, healthy: widths.ts, lobule-zoom-field.js radiusAt; a sinusoid's is the radius at the middle of its course, the profile along it is drawn from sinRadius)
  s0: RS_N * 1.15 * R, s1: RS_N * 1.15 * R, s2: RS_N * 1.15 * R, an: RS_N * AN_K * R, in: 0.012 * R, tw: TW_R.base * R,
  pv: DISC_R.pv * R, ha: DISC_R.ha * R, bd: DISC_R.bd * R, lv: DISC_R.lv * R, cv: DISC_R.cv * R, lt: LT_R * R, ly: 0.0132 * R, bc: 0.0036 * R, bh: 0.0075 * R,   // (bc: 2D's widest canaliculus, at the edge: R * lerp(0.0004, 0.0036, smooth(0.22, 1, rho)), lobule-bile.js)
} as const;
/** 2D's three dark shares of a sinusoid kind that congestion widens (zone 3: 1 - smooth(0.24, 0.56, rho), at the middle of each generation): radiusAt's `1 + 1.5 congU z3`. */
const CONG_Z3 = { s0: 0, s1: 0.4, s2: 0.95, an: 0.3 } as const;

/** A disc's half thickness (an end-on vessel is a flat disc on the plate) and how far under its sinusoid the space of Disse's band lies. */
const DISC_T = 0.008, DISSE_DZ = 0.03;
/** A disc's sides: the rim is a polygon of this many, its sag from the true circle 0.0005 of the radius (0.3 px on a 600 px vein; at 48 it was twice that and showed as facets at 6x). */
export const DISC_RADIAL = 96;
/** Outline widths (CSS px). 2D's rule is clamp(0.14 × radius, 1.5, 3) device px: on these thin tubes about half a CSS px on a phone. */
const INK = { sin: 0.55, thin: 0.45, inlet: 0.65, disc: 0.75 } as const;

/** What the slides name, as the 2D deck's terms: which parts carry chevrons in flow-mark option A. */
export const TERM_PARTS: Readonly<Record<string, readonly LobulePartName[]>> = {
  'lobule:triad': ['portal-tracts', 'inlets'],
  'lobule:arteriole': ['portal-tracts'],
  'lobule:ductule': ['portal-tracts'],
  'lobule:sinusoid': ['sinusoids'],
  'lobule:central': ['central-vein', 'sinusoids'],   // (the 2D app lights the sinusoids with the central vein or the triad)
  'lobule:lymph': ['lymph'],
};
/** The parts a slide's terms light. Naming the central vein or the triad also lights the sinusoids, as in the 2D app (presenter-words.js). */
export function litParts(terms: Iterable<string>): Set<LobulePartName> {
  const out = new Set<LobulePartName>();
  const has = new Set(terms);
  for (const t of has) for (const p of TERM_PARTS[t] ?? []) out.add(p);
  if (has.has('lobule:central') || has.has('lobule:triad')) out.add('sinusoids');
  return out;
}

/** The vessels seen end-on, drawn as discs. */
type DiscKind = 'pv' | 'ha' | 'bd' | 'cv' | 'lv';
interface DiscInfo {
  obj: CelObject; geo: BufferGeometry; cs: Course[]; b: Batch; discs: Disc[]; pool: Map<number, Joiner>; radiiOf: Map<number, Float64Array>;
  setPool(p: Joiner[]): void;
}
/** Ids of the Bile layer's canals of Hering as vessels that may join a ductule (courses have ids from 0; these are far above them). */
const CANAL_ID = 1_000_000;
/** Ids of the Bile layer's vessels for picking. */
const BILE_ID = 2_000_000;
/** 2D's lymphatic caliber against the healthy flow (lobule-zoom-field.js lyWr): 1 at a normal rate. */
const lyWr = (lr: number, k: number) => 1 + k * smooth(1, 4, lr) - 0.12 * (1 - smooth(0.3, 1, lr));

export interface LobuleLayers { lymph: boolean; zones: boolean; bile: boolean }
export interface LobuleViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean; canvas?: MakeCanvas }
/** Parts that are painted on the plate (the 2D painter draws them with the tissue), so they have no geometry of their own. */
export const PLATE_PAINTED: readonly LobulePartName[] = ['stellate', 'septa', 'cuffs'];
/** How long the surround takes to grey (or come back) when the lens changes (2D: the lens crossfade). */
const GREY_MS = 350;

/** The eased scalars the drawing reads (all move toward the model's targets). */
interface Cur {
  fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number;
  flow: number; portal: number; art: number; lymphRate: number; seal: number; prot: number;
}
const REST: Cur = { fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, septU: 0, act: 0, lum: 1, flow: 1, portal: 1, art: 1, lymphRate: 1, seal: 0, prot: 1 };

/** A chevron-carrying object: its pitch and how much of its marks show now. */
interface Marked { obj: CelObject; part: LobulePartName; amount: number; dir: 1 | -1; speed: () => number; layer: 'blood' | 'lymph' | 'bile'; smokes: boolean; /** Scene units to one chevron period of uv.x. */ arc: number; /** The stream's distance along its flow, head-world units (2D's sm.D): advanced here, never read from the clock. */ phase: number; /** The reversed flag, eased (an inlet whose portal flow runs backward). */ rev: number }

const p3 = (p: P2, dz = 0): V3 => lobuleToScene(p[0], p[1], slabZ(p[0], p[1]) + dz);

export class LobuleView {
  readonly set = new PartSet<LobulePartName>(LOBULE_PARTS);
  readonly group: Group = this.set.group;
  readonly net: LobuleNet;
  /** Every object the view draws (for palette, ink width and disposal). */
  readonly objects: CelObject[] = [];
  private marked: Marked[] = [];
  /** The parts that colour themselves along their length under the lens (ink-set.ts). */
  private readonly inks = new InkSet();
  private lens: LensId = 'pressure';
  private ref: ArrayLike<number> | null = null;
  private model: LobuleModel | null = null;
  private blood = { chevrons: true, key: false };
  private cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private lit = new Set<LobulePartName>();
  private mode: FlowMarkMode;
  private layers: LobuleLayers = { lymph: true, zones: false, bile: true };
  private lyFade = 1;
  private bileFade = 0;
  /** How stagnant the sinusoids' blood is, 0 moving .. 1 still (the 2D `stasis`: 1 - smooth(0.12, 0.45, flow)): the chevrons give way to a slow smoke. */
  private stasis = 0;
  private bileObjs: CelObject[] = [];
  /** The Bile layer's vessels (the canaliculi between plates, the canals of Hering) as things a tap can land on. */
  private readonly bilePick: PickTube[] = [];
  private zoneFade = 0;
  /** The surround's grey (a lens other than Pressure greys the neighbouring lobules as it greys the anatomy's liver), eased. */
  private greyK = 0;
  /** The tissue plate, the Zones overlay and the out-of-focus neighbours. */
  readonly plate: LobulePlate;
  readonly zones = new ZonesOverlay();
  readonly field: NeighbourField;
  private readonly fsQ = fieldQuantizer();
  /** Objects drawn flat (one tone, no light): the space of Disse's band. */
  private flat = new Set<CelObject>();
  private pulseUntil = -Infinity;
  private pulseStart = -Infinity;
  private visible = false;
  private lastNow = -1;
  private look: LookId;
  private phone: boolean;
  private reduce: boolean;
  private washAt = -1;
  private washOn = false;
  private washK = 0;
  private dirty = true;
  // objects whose inflate or reveal the state sets
  private o!: {
    s0: CelObject; s1: CelObject; s2: CelObject; an: CelObject; inlets: CelObject;
    pv: CelObject; ha: CelObject; bd: CelObject; tw: CelObject; cv: CelObject; lv: CelObject; lt: CelObject; ly: CelObject;
    washSin: CelObject; washCv: CelObject;
  };

  /** The named objects (for tests and the state mapping). */
  get parts(): LobuleView['o'] { return this.o; }

  private readonly shared: CelShared;
  constructor(shared: CelShared, opts: LobuleViewOptions = {}, net: LobuleNet = buildLobule()) {
    this.shared = shared;
    this.net = net;
    this.look = opts.look ?? 'light';
    this.phone = !!opts.phone;
    this.mode = opts.flowMode ?? DEFAULT_FLOW_MODE;
    this.reduce = !!opts.reduceMotion;
    const mk = opts.canvas ?? defaultCanvas;
    this.plate = new LobulePlate(net, this.sinCourses(net), RAD.cv / R, mk);
    this.field = new NeighbourField((w, h) => { const c = mk(1); if (c) { c.width = w; c.height = h; } return c; });
    this.build();
    this.applyLook(this.look);
    this.group.visible = false;
  }

  // ---- building ------------------------------------------------------------------------------------------------------------------

  /** The sinusoids the plate's capillarized collagen follows (2D: sinTubesOf), with their radii in lobule radii. */
  private sinCourses(net: LobuleNet): { c: Course; r: number }[] {
    return net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: RAD[c.kind as 's0' | 's1' | 's2' | 'an'] / R }));
  }

  private make(part: LobulePartName, b: Batch, toneKey: Parameters<typeof tone>[0], opts: { bands: 2 | 3; px: number; radius?: number; flat?: boolean; disc?: { join: boolean; inkRadius?: number }; chevrons?: { pitch: number; speed: () => number; dir?: 1 | -1; lymph?: boolean; bile?: boolean }; ink?: { seg: Seg; courses?: Course[] } }): CelObject {
    const c = opts.chevrons;
    if (opts.ink) b.withInk();
    const geo = b.build();
    const o = new CelObject(geo, {
      tone: tone(toneKey), bands: opts.bands, spec: 0, px: opts.px,
      // a vessel as far as the shader goes: marks along uv.x. uv.x is already in chevron periods (arc ÷ pitch), so len is the shader's own 0.45 per mark.
      vessel: c ? { index: 0, len: 0.45, stubSpeed: 0, radius: 0, baseD: 1 } : undefined,
    }, this.shared);
    // 2D's shading: three screen-space tones, the line by caliber, a disc's pale band and its wall opened at the mouths (shading.ts)
    lobuleShade(o, geo, this.dprU, { radius: opts.radius ?? RAD.s0, disc: !!opts.disc, join: opts.disc?.join, inkRadius: opts.disc?.inkRadius, flat: opts.flat, heads: c ? { kind: c.bile ? HEAD_KIND.bile : c.lymph ? HEAD_KIND.lymph : HEAD_KIND.blood, arc: c.pitch } : undefined });
    this.objects.push(o);
    const p = this.set.get(part);
    p.group.add(o.group);
    if (opts.ink) {
      o.setInkAmount(1);
      const courses = opts.ink.courses ?? [], seg = opts.ink.seg;
      this.inks.add(o.toonMesh.geometry, seg, courses.length ? b.tubes : [], courses.map((c): [number, number] => [seg === 'sin' ? sinW(c.rho[0]!) : 0, seg === 'sin' ? sinW(c.rho[c.rho.length - 1]!) : 1]));
    }
    if (c) this.marked.push({ obj: o, part, amount: 0, dir: c.dir ?? 1, speed: c.speed, layer: c.bile ? 'bile' : c.lymph ? 'lymph' : 'blood', smokes: part === 'sinusoids' && !c.bile && !c.lymph, arc: c.pitch, phase: 0, rev: 0 });
    return o;
  }

  /** An end-on vessel kind: its discs (batch order), the vessels that may join them, and their mouth masks. Built once; `refreshDiscs` writes the masks again when the radii they depend on have moved. */
  private readonly discInfo = new Map<DiscKind, DiscInfo>();
  private discKey = '';
  private readonly dprU = { value: 1 };
  /** The drawing buffer's pixel ratio (the scene's render asks the renderer): the lines are held to device pixels (2D's clamp(0.14 R, 1.5, 3)). */
  setDpr(dpr: number): void { if (dpr !== this.dprU.value) { this.dprU.value = dpr; this.dirty = true; } }

  private disc(kind: DiscKind, part: LobulePartName, cs: Course[], axial: (cs: Course[], radius: number) => Batch, toneKey: Parameters<typeof tone>[0], pool: Joiner[], ink?: { seg: Seg }): CelObject {
    const b = axial(cs, RAD[kind]);
    const o = this.make(part, b, toneKey, { bands: 2, px: INK.disc, radius: RAD[kind], disc: { join: false }, ink });
    const geo = o.toonMesh.geometry;
    const info: DiscInfo = {
      obj: o, geo, cs, b, discs: [], pool: new Map(), radiiOf: new Map(),
      setPool: (p: Joiner[]) => { info.discs = buildDiscs(cs, b, DISC_R[kind], p); info.pool = new Map(p.map((j) => [j.id, j])); this.discKey = ''; this.dirty = true; },
    };
    this.discInfo.set(kind, info);
    info.setPool(pool);
    return o;
  }

  private build(): void {
    const net = this.net;
    const by = (...k: Course['kind'][]) => net.courses.filter((c) => k.includes(c.kind));
    // (a tube's radius is a number, or by course the radius at each sample: 2D's profile along it, widths.ts; `mean` is the one the chevrons' pitch and the line's width are worked from)
    const tubeSet = (cs: Course[], radius: number | ((c: Course) => (i: number, n: number) => number), dz = 0, radial = 7, mean = typeof radius === 'number' ? radius : RAD.s0) => {
      const b = new Batch(), pitch = mean * MARK_PITCHES;
      for (const c of cs) { const off = markOffset(c.pts[0]!); b.tube(c.pts.map((p) => p3(p, dz)), { radius: typeof radius === 'number' ? radius : radius(c), radial, uvx: (_i, arc) => arc / pitch + off }); }
      return b;
    };
    // a vessel seen end-on (the central vein, the tract's venule, arteriole, ductule and lymphatic): a flat disc on the plate, as 2D's celDisc, not a
    // column standing out of it (the hexagonal prism of IMG_5637). Its face looks at the camera, so it is one flat tone inside its outline.
    const axial = (cs: Course[], radius: number) => {
      const b = new Batch();
      for (const c of cs) { const p = c.pts[Math.floor(c.pts.length / 2)]!; b.tube([p3(p, -DISC_T), p3(p, DISC_T)], { radius, radial: DISC_RADIAL, capped: true, disc: true, uvx: () => 0 }); }
      return b;
    };
    const sinR = (c: Course) => (i: number) => sinRadius(c.kind as 's0' | 's1' | 's2' | 'an', c.rho[i]!) * R;
    const inR = (c: Course) => (i: number, n: number) => inletRadius(i, n, Math.hypot(c.pts[i]![0] - c.pts[0]![0], c.pts[i]![1] - c.pts[0]![1])) * R;
    const twR = (c: Course) => (i: number, n: number) => twigR(i / (n - 1), RS_N) * R;
    // the blood's marks run at the 2D painter's speeds (lobule-zoom.js: sinusoids vS x 1, 1.45, 2.05 with vS = 15 sqrt(flow); inlets 24 sqrt|portal|, the arteriole's twig 30 sqrt(art)),
    // here in marks a second (the 15 is 1.4 marks/s); a sinusoid whose flow has stopped or reversed runs no marks, as in 2D
    const U = 1.4 / 15;
    const sinSpeed = (k: number) => () => U * 15 * k * Math.sqrt(Math.max(0, this.cur.flow));
    const inSpeed = () => U * 24 * Math.sign(this.cur.portal) * Math.sqrt(Math.abs(this.cur.portal));
    const twSpeed = () => U * 30 * Math.sqrt(Math.max(0, this.cur.art));
    const lymphSpeed = () => markSpeed(8 * Math.min(6, Math.max(0.2, this.cur.lymphRate)));

    // the tissue: 2D's painter on one flat plate (cells, membranes, nuclei, nutmeg, collagen, stellate cells), the Zones layer over it, and the
    // neighbouring lobules out of focus under it
    this.set.get('cords').group.add(this.plate.group, this.zones.mesh);
    this.set.get('field').group.add(this.field.mesh);

    // sinusoids: three generations and the links; blood runs from the portal end to the central end (negative when the lobule's flow reverses).
    // Outlines as 2D's (clamp(0.14 R, 1.5, 3) device px: about half a CSS px on these thin tubes), in the casing colour (applyLook)
    const s0 = this.make('sinusoids', tubeSet(by('s0'), sinR), 'sin0', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s0') }, chevrons: { pitch: RAD.s0 * MARK_PITCHES, speed: sinSpeed(1) } });
    const s1 = this.make('sinusoids', tubeSet(by('s1'), sinR), 'sin1', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s1') }, chevrons: { pitch: RAD.s1 * MARK_PITCHES, speed: sinSpeed(1.45) } });
    const s2 = this.make('sinusoids', tubeSet(by('s2'), sinR), 'sin2', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s2') }, chevrons: { pitch: RAD.s2 * MARK_PITCHES, speed: sinSpeed(2.05) } });
    const an = this.make('sinusoids', tubeSet(by('an'), sinR, 0, 7, RAD.an), 'sin1', { bands: 2, px: INK.thin, ink: { seg: 'sin', courses: by('an') } });
    const inlets = this.make('inlets', tubeSet(by('in'), inR, 0, 8, RAD.in), 'portal', { bands: 2, px: INK.inlet, ink: { seg: 'in', courses: by('in') }, chevrons: { pitch: RAD.in * MARK_PITCHES, speed: inSpeed } });

    // the portal tracts: venule, arteriole (with the twig that feeds the first stretch of a sinusoid), ductule; the lymphatic is the lymph part's
    const joiners = (cs: Course[]): Joiner[] => cs.map((c) => ({ id: c.id, pts: c.pts }));
    const pv = this.disc('pv', 'portal-tracts', by('pv'), axial, 'portal', joiners(by('in')), { seg: 'pv' });
    const ha = this.disc('ha', 'portal-tracts', by('ha'), axial, 'artery', joiners(by('tw')));
    const bd = this.disc('bd', 'portal-tracts', by('bd'), axial, 'bile', []);
    const tw = this.make('portal-tracts', tubeSet(by('tw'), twR, 0, 6, RAD.tw), 'artery', { bands: 2, flat: true, px: INK.thin, chevrons: { pitch: RAD.tw * MARK_PITCHES, speed: twSpeed } });
    const cv = this.disc('cv', 'central-vein', by('cv'), axial, 'sys', joiners(by('s0', 's1', 's2', 'an')), { seg: 'cv' });

    // lymph: the tracts' lymphatics (end-on discs), the terminal lymphatics along the edges (toward the tract) and the space of Disse beside each sinusoid
    const lv = this.disc('lv', 'lymph', by('lv'), axial, 'lymph', joiners(by('lt')));
    const lt = this.make('lymph', tubeSet(by('lt'), RAD.lt, 0, 6), 'lymph', { bands: 2, px: INK.thin, chevrons: { pitch: RAD.lt * MARK_PITCHES, speed: lymphSpeed, lymph: true } });
    // the space of Disse: a flat pale band under its sinusoid, so only its rim shows either side (2D's Wet Disse sleeve, drawn under the sinusoid), with no
    // outline and no light of its own: no second tube wound round the first (the "rope" of IMG_5637). Its course runs inward, the lymph outward, so the marks run backwards
    const lyB = new Batch();
    for (const c of by('ly')) lyB.tube(c.pts.map((p) => p3(p, -DISSE_DZ)), { radius: (i) => disseRadius(c.rho[i]!) * R, radial: 8, squash: 0.08, uvx: () => 0 });
    // (no marks of its own: 2D fits them to the rim, and a rim of the width 2D shows carries none but specks, which read as a yellow edge on every sinusoid)
    const ly = this.make('lymph', lyB, 'lymph', { bands: 2, flat: true, px: 0 });
    this.flat.add(ly);

    // bile (the Bile layer): the canaliculi run between neighbouring plates, from the centre out toward the edge (the blood runs the other way), the canals of Hering gather them
    // along the edge into each tract's ductule. Arrowheads run out toward the tract, against the blood.
    const bileSpeed = () => markSpeed(2.2 * Math.min(1.6, Math.max(0.3, Math.sqrt(Math.max(0.05, this.cur.flow)))));
    const chB = new Batch(), hrB = new Batch(), canalPool: Joiner[] = [];
    // (2D's own layout, lobule-bile.js, ported in bile.ts: a channel beside each plate's sinusoid from a quarter of the way out, a canal of Hering square into a duct along the
    // edge outside the lymphatic, each half edge's duct into its corner's ductule; Mohammad, 20 Nov 2026, "the bile ducts are still a mess ... mimick" 2D)
    for (const c of buildBile(net)) {
      const off = markOffset(c.pts[0]!), duct = c.kind === 'bh', rad = c.radius;
      (duct ? hrB : chB).tube(c.pts.map((p) => p3(p, duct ? 0.014 : 0.012)), { radius: (i) => Math.max(1e-4, rad[i]! * R), radial: 6, uvx: (_i, arc) => arc / ((duct ? RAD.bh : RAD.bc) * MARK_PITCHES) + off });
      this.bilePick.push({ id: BILE_ID + this.bilePick.length, kind: c.kind, pts: c.pts, ...(c.tri != null ? { tri: c.tri } : {}) });
      if (duct) canalPool.push({ id: CANAL_ID + canalPool.length, pts: c.pts.slice().reverse() });
    }
    // (no outline on either: 2D's wall is 0.3 px on a canaliculus and 0.6 on a canal of Hering, a faint olive hairline; the cel line's 2 px floor on a tube under a pixel wide made them dark bars, thick olive rungs between the sinusoids)
    const bc = this.make('bile', chB, 'bile', { bands: 2, flat: true, px: 0, chevrons: { pitch: RAD.bc * MARK_PITCHES, speed: bileSpeed, dir: 1, bile: true } });
    const bh = this.make('bile', hrB, 'bile', { bands: 2, flat: true, px: 0, chevrons: { pitch: RAD.bh * MARK_PITCHES, speed: bileSpeed, dir: 1, bile: true } });
    this.bileObjs = [bc, bh];
    // the ductule's wall opens where a canal of Hering joins it (2D: mouths while the Bile layer is on, mouthsNoBile while it is off)
    this.discInfo.get('bd')!.setPool(canalPool);

    // the wedge's wash: amber over the sinusoids (cut by the front's radius in uv.x) and the central vein
    const wb = new Batch();
    for (const c of by('s0', 's1', 's2', 'an')) wb.tube(c.pts.map((p) => p3(p)), { radius: c.kind === 'an' ? RAD.an : RAD[c.kind as 's0' | 's1' | 's2'], radial: 7, uvx: (i) => c.rho[i]! });
    const washSin = this.make('wash', wb, 'amber', { bands: 2, px: 0 });
    const washCv = this.make('wash', axial(by('cv'), RAD.cv), 'amber', { bands: 2, px: 0 });
    washSin.setReveal(0); washCv.group.visible = washSin.group.visible = false;

    this.o = { s0, s1, s2, an, inlets, pv, ha, bd, tw, cv, lv, lt, ly, washSin, washCv };
    // the placeholder drivers: each part knows its objects (and palette, ink and disposal go through them)
    for (const name of LOBULE_PARTS) {
      const objs = this.set.get(name).group.children.length ? this.objects.filter((o) => this.set.get(name).group.children.includes(o.group)) : [];
      this.set.get(name).driver = { objects: objs, palette: () => {}, phone: () => {}, step: () => false, dispose: () => { for (const o of objs) o.dispose(); } };
    }
    this.apply();
  }

  // ---- looks and device -----------------------------------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; }
  get palette(): Palette { return LOBULE_PALETTES[this.look]; }

  applyLook(look: LookId): void {
    this.look = look; this.pushInk();
    const p = LOBULE_PALETTES[look], L = lookColours(look);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    // every outline is 2D's casing (--vessel-casing: a warm sepia at .64 on Light, near black at .3 on Dark) laid over the tissue it crosses, not the look's hard ink
    const casing = new Color(...L.rgb01('--vessel-casing')), ca = L.alpha('--vessel-casing');
    const cell = L.dark ? (() => { const g = L.rgb01('--og-liver-2'), c = L.rgb01('--og-liver-1'); return new Color(g[0] + (c[0] - g[0]) * 0.28, g[1] + (c[1] - g[1]) * 0.28, g[2] + (c[2] - g[2]) * 0.28); })() : new Color(...L.rgb01('--og-liver-1'));
    const ink = cell.clone().lerp(casing, ca);
    for (const o of this.objects) (o.ink.uniforms.color.value as Color).copy(ink);
    // the triad's three vessels and the inlet venule carry a dark outline of their own colour, the venule's blue, the arteriole's red, the ductule's olive (2D: EDGE, at 0.92), the rest the common casing
    const edges: [CelObject, readonly number[]][] = [[this.o.pv, DISC_EDGE.pv], [this.o.inlets, DISC_EDGE.in], [this.o.ha, DISC_EDGE.ha], [this.o.bd, DISC_EDGE.bd]];
    for (const [o, e] of edges) (o.ink.uniforms.color.value as Color).setRGB(cell.r + (e[0]! - cell.r) * 0.92, cell.g + (e[1]! - cell.g) * 0.92, cell.b + (e[2]! - cell.b) * 0.92);
    // the space of Disse is one flat tone (no light, no outline); the lymph's marks are soft bands with an amber core, as 2D's
    for (const o of this.flat) (o.toon.uniforms.shade.value as Color).copy(o.toon.uniforms.color.value as Color);
    this.paintDisse();
    // the flow heads' inks: 2D's near-black and cream (the lumen's luminance picks) and the reversed orange of the look (the lymph's and the bile's are their own, in the shader)
    for (const mk of this.marked) {
      const u = mk.obj.toon.uniforms;
      rawColor(LENS_SHARED.chevron, u.headDark.value as Color); rawColor(LENS_SHARED.chevronLight, u.headLight.value as Color); rawColor(LENS_TOKENS[look].flowReversed, u.headRevCol.value as Color);
    }
    this.zones.applyLook(look);
    this.dirty = true;
  }
  /** The space of Disse's one flat colour (2D LYD: the lymph's teal deepened with filtration, disse.ts), shade and fill the same: no tone, no line, no marks. */
  private paintDisse(): void {
    const u = this.o.ly.toon.uniforms, c = disseColour(this.cur.prot, this.cur.lymphRate, lookColours(this.look).dark);
    (u.color.value as Color).setRGB(c[0], c[1], c[2], LinearSRGBColorSpace);
    (u.shade.value as Color).copy(u.color.value as Color);
  }
  setPhone(phone: boolean): void { this.phone = phone; for (const o of this.objects) o.setPhone(phone); this.dirty = true; }

  // ---- what the slide and the model say -------------------------------------------------------------------------------------------

  setVisible(v: boolean): void {
    this.visible = v; this.group.visible = v; this.dirty = true; if (!v) this.washOn = false;
    if (v) {
      this.inks.freshen();   // (opens already in the lens's colours: nothing eases in while the view was away)
      // (and on its tissue as it is now: the plate and the field are painted before the first frame, never crossfaded in from an old state)
      this.wantTissue(); this.plate.snap();
      this.greyK = this.greyGoal(); this.field.setGrey(this.greyK);
    }
  }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the engine's frame (lobuleModel). They ease in; nothing jumps. */
  setModel(m: LobuleModel): void {
    this.model = m; this.pushInk();
    const g = this.goal;
    g.fibSin = m.fibSin; g.fibPre = m.fibPre; g.fibPost = m.fibPost; g.congU = m.congU; g.septU = m.septU; g.act = m.act;
    g.lum = m.zone.sin ** -0.12;   // (2D radiusAt: the sinusoid's width is / sin^0.12 and, by zone 3's share of each generation, x (1 + 1.5 congU))
    g.flow = m.rev.sin ? -Math.abs(m.flow) : Math.abs(m.flow);
    g.portal = m.rev.pre ? -Math.abs(m.portal) : Math.abs(m.portal);
    g.art = Math.abs(m.art);
    g.lymphRate = Math.min(6, Math.max(0.2, lymphRate(m)));
    g.seal = lymphSeal(m); g.prot = lymphProtein(m);
    this.dirty = true;
  }
  /** The state at once, no ease (the view opens on the first frame already as the model has it). */
  snapModel(m: LobuleModel): void { this.setModel(m); Object.assign(this.cur, this.goal); this.dirty = true; }

  setLayers(l: Partial<LobuleLayers>): void { this.layers = { ...this.layers, ...l }; this.dirty = true; }
  get currentLayers(): Readonly<LobuleLayers> { return this.layers; }

  setLit(parts: Iterable<LobulePartName>): void { this.lit = new Set(parts); this.dirty = true; }
  setFlowMode(mode: FlowMarkMode): void { this.mode = mode; this.dirty = true; }
  /** The colour lens the vessels wear (the Layers menu's, as the 2D lobule colours its lumen by it); the colours ease over about a third of a second. */
  setLens(lens: LensId): void { if (lens === this.lens) return; this.lens = lens; this.pushInk(); this.dirty = true; }
  /** Every lens but Pressure (and the neutral one) greys the anatomy's organs; the neighbouring lobules take the same grey (2D: surroundGrade). */
  private greyGoal(): number { return this.lens !== 'pressure' && this.lens !== ('neutral' as LensId) ? 1 : 0; }
  /** The tissue the plate and the field should show: the model's targets (they are painted once per state and crossfaded, not every eased frame). */
  private wantTissue(): void {
    const g = this.goal;
    this.plate.want({ congU: g.congU, septU: g.septU, fibSin: g.fibSin, act: g.act, fibPre: g.fibPre, fibPost: g.fibPost }, this.look);
    this.field.want(this.look, this.fsQ(g));
  }
  get currentLens(): LensId { return this.lens; }
  /** The node pressures the Change, Congestion and `since` lenses count from (the healthy patient's, a pinned moment's, a slide's). */
  setReference(ref: ArrayLike<number> | null): void { this.ref = ref; this.pushInk(); this.dirty = true; }
  /** What the vessels' colour is worked out from now (the sinusoid view colours its lumen the same way); null before the first model. */
  inkContext(): InkContext | null { return this.model ? { lens: this.lens, look: this.look, model: this.model, ref: this.ref, fibSin: this.cur.fibSin } : null; }
  private pushInk(): void { if (this.model) this.inks.set({ lens: this.lens, look: this.look, model: this.model, ref: this.ref, fibSin: this.cur.fibSin }); }
  /** The Blood menu: moving blood (chevrons) on or off, and key routes only (then only the parts a slide names carry them). */
  setBlood(b: { chevrons: boolean; keyChevrons: boolean }): void { this.blood = { chevrons: b.chevrons, key: b.keyChevrons }; this.dirty = true; }
  /** Option D: a change happened (a preset, a slider, a treatment). */
  pulse(nowMs: number): void { this.pulseStart = nowMs; this.pulseUntil = nowMs + PULSE_MS; this.dirty = true; }

  /** The wedge's wash begins counting from when the view landed. Only a slide that says `wash` turns it on. */
  startWash(landedAtMs: number): void { this.washOn = true; this.washAt = landedAtMs; this.dirty = true; }
  stopWash(): void { this.washOn = false; this.washK = 0; this.dirty = true; }
  get washProgress(): number { return this.washK; }

  /** Replaces a placeholder part with the artist's node (parts.ts). */
  swap(name: LobulePartName, node: Parameters<PartSet<LobulePartName>['swap']>[1], keepPlaceholder = false): void { this.set.swap(name, node, keepPlaceholder); this.dirty = true; }

  // ---- the frame ------------------------------------------------------------------------------------------------------------------

  /** Steps the view on the clock. Returns true while anything moves (marks running, a state easing, the wash, a fade): the scene draws another frame. */
  update(now: number): boolean {
    if (!this.visible) { this.lastNow = -1; return false; }
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    let moving = this.dirty;
    this.dirty = false;
    if (easeToward(this.cur as unknown as Record<string, number>, this.goal as unknown as Record<string, number>, this.reduce ? 1e6 : dt)) moving = true;
    // the Lymph layer fades in and out (the ducts shrink to nothing, never pop)
    const lyGoal = this.layers.lymph ? 1 : 0, k = this.reduce ? 1 : Math.min(1, dt / FLOW_FADE_MS);
    const biGoal = this.layers.bile ? 1 : 0, zoGoal = this.layers.zones ? 1 : 0;
    if (this.bileFade !== biGoal) { this.bileFade = Math.abs(biGoal - this.bileFade) <= k ? biGoal : this.bileFade + Math.sign(biGoal - this.bileFade) * k; moving = true; }
    if (this.zoneFade !== zoGoal) { this.zoneFade = Math.abs(zoGoal - this.zoneFade) <= k ? zoGoal : this.zoneFade + Math.sign(zoGoal - this.zoneFade) * k; moving = true; }
    this.zones.set(this.zoneFade);
    // the tissue: a new state is painted once and crossfaded in (plate.ts); the field's tile follows the state in 2D's eighths
    this.wantTissue();
    if (this.plate.step(dt, this.reduce)) moving = true;
    const gGoal = this.greyGoal();
    if (this.greyK !== gGoal) { const gk = this.reduce ? 1 : dt / GREY_MS; this.greyK = Math.abs(gGoal - this.greyK) <= gk ? gGoal : this.greyK + Math.sign(gGoal - this.greyK) * gk; this.field.setGrey(this.greyK); moving = true; }
    const stGoal = 1 - smooth(0.12, 0.45, Math.max(0, this.goal.flow)), stK = this.reduce ? 1 : 1 - Math.exp(-dt / 500);
    if (this.stasis !== stGoal) { this.stasis = Math.abs(stGoal - this.stasis) < 1e-3 ? stGoal : this.stasis + (stGoal - this.stasis) * stK; moving = true; }
    if (this.lyFade !== lyGoal) { this.lyFade = Math.abs(lyGoal - this.lyFade) <= k ? lyGoal : this.lyFade + Math.sign(lyGoal - this.lyFade) * k; moving = true; }
    // the wash
    if (this.washOn) { const kk = washProgress(now - this.washAt, this.reduce); if (kk !== this.washK) { this.washK = kk; moving = true; } if (kk < 1) moving = true; }
    // chevrons: each marked object fades to its goal
    for (const mk of this.marked) {
      // blood: the Blood menu's chevrons, as the 2D lobule shows them (all of them, or the parts the slide names when "key chevrons only"); the lymph's follow its layer
      let goal = mk.layer === 'lymph' ? this.lyFade : mk.layer === 'bile' ? this.bileFade : this.blood.chevrons && (!this.blood.key || this.lit.has(mk.part)) ? 1 : 0;
      // a stagnant sinusoid: the chevrons fade out over the first half of the stasis, the smoke (soft bands, drifting slowly) in over the second, and back
      if (mk.smokes) goal *= this.stasis < 0.5 ? 1 - 2 * this.stasis : 2 * this.stasis - 1;
      if (mk.amount !== goal) { mk.amount = Math.abs(goal - mk.amount) <= k ? goal : mk.amount + Math.sign(goal - mk.amount) * k; moving = true; }
      if (mk.amount > 0.001) moving = true;   // marks run: keep asking for frames
      // the heads' stream moves at the flow's speed (marks a second of the old period, the 2D painter's speeds), its distance kept here as 2D keeps sm.D; reduced motion holds it
      const sp = mk.speed() * mk.dir;
      if (!this.reduce && mk.amount > 0.001) mk.phase = (((mk.phase + sp * mk.arc * HEAD_K * dt / 1000) % HEAD_PERIOD) + HEAD_PERIOD) % HEAD_PERIOD;
      // an inlet whose portal flow runs backward carries orange heads with a second small one behind (the flag eases, as 2D's sm.rev)
      const revGoal = mk.part === 'inlets' && this.cur.portal < -0.02 ? 1 : 0;
      mk.rev += (revGoal - mk.rev) * (this.reduce ? 1 : 1 - Math.exp(-dt / 500));
    }
    if (this.inks.step(dt, this.reduce)) moving = true;
    this.apply();
    return moving;
  }


  /** Writes the eased state into the objects' uniforms (inflate, reveal, flow marks, visibility). Cheap: a few dozen assignments. */
  private apply(): void {
    const c = this.cur, o = this.o;
    const infl = (obj: CelObject, v: number) => { obj.toon.uniforms.inflate.value = v; };
    // sinusoids: capillarized ones narrow, congested zone 3 ones dilate (the 2D lumen width)
    const sinF = (k: keyof typeof CONG_Z3) => c.lum * (1 + 1.5 * c.congU * CONG_Z3[k]) - 1;
    infl(o.s0, RAD.s0 * sinF('s0')); infl(o.s1, RAD.s1 * sinF('s1')); infl(o.s2, RAD.s2 * sinF('s2')); infl(o.an, RAD.an * sinF('an'));
    // (zone 3's cells dropping out with congestion, the stellate cells activating and the collagen of fibrosis and cirrhosis are painted on the plate, as 2D paints them)
    // lymph: the whole part shrinks away with its layer; no group is hidden until it has gone
    const f = this.lyFade;
    this.set.get('lymph').group.visible = f > 0.002;
    this.paintDisse();
    infl(o.lt, -RAD.lt * (1 - f)); infl(o.ly, -RAD.ly * (1 - f) + 0.004 * c.seal);
    this.updateDiscs();
    // bile: the Bile layer's canaliculi and canals shrink away with it; the ductules at the tracts swell a little while it is on
    const bf = this.bileFade;
    this.set.get('bile').group.visible = bf > 0.002;
    infl(this.bileObjs[0]!, -RAD.bc * (1 - bf)); infl(this.bileObjs[1]!, -RAD.bh * (1 - bf));
    // marks: speed from the flow, direction from the course (the Disse's marks run against its course), amount faded
    for (const mk of this.marked) {
      const smoke = mk.smokes && this.stasis >= 0.5;
      const sp = mk.speed() * mk.dir, u = mk.obj.toon.uniforms;
      u.stubSpeed.value = smoke ? 0.14 : sp;
      mk.obj.setFlow(smoke ? mk.amount : 0, true);   // (the stagnant sinusoid's soft smoke bands only: the stripe chevron is gone from the lobule)
      // the flow heads, 2D's (shading.ts): a still stream (no flow) shows none, as a sinusoid whose flow has stopped does in 2D
      u.headAmount.value = smoke || Math.abs(sp) < 0.02 ? 0 : mk.amount;
      u.headDir.value = sp < 0 ? -1 : 1; u.headPhase.value = mk.phase; u.headRev.value = mk.rev;
    }
    // the wedge's amber
    const k = this.washK, front = washFront(k, this.net.rcv0);
    const showWash = this.washOn && k > 0;
    o.washSin.group.visible = o.washCv.group.visible = showWash;
    if (showWash) {
      const a = washAmount(k) / 0.85;
      o.washSin.setReveal(front);
      infl(o.washSin, -0.02 + 0.03 * a); infl(o.washCv, -0.05 + 0.08 * a);
    }
  }

  /** A vessel's radius at its sample i as drawn now, in lobule radii: 2D's radiusAt (widths.ts) with the state's widening and narrowing. */
  radiusNow(t: PickTube, i: number): number {
    const c = this.cur, k = t.kind, n = t.pts.length;
    if (k === 's0' || k === 's1' || k === 's2' || k === 'an') return sinRadius(k, (t as Course).rho[i]!) * c.lum * (1 + 1.5 * c.congU * CONG_Z3[k]);
    if (k === 'in') return inletRadius(i, n, Math.hypot(t.pts[i]![0] - t.pts[0]![0], t.pts[i]![1] - t.pts[0]![1])) / (1 + 0.45 * c.fibPre);
    if (k === 'tw') return twigR(i / (n - 1), RS_N);
    if (k === 'lt' || k === 'lv') return LT_R * lyWr(c.lymphRate, 0.4);
    if (k === 'ly') return disseRadius((t as Course).rho[i]!);
    if (k === 'bs') return RAD.bc / R;
    return RAD.bh / R;
  }

  /** The central vein's radius as drawn now (lobule radii). */
  get cvRadiusNow(): number { return DISC_R.cv * (((DISC_R.cv + 0.05 * this.cur.congU) * (1 - 0.3 * this.cur.fibPost)) / DISC_R.cv); }

  /** What a tap at lobule-plane point (x, y) (lobule radii, y down) is, with `pxPerR` screen pixels to a radius (2D's own rule, pick.ts). */
  hit(x: number, y: number, pxPerR: number): LobuleHit | null {
    return lobuleHit(this.net, [...this.net.courses, ...this.bilePick], {
      septU: this.cur.septU, lymphOn: this.layers.lymph, bileOn: this.layers.bile, radius: (t, i) => this.radiusNow(t, i), cvRadius: this.cvRadiusNow, pxPerR,
    }, x, y);
  }

  /** The hit under a world ray (the plate lies in the group's z = 0): the ray's point on the plate in lobule radii, and the screen pixels to a radius there, from the camera and the canvas size. */
  hitRay(ray: Ray, camera: Camera, canvas: { w: number; h: number }): LobuleHit | null {
    this.group.updateWorldMatrix(true, false);
    const inv = new Matrix4().copy(this.group.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(inv), at = local.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), new Vector3());
    if (!at) return null;
    const x = at.x / R, y = -at.y / R;
    // screen pixels to a lobule radius: two points a radius apart on the plate, projected
    const a = new Vector3(at.x, at.y, 0).applyMatrix4(this.group.matrixWorld).project(camera), b = new Vector3(at.x + R, at.y, 0).applyMatrix4(this.group.matrixWorld).project(camera);
    const pxPerR = Math.max(1e-3, Math.hypot((b.x - a.x) * canvas.w * 0.5, (b.y - a.y) * canvas.h * 0.5));
    return this.hit(x, y, pxPerR);
  }

  /** The end-on vessels' radii by the state (2D radiusAt: the central vein widens with congestion and narrows with post-sinusoidal fibrosis, the venule narrows with pre-sinusoidal, the arteriole follows the arterial inflow,
   *  the lymphatic the drainage and its layer) and the masks of their mouths, worked out from the radii as drawn and written again whenever those move (lobule-mouths.js mouthWords). */
  private updateDiscs(): void {
    const c = this.cur, lyF = this.lyFade;
    const k: Record<DiscKind, number> = {
      cv: ((DISC_R.cv + 0.05 * c.congU) * (1 - 0.3 * c.fibPost)) / DISC_R.cv, pv: 1 / (1 + 0.35 * c.fibPre), ha: Math.min(2.2, Math.max(0.6, c.art)) ** 0.3,
      bd: 1, lv: lyWr(c.lymphRate, 0.4) * lyF,
    };
    const key = [k.cv, k.pv, k.ha, k.lv, c.lum, c.congU, c.fibPre, c.art, this.layers.bile ? 1 : 0].map((x) => x.toFixed(3)).join();
    if (key === this.discKey) return;
    this.discKey = key;
    const join = (kind: DiscKind): boolean => kind !== 'bd' || this.layers.bile;
    for (const [kind, info] of this.discInfo) {
      const radiiOf = (j: Joiner): ArrayLike<number> => {
        let a = info.radiiOf.get(j.id);
        if (!a) { a = new Float64Array(j.pts.length); info.radiiOf.set(j.id, a); }
        const t: PickTube = j.id < CANAL_ID ? this.net.courses[j.id]! : { id: j.id, kind: 'bh', pts: j.pts };
        for (let i = 0; i < j.pts.length; i++) a[i] = this.radiusNow(t, i);
        return a;
      };
      const sh = shadeUniforms(info.obj), rim = (DISC_R[kind] * k[kind]);
      sh.discK.value = Math.max(k[kind], 1e-4);
      const jr = join(kind) ? writeMouths(info.geo, info.discs, info.pool, () => Math.max(rim, 1e-3), radiiOf) : writeMouths(info.geo, info.discs.map((d) => ({ ...d, site: null })), info.pool, () => rim, radiiOf);
      sh.discJoin.value = join(kind) && info.discs.some((d) => d.site) ? 1 : 0;
      // (the wall of a disc that vessels join is one line as wide as theirs: 2D discWall)
      sh.inkR.value = (jr > 0 ? jr : rim) * R;
    }
  }

  // ---- tags, picking, warming -----------------------------------------------------------------------------------------------------

  /** Scene (world) points of the places tags name: the centre, each triad ('triad:0' to 'triad:5'), the zones ('zone:1' periportal, 'zone:2' midzonal, 'zone:3' pericentral).
   *  The lobule stands inside the liver, so these are points of the liver, a hundred times closer together than the lobule's own units. */
  anchor(name: string, out: V3 = [0, 0, 0]): V3 {
    const w = (x: number, y: number, z: number) => lobuleWorld(lobuleToScene(x, y, z, out), out);
    if (name === 'centre') return w(0, 0, slabZ(0, 0) + ANCHOR_Z);
    if (name.startsWith('triad:')) { const t = this.net.triads[Number(name.slice(6))]; if (t) return w(t.x, t.y, slabZ(t.x, t.y) + ANCHOR_Z); }
    if (name.startsWith('zone:')) { const rr = { 1: 0.82, 2: 0.5, 3: 0.2 }[Number(name.slice(5)) as 1 | 2 | 3] ?? 0.5; return w(Math.cos(Math.PI / 6) * rr, Math.sin(Math.PI / 6) * rr, slabZ(0.7, 0.4) + ANCHOR_Z); }
    return w(0, 0, 0);
  }

  /** A point of the plate (its own units, the plane the labels stand on) in the scene. */
  anchorAt(x: number, y: number, out: V3 = [0, 0, 0]): V3 { return lobuleWorld(lobuleToScene(x, y, slabZ(x, y) + ANCHOR_Z, out), out); }
  /** Every mesh a tap can land on: the parts' tubes and the tissue plate (the zones' overlay only while it shows; the neighbouring lobules never: a tap there is a tap on nothing). */
  get pickables(): Object3D[] { return [...this.objects.map((o) => o.toonMesh), ...this.plate.meshes, ...(this.zones.mesh.visible ? [this.zones.mesh] : [])]; }

  /** The part whose toon mesh a ray hits first (for tap-to-explain), or null. */
  partAt(hits: readonly { object: unknown }[]): LobulePartName | null {
    for (const h of hits) {
      const o = this.objects.find((x) => x.toonMesh === h.object);
      if (o) for (const name of LOBULE_PARTS) if (this.set.get(name).group.children.includes(o.group)) return name;
      if (this.plate.meshes.includes(h.object as never) || h.object === this.zones.mesh) return 'cords';
      if (h.object === this.field.mesh) return 'field';
    }
    return null;
  }

  /** Compiles the view's programs and uploads its buffers once, ahead of the dive (call at idle after boot, with the scene's renderer): the first open then draws without a hitch. */
  warm(gl: { compile?: (s: Group, c: unknown) => void }, camera: unknown): void {
    const was = this.group.visible;
    this.group.visible = true;
    try { gl.compile?.(this.group, camera); } finally { this.group.visible = was; }
  }

  dispose(): void { for (const o of this.objects) o.dispose(); this.plate.dispose(); this.zones.dispose(); this.field.dispose(); }
}

/** One zone name for a place, for labels ('Zone 1 · periportal'). */
export const ZONE_NAMES = { 1: 'Zone 1 · periportal', 2: 'Zone 2 · midzonal', 3: 'Zone 3 · pericentral' } as const;
