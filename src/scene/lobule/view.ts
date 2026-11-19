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
import { type BufferGeometry, Color, Group } from 'three';
import { CelObject, type CelShared, rawColor } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE, FLOW_FADE_MS, PULSE_MS, markSpeed } from '../flow.ts';
import type { LensId } from '../lenses/model.ts';
import { Batch, type V3 } from './batch.ts';
import { type Course, type LobuleNet, type P2, buildLobule, zoneOf } from './geometry.ts';
import { type LobuleModel, easeToward, lymphRate, lymphSeal, smooth } from './model.ts';
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

const R = LOBULE_R;
const MARK_PITCHES = 5;   // a chevron period is this many tube radii

/** Scene radii of the parts (lobule radii × R). The sinusoid's is the 2D app's lumen, drawn about twice as wide; the rest keep the 2D ratios. */
const RAD = {
  s0: 0.0095 * R, s1: 0.0109 * R, s2: 0.0124 * R, an: 0.0068 * R, in: 0.0135 * R, tw: 0.0072 * R,
  pv: 0.042 * R, ha: 0.015 * R, bd: 0.013 * R, lv: 0.013 * R, cv: 0.07 * R, lt: 0.0085 * R, ly: 0.0132 * R, bc: 0.0046 * R, bh: 0.0075 * R,
} as const;

/** A disc's half thickness (an end-on vessel is a flat disc on the plate) and how far under its sinusoid the space of Disse's band lies. */
const DISC_T = 0.008, DISSE_DZ = 0.03;
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

export interface LobuleLayers { lymph: boolean; zones: boolean; bile: boolean }
export interface LobuleViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean; canvas?: MakeCanvas }
/** Parts that are painted on the plate (the 2D painter draws them with the tissue), so they have no geometry of their own. */
export const PLATE_PAINTED: readonly LobulePartName[] = ['stellate', 'septa', 'cuffs'];
/** How long the surround takes to grey (or come back) when the lens changes (2D: the lens crossfade). */
const GREY_MS = 350;

/** The eased scalars the drawing reads (all move toward the model's targets). */
interface Cur {
  fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number;
  flow: number; portal: number; art: number; lymphRate: number; seal: number;
}
const REST: Cur = { fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, septU: 0, act: 0, lum: 1, flow: 1, portal: 1, art: 1, lymphRate: 1, seal: 0 };

