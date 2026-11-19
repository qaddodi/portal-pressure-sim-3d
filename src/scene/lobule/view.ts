// The lobule in 3D: one hexagonal slab of liver, built once at start-up from the same network the 2D app draws (geometry.ts), so opening the view is a
// camera move and nothing is built (the views open instantly). Placeholder art for now; every part is named (parts.ts) and the artist's model replaces
// it part by part.
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
import { Group, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE, FLOW_FADE_MS, PULSE_MS, markSpeed, targetAmount } from '../flow.ts';
import { Batch, type V3 } from './batch.ts';
import { type Course, type LobuleNet, type P2, buildLobule, zoneOf } from './geometry.ts';
import { type LobuleModel, easeToward, lymphRate, lymphSeal } from './model.ts';
import { LOBULE_PARTS, type LobulePartName, PartSet } from './parts.ts';
import { LOBULE_PALETTES, tone } from './tones.ts';
import { LOBULE_R, LOBULE_T, lobuleToScene, slabZ } from './shots.ts';
import { WASH_DELAY_MS, washAmount, washFront, washProgress } from './wash.ts';

const R = LOBULE_R;
const MARK_PITCHES = 5;   // a chevron period is this many tube radii

/** Scene radii of the parts (lobule radii × R). The sinusoid's is the 2D app's lumen, drawn about twice as wide; the rest keep the 2D ratios. */
const RAD = {
  s0: 0.012 * R, s1: 0.0138 * R, s2: 0.0156 * R, an: 0.0085 * R, in: 0.02 * R, tw: 0.012 * R,
  pv: 0.042 * R, ha: 0.016 * R, bd: 0.02 * R, lv: 0.016 * R, cv: 0.07 * R, lt: 0.011 * R, ly: 0.02 * R,
} as const;

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

export interface LobuleLayers { lymph: boolean; zones: boolean }
export interface LobuleViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean }

/** The eased scalars the drawing reads (all move toward the model's targets). */
interface Cur {
  fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number;
  flow: number; portal: number; art: number; lymphRate: number; seal: number;
}
const REST: Cur = { fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, septU: 0, act: 0, lum: 1, flow: 1, portal: 1, art: 1, lymphRate: 1, seal: 0 };

/** A chevron-carrying object: its pitch and how much of its marks show now. */
interface Marked { obj: CelObject; part: LobulePartName; amount: number; dir: 1 | -1; speed: () => number; lymph: boolean }

const p3 = (p: P2, dz = 0): V3 => lobuleToScene(p[0], p[1], slabZ(p[0], p[1]) + dz);

export class LobuleView {
  readonly set = new PartSet<LobulePartName>(LOBULE_PARTS);
  readonly group: Group = this.set.group;
  readonly net: LobuleNet;
  /** Every object the view draws (for palette, ink width and disposal). */
  readonly objects: CelObject[] = [];
  private marked: Marked[] = [];
  private cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private lit = new Set<LobulePartName>();
  private mode: FlowMarkMode;
  private layers: LobuleLayers = { lymph: true, zones: false };
  private lyFade = 1;
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
    cords: CelObject[]; s0: CelObject; s1: CelObject; s2: CelObject; an: CelObject; inlets: CelObject;
    pv: CelObject; ha: CelObject; bd: CelObject; tw: CelObject; cv: CelObject; lv: CelObject; lt: CelObject; ly: CelObject;
    stellate: CelObject; septa: CelObject; cuffPre: CelObject; cuffPost: CelObject; washSin: CelObject; washCv: CelObject;
  };

  private readonly shared: CelShared;
  constructor(shared: CelShared, opts: LobuleViewOptions = {}, net: LobuleNet = buildLobule()) {
    this.shared = shared;
    this.net = net;
    this.look = opts.look ?? 'light';
    this.phone = !!opts.phone;
    this.mode = opts.flowMode ?? DEFAULT_FLOW_MODE;
    this.reduce = !!opts.reduceMotion;
    this.build();
    this.applyLook(this.look);
    this.group.visible = false;
  }

  // ---- building ------------------------------------------------------------------------------------------------------------------

  private make(part: LobulePartName, b: Batch, toneKey: Parameters<typeof tone>[0], opts: { bands: 2 | 3; px: number; chevrons?: { pitch: number; speed: () => number; dir?: 1 | -1; lymph?: boolean } }): CelObject {
    const c = opts.chevrons;
    const o = new CelObject(b.build(), {
      tone: tone(toneKey), bands: opts.bands, spec: 0, px: opts.px,
      // a vessel as far as the shader goes: marks along uv.x. uv.x is already in chevron periods (arc ÷ pitch), so len is the shader's own 0.45 per mark.
      vessel: c ? { index: 0, len: 0.45, stubSpeed: 0, radius: 0, baseD: 1 } : undefined,
    }, this.shared);
    this.objects.push(o);
    const p = this.set.get(part);
    p.group.add(o.group);
    if (c) this.marked.push({ obj: o, part, amount: 0, dir: c.dir ?? 1, speed: c.speed, lymph: !!c.lymph });
    return o;
  }

  private build(): void {
    const net = this.net, T = LOBULE_T;
    const by = (...k: Course['kind'][]) => net.courses.filter((c) => k.includes(c.kind));
    const tubeSet = (cs: Course[], radius: number, dz = 0, radial = 7) => {
      const b = new Batch(), pitch = radius * MARK_PITCHES;
      for (const c of cs) b.tube(c.pts.map((p) => p3(p, dz)), { radius, radial, uvx: (_i, arc) => arc / pitch });
      return b;
    };
    const axial = (cs: Course[], radius: number) => {
      const b = new Batch();
      for (const c of cs) { const p = c.pts[0]!; b.tube([p3(p, -T / 2), p3(p, T / 2)], { radius, radial: 12, capped: true, uvx: () => 0 }); }
      return b;
    };
    const bloodSpeed = (key: 'flow' | 'portal' | 'art') => () => markSpeed(Math.max(-3, Math.min(3, this.cur[key])) * 8);
    const lymphSpeed = () => markSpeed(8 * Math.min(6, Math.max(0.2, this.cur.lymphRate)));

    // cords: three zones of hepatocyte plates, ellipsoid beads on the cords (radial length, tangential width, half a slab thick)
    const bead = new SphereGeometry(1, 8, 6);
    const cb = [new Batch(), new Batch(), new Batch()];
    const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), axis = new Vector3(0, 0, 1);
    for (const c of net.cells) {
      const z = zoneOf(c.q), at = p3([c.x, c.y], -0.04);
      q.setFromAxisAngle(axis, -c.a);
      pos.set(at[0], at[1], at[2]);
      sc.set((c.l * R) / 2 * 0.92, (c.w * R) / 2 * 0.92, T * 0.34 * (0.9 + 0.2 * c.tone));
      m.compose(pos, q, sc);
      cb[z - 1]!.shape(bead, m);
    }
    const cords = cb.map((b, i) => this.make('cords', b, (`cord${i + 1}` as 'cord1'), { bands: 3, px: 1.0 }));

    // sinusoids: three generations and the links; blood runs from the portal end to the central end (negative when the lobule's flow reverses)
    const s0 = this.make('sinusoids', tubeSet(by('s0'), RAD.s0), 'sin0', { bands: 2, px: 1.0, chevrons: { pitch: RAD.s0 * MARK_PITCHES, speed: bloodSpeed('flow') } });
    const s1 = this.make('sinusoids', tubeSet(by('s1'), RAD.s1), 'sin1', { bands: 2, px: 1.0, chevrons: { pitch: RAD.s1 * MARK_PITCHES, speed: bloodSpeed('flow') } });
    const s2 = this.make('sinusoids', tubeSet(by('s2'), RAD.s2), 'sin2', { bands: 2, px: 1.0, chevrons: { pitch: RAD.s2 * MARK_PITCHES, speed: bloodSpeed('flow') } });
    const an = this.make('sinusoids', tubeSet(by('an'), RAD.an), 'sin1', { bands: 2, px: 0.9 });
    const inlets = this.make('inlets', tubeSet(by('in'), RAD.in, 0, 8), 'portal', { bands: 2, px: 1.2, chevrons: { pitch: RAD.in * MARK_PITCHES, speed: bloodSpeed('portal') } });

    // the portal tracts: venule, arteriole (with the twig that feeds the first stretch of a sinusoid), ductule; the lymphatic is the lymph part's
    const pv = this.make('portal-tracts', axial(by('pv'), RAD.pv), 'portal', { bands: 2, px: 1.2 });
    const ha = this.make('portal-tracts', axial(by('ha'), RAD.ha), 'artery', { bands: 2, px: 1.0 });
    const bd = this.make('portal-tracts', axial(by('bd'), RAD.bd), 'bile', { bands: 2, px: 1.0 });
    const tw = this.make('portal-tracts', tubeSet(by('tw'), RAD.tw, 0, 6), 'artery', { bands: 2, px: 0.9, chevrons: { pitch: RAD.tw * MARK_PITCHES, speed: bloodSpeed('art') } });
    const cv = this.make('central-vein', axial(by('cv'), RAD.cv), 'sys', { bands: 2, px: 1.4 });

    // lymph: the tracts' lymphatics (end-on), the terminal lymphatics along the edges (toward the tract) and the space of Disse beside each sinusoid (out toward the plate, so against the blood)
    const lv = this.make('lymph', axial(by('lv'), RAD.lv), 'lymph', { bands: 2, px: 0.9 });
    const lt = this.make('lymph', tubeSet(by('lt'), RAD.lt, 0, 6), 'lymph', { bands: 2, px: 0.9, chevrons: { pitch: RAD.lt * MARK_PITCHES, speed: lymphSpeed, lymph: true } });
    // the space of Disse is a sleeve centred on its sinusoid and drawn just behind it (2D: Wet Disse); its course runs inward, the lymph outward, so the marks run backwards
    const ly = this.make('lymph', tubeSet(by('ly'), RAD.ly, -RAD.ly * 0.35, 6), 'lymph', { bands: 2, px: 0.8, chevrons: { pitch: RAD.ly * MARK_PITCHES, speed: lymphSpeed, dir: -1, lymph: true } });

    // stellate cells in the space of Disse
    const sb = new Batch(), sph = new SphereGeometry(1, 8, 6);
    for (const s of net.stellate) {
      const at = p3([s.x, s.y], -0.05);
      q.setFromAxisAngle(axis, -s.a);
      pos.set(at[0], at[1], at[2]);
      sc.set(0.05 * 1.5, 0.05, 0.05);
      m.compose(pos, q, sc);
      sb.shape(sph, m);
    }
    const stellate = this.make('stellate', sb, 'stellate', { bands: 2, px: 0.9 });

    // collagen: septa across the lobule, collars round the tracts and the central vein (all start collapsed: inflate moves them out)
    const septa = this.make('septa', (() => { const b = new Batch(); for (const s of net.septa) b.tube(s.map((p) => p3(p)), { radius: RAD.tw, radial: 8 }); return b; })(), 'collagen', { bands: 2, px: 0.9 });
    const ring = (cx: number, cy: number, rr: number): V3[] => Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return p3([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); });
    const cuffPre = this.make('cuffs', (() => { const b = new Batch(); for (const t of net.triads) b.tube(ring(t.x, t.y, 0.12), { radius: 0.012 * R, radial: 8 }); return b; })(), 'collagen', { bands: 2, px: 0.9 });
    const cuffPost = this.make('cuffs', (() => { const b = new Batch(); b.tube(ring(0, 0, 0.115), { radius: 0.012 * R, radial: 8 }); return b; })(), 'collagen', { bands: 2, px: 0.9 });

    // the wedge's wash: amber over the sinusoids (cut by the front's radius in uv.x) and the central vein
    const wb = new Batch();
    for (const c of by('s0', 's1', 's2', 'an')) wb.tube(c.pts.map((p) => p3(p)), { radius: c.kind === 'an' ? RAD.an : RAD[c.kind as 's0' | 's1' | 's2'], radial: 7, uvx: (i) => c.rho[i]! });
    const washSin = this.make('wash', wb, 'amber', { bands: 2, px: 0 });
    const washCv = this.make('wash', axial(by('cv'), RAD.cv), 'amber', { bands: 2, px: 0 });
    washSin.setReveal(0); washCv.group.visible = washSin.group.visible = false;

    this.o = { cords, s0, s1, s2, an, inlets, pv, ha, bd, tw, cv, lv, lt, ly, stellate, septa, cuffPre, cuffPost, washSin, washCv };
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
    this.look = look;
    const p = LOBULE_PALETTES[look];
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.dirty = true;
  }
  setPhone(phone: boolean): void { this.phone = phone; for (const o of this.objects) o.setPhone(phone); this.dirty = true; }

  // ---- what the slide and the model say -------------------------------------------------------------------------------------------

  setVisible(v: boolean): void { this.visible = v; this.group.visible = v; this.dirty = true; if (!v) this.washOn = false; }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the engine's frame (lobuleModel). They ease in; nothing jumps. */
  setModel(m: LobuleModel): void {
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
    if (this.lyFade !== lyGoal) { this.lyFade = Math.abs(lyGoal - this.lyFade) <= k ? lyGoal : this.lyFade + Math.sign(lyGoal - this.lyFade) * k; moving = true; }
    // the wash
    if (this.washOn) { const kk = washProgress(now - this.washAt, this.reduce); if (kk !== this.washK) { this.washK = kk; moving = true; } if (kk < 1) moving = true; }
    // chevrons: each marked object fades to its goal
    const pulse = now >= this.pulseUntil ? 0 : Math.min(1, (this.pulseUntil - now) / 1000, (now - this.pulseStart) / FLOW_FADE_MS);
    for (const mk of this.marked) {
      const goal = mk.lymph ? this.lyFade : targetAmount(this.mode, this.lit.has(mk.part), pulse);
      if (mk.amount !== goal) { mk.amount = Math.abs(goal - mk.amount) <= k ? goal : mk.amount + Math.sign(goal - mk.amount) * k; moving = true; }
      if (mk.amount > 0.001) moving = true;   // marks run: keep asking for frames
    }
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
    // zone 3 cells drop out with congestion (they shrink away from the dilated sinusoids)
    infl(o.cords[2]!, -0.06 * c.congU - 0.02 * c.fibSin); infl(o.cords[1]!, -0.01 * c.fibSin); infl(o.cords[0]!, 0);
    // stellate cells activate: they swell
    infl(o.stellate, 0.045 * c.act);
    // collagen comes out of nothing: collapsed at 0, full at 1
    const grow = (obj: CelObject, base: number, amount: number, max: number) => { const on = amount > 0.004; obj.group.visible = on; infl(obj, -base + (base + max) * amount); };
    grow(o.septa, RAD.tw, c.septU, RAD.tw * 1.4);
    grow(o.cuffPre, 0.012 * R, c.fibPre, 0.1);
    grow(o.cuffPost, 0.012 * R, c.fibPost, 0.1);
    // lymph: the whole part shrinks away with its layer; no group is hidden until it has gone
    const f = this.lyFade;
    this.set.get('lymph').group.visible = f > 0.002;
    infl(o.lv, -RAD.lv * (1 - f)); infl(o.lt, -RAD.lt * (1 - f)); infl(o.ly, -RAD.ly * (1 - f) + 0.004 * c.seal);
    // marks: speed from the flow, direction from the course (the Disse's marks run against its course), amount faded
    for (const mk of this.marked) {
      const sp = mk.speed() * mk.dir;
      mk.obj.toon.uniforms.stubSpeed.value = sp;
      mk.obj.setFlow(mk.amount, false);
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

  /** Scene points of the places tags name: the centre, each triad ('triad:0' to 'triad:5'), the zones ('zone:1' periportal, 'zone:2' midzonal, 'zone:3' pericentral). */
  anchor(name: string, out: V3 = [0, 0, 0]): V3 {
    if (name === 'centre') return lobuleToScene(0, 0, slabZ(0, 0) + LOBULE_T / 2, out);
    if (name.startsWith('triad:')) { const t = this.net.triads[Number(name.slice(6))]; if (t) return lobuleToScene(t.x, t.y, slabZ(t.x, t.y) + LOBULE_T / 2, out); }
    if (name.startsWith('zone:')) { const rr = { 1: 0.82, 2: 0.5, 3: 0.2 }[Number(name.slice(5)) as 1 | 2 | 3] ?? 0.5; return lobuleToScene(Math.cos(Math.PI / 6) * rr, Math.sin(Math.PI / 6) * rr, slabZ(0.7, 0.4) + LOBULE_T / 2, out); }
    return lobuleToScene(0, 0, 0, out);
  }

  /** The part whose toon mesh a ray hits first (for tap-to-explain), or null. */
  partAt(hits: readonly { object: unknown }[]): LobulePartName | null {
    for (const h of hits) {
      const o = this.objects.find((x) => x.toonMesh === h.object);
      if (o) for (const name of LOBULE_PARTS) if (this.set.get(name).group.children.includes(o.group)) return name;
    }
    return null;
  }

  /** Compiles the view's programs and uploads its buffers once, ahead of the dive (call at idle after boot, with the scene's renderer): the first open then draws without a hitch. */
  warm(gl: { compile?: (s: Group, c: unknown) => void }, camera: unknown): void {
    const was = this.group.visible;
    this.group.visible = true;
    try { gl.compile?.(this.group, camera); } finally { this.group.visible = was; }
  }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}

/** One zone name for a place, for labels ('Zone 1 · periportal'). */
export const ZONE_NAMES = { 1: 'Zone 1 · periportal', 2: 'Zone 2 · midzonal', 3: 'Zone 3 · pericentral' } as const;