/** A chevron-carrying object: its pitch and how much of its marks show now. */
interface Marked { obj: CelObject; part: LobulePartName; amount: number; dir: 1 | -1; speed: () => number; layer: 'blood' | 'lymph' | 'bile'; smokes: boolean }

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
  private layers: LobuleLayers = { lymph: true, zones: false, bile: false };
  private lyFade = 1;
  private bileFade = 0;
  /** How stagnant the sinusoids' blood is, 0 moving .. 1 still (the 2D `stasis`: 1 - smooth(0.12, 0.45, flow)): the chevrons give way to a slow smoke. */
  private stasis = 0;
  private bileObjs: CelObject[] = [];
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

  private make(part: LobulePartName, b: Batch, toneKey: Parameters<typeof tone>[0], opts: { bands: 2 | 3; px: number; chevrons?: { pitch: number; speed: () => number; dir?: 1 | -1; lymph?: boolean; bile?: boolean }; ink?: { seg: Seg; courses?: Course[] } }): CelObject {
    const c = opts.chevrons;
    if (opts.ink) b.withInk();
    const o = new CelObject(b.build(), {
      tone: tone(toneKey), bands: opts.bands, spec: 0, px: opts.px,
      // a vessel as far as the shader goes: marks along uv.x. uv.x is already in chevron periods (arc ÷ pitch), so len is the shader's own 0.45 per mark.
      vessel: c ? { index: 0, len: 0.45, stubSpeed: 0, radius: 0, baseD: 1 } : undefined,
    }, this.shared);
    this.objects.push(o);
    const p = this.set.get(part);
    p.group.add(o.group);
    if (opts.ink) {
      o.setInkAmount(1);
      const courses = opts.ink.courses ?? [], seg = opts.ink.seg;
      this.inks.add(o.toonMesh.geometry, seg, courses.length ? b.tubes : [], courses.map((c): [number, number] => [seg === 'sin' ? sinW(c.rho[0]!) : 0, seg === 'sin' ? sinW(c.rho[c.rho.length - 1]!) : 1]));
    }
    if (c) this.marked.push({ obj: o, part, amount: 0, dir: c.dir ?? 1, speed: c.speed, layer: c.bile ? 'bile' : c.lymph ? 'lymph' : 'blood', smokes: part === 'sinusoids' && !c.bile && !c.lymph });
    return o;
  }

  private build(): void {
    const net = this.net;
    const by = (...k: Course['kind'][]) => net.courses.filter((c) => k.includes(c.kind));
    const tubeSet = (cs: Course[], radius: number, dz = 0, radial = 7) => {
      const b = new Batch(), pitch = radius * MARK_PITCHES;
      for (const c of cs) b.tube(c.pts.map((p) => p3(p, dz)), { radius, radial, uvx: (_i, arc) => arc / pitch });
      return b;
    };
    // a vessel seen end-on (the central vein, the tract's venule, arteriole, ductule and lymphatic): a flat disc on the plate, as 2D's celDisc, not a
    // column standing out of it (the hexagonal prism of IMG_5637). Its face looks at the camera, so it is one flat tone inside its outline.
    const axial = (cs: Course[], radius: number) => {
      const b = new Batch();
      for (const c of cs) { const p = c.pts[Math.floor(c.pts.length / 2)]!; b.tube([p3(p, -DISC_T), p3(p, DISC_T)], { radius, radial: 48, capped: true, uvx: () => 0 }); }
      return b;
    };
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
    const s0 = this.make('sinusoids', tubeSet(by('s0'), RAD.s0), 'sin0', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s0') }, chevrons: { pitch: RAD.s0 * MARK_PITCHES, speed: sinSpeed(1) } });
    const s1 = this.make('sinusoids', tubeSet(by('s1'), RAD.s1), 'sin1', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s1') }, chevrons: { pitch: RAD.s1 * MARK_PITCHES, speed: sinSpeed(1.45) } });
    const s2 = this.make('sinusoids', tubeSet(by('s2'), RAD.s2), 'sin2', { bands: 2, px: INK.sin, ink: { seg: 'sin', courses: by('s2') }, chevrons: { pitch: RAD.s2 * MARK_PITCHES, speed: sinSpeed(2.05) } });
    const an = this.make('sinusoids', tubeSet(by('an'), RAD.an), 'sin1', { bands: 2, px: INK.thin, ink: { seg: 'sin', courses: by('an') } });
    const inlets = this.make('inlets', tubeSet(by('in'), RAD.in, 0, 8), 'portal', { bands: 2, px: INK.inlet, ink: { seg: 'in', courses: by('in') }, chevrons: { pitch: RAD.in * MARK_PITCHES, speed: inSpeed } });

    // the portal tracts: venule, arteriole (with the twig that feeds the first stretch of a sinusoid), ductule; the lymphatic is the lymph part's
    const pv = this.make('portal-tracts', axial(by('pv'), RAD.pv), 'portal', { bands: 2, px: INK.disc, ink: { seg: 'pv' } });
    const ha = this.make('portal-tracts', axial(by('ha'), RAD.ha), 'artery', { bands: 2, px: INK.disc });
    const bd = this.make('portal-tracts', axial(by('bd'), RAD.bd), 'bile', { bands: 2, px: INK.disc });
    const tw = this.make('portal-tracts', tubeSet(by('tw'), RAD.tw, 0, 6), 'artery', { bands: 2, px: INK.thin, chevrons: { pitch: RAD.tw * MARK_PITCHES, speed: twSpeed } });
    const cv = this.make('central-vein', axial(by('cv'), RAD.cv), 'sys', { bands: 2, px: INK.disc, ink: { seg: 'cv' } });

    // lymph: the tracts' lymphatics (end-on discs), the terminal lymphatics along the edges (toward the tract) and the space of Disse beside each sinusoid
    const lv = this.make('lymph', axial(by('lv'), RAD.lv), 'lymph', { bands: 2, px: INK.disc });
    const lt = this.make('lymph', tubeSet(by('lt'), RAD.lt, 0, 6), 'lymph', { bands: 2, px: INK.thin, chevrons: { pitch: RAD.lt * MARK_PITCHES, speed: lymphSpeed, lymph: true } });
    // the space of Disse: a flat pale band under its sinusoid, so only its rim shows either side (2D's Wet Disse sleeve, drawn under the sinusoid), with no
    // outline and no light of its own: no second tube wound round the first (the "rope" of IMG_5637). Its course runs inward, the lymph outward, so the marks run backwards
    const lyB = new Batch();
    for (const c of by('ly')) lyB.tube(c.pts.map((p) => p3(p, -DISSE_DZ)), { radius: RAD.ly, radial: 8, squash: 0.08, uvx: (_i, arc) => arc / (RAD.ly * MARK_PITCHES) });
    const ly = this.make('lymph', lyB, 'lymph', { bands: 2, px: 0, chevrons: { pitch: RAD.ly * MARK_PITCHES, speed: lymphSpeed, dir: -1, lymph: true } });
    this.flat.add(ly);

    // bile (the Bile layer): the canaliculi run between neighbouring plates, from the centre out toward the edge (the blood runs the other way), the canals of Hering gather them
    // along the edge into each tract's ductule. Arrowheads run out toward the tract, against the blood.
    const bileSpeed = () => markSpeed(2.2 * Math.min(1.6, Math.max(0.3, Math.sqrt(Math.max(0.05, this.cur.flow)))));
    const chB = new Batch(), hrB = new Batch();
    const mid = (a: Course, b: Course, i: number): P2 => [(a.pts[i]![0] + b.pts[i]![0]) / 2, (a.pts[i]![1] + b.pts[i]![1]) / 2];
    const s0c = by('s0');
    const channel = (cs: Course[], i0: number, i1: number, canals: boolean) => {
      cs.forEach((a, k) => {
        const b = cs[(k + 1) % cs.length]!;
        if (a.tri === undefined) return;
        const pts: P2[] = [];
        for (let i = i0; i <= i1; i++) pts.push(mid(a, b, i));
        if (Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 0.05) return;
        chB.tube(pts.map((p) => p3(p, 0.012)), { radius: RAD.bc, radial: 6, uvx: (_i, arc) => arc / (RAD.bc * MARK_PITCHES) });
        if (canals) {
          const tr = net.triads[a.tri]!, p0 = pts[0]!, bd = tr.bd;
          const pc: P2[] = [];
          // (from the ductule out along the edge, bowed in a little, to the first plate: the canal of Hering)
          for (let j = 0; j <= 8; j++) { const u = j / 8; pc.push([bd[0] + (p0[0] - bd[0]) * u + (tr.x - 0) * -0.012 * Math.sin(Math.PI * u), bd[1] + (p0[1] - bd[1]) * u + (tr.y - 0) * -0.012 * Math.sin(Math.PI * u)]); }
          hrB.tube(pc.map((p) => p3(p, 0.014)), { radius: RAD.bh, radial: 6, uvx: (_i, arc) => arc / (RAD.bh * MARK_PITCHES) });
        }
      });
    };
    channel(s0c, 2, 22, true);
    channel(by('s1'), 2, 20, false);
    channel(by('s2'), 3, 22, false);
    const bc = this.make('bile', chB, 'bile', { bands: 2, px: INK.thin, chevrons: { pitch: RAD.bc * MARK_PITCHES, speed: bileSpeed, dir: -1, bile: true } });
    const bh = this.make('bile', hrB, 'bile', { bands: 2, px: INK.thin, chevrons: { pitch: RAD.bh * MARK_PITCHES, speed: bileSpeed, dir: -1, bile: true } });
    this.bileObjs = [bc, bh];

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
    // the space of Disse is one flat tone (no light, no outline); the lymph's marks are soft bands with an amber core, as 2D's
    for (const o of this.flat) (o.toon.uniforms.shade.value as Color).copy(o.toon.uniforms.color.value as Color);
    for (const mk of this.marked) if (mk.layer === 'lymph') { rawColor(p.tones['amber' as never] as string, mk.obj.toon.uniforms.markColor.value as Color); rawColor(p.tones['amber' as never] as string, mk.obj.toon.uniforms.markReversed.value as Color); }
    this.zones.applyLook(look);
    this.dirty = true;
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
    g.lum = m.zone.sin ** -0.12 * (1 + 0.5 * m.congU);
    g.flow = m.rev.sin ? -Math.abs(m.flow) : Math.abs(m.flow);
    g.portal = m.rev.pre ? -Math.abs(m.portal) : Math.abs(m.portal);
    g.art = Math.abs(m.art);
    g.lymphRate = Math.min(6, Math.max(0.2, lymphRate(m)));
    g.seal = lymphSeal(m);
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
    const lumK = c.lum - 1;
    infl(o.s0, RAD.s0 * lumK * 0.6); infl(o.s1, RAD.s1 * lumK * 0.9); infl(o.s2, RAD.s2 * (lumK + 0.8 * c.congU)); infl(o.an, RAD.an * lumK * 0.6);
    // (zone 3's cells dropping out with congestion, the stellate cells activating and the collagen of fibrosis and cirrhosis are painted on the plate, as 2D paints them)
    // lymph: the whole part shrinks away with its layer; no group is hidden until it has gone
    const f = this.lyFade;
    this.set.get('lymph').group.visible = f > 0.002;
    infl(o.lv, -RAD.lv * (1 - f)); infl(o.lt, -RAD.lt * (1 - f)); infl(o.ly, -RAD.ly * (1 - f) + 0.004 * c.seal);
    // bile: the Bile layer's canaliculi and canals shrink away with it; the ductules at the tracts swell a little while it is on
    const bf = this.bileFade;
    this.set.get('bile').group.visible = bf > 0.002;
    infl(this.bileObjs[0]!, -RAD.bc * (1 - bf)); infl(this.bileObjs[1]!, -RAD.bh * (1 - bf));
    // marks: speed from the flow, direction from the course (the Disse's marks run against its course), amount faded
    for (const mk of this.marked) {
      const smoke = mk.smokes && this.stasis >= 0.5;
      mk.obj.toon.uniforms.stubSpeed.value = smoke ? 0.14 : mk.speed() * mk.dir;
      mk.obj.setFlow(mk.amount, smoke || mk.layer === 'lymph');   // (the lymph's marks are 2D's soft dashes, not arrowheads)
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
