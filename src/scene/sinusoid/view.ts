// The sinusoid in 3D: a textbook cut along one sinusoid, the 2D app's sinusoid view (sinusoid-view.js, sinusoid-gl.js) rebuilt in flat cut-out layers a hair apart, each
// cel-shaded with its ink line. From the axis out: the lumen (the lens-coloured blood, its chevrons running portal to central), the endothelial lining with its
// sieve plates of fenestrae and its nuclei, the space of Disse with its microvilli, collagen and basement membrane, then a plate of hepatocytes (tidy polygonal cells,
// a round nucleus, a bile canaliculus sealed by tight junctions between neighbours), on both sides; a stellate cell in the upper Disse, a Kupffer cell on the lower
// lining, and the lymph duct leaving at the portal end. Every cell, pore and nucleus stands where the 2D app puts it (layout.ts is its placement, in micrometres).
// The view stands INSIDE the lobule at a sinusoid (lobule/frames.ts); opening it is the end of the camera's dive.
//
// What it is for: the wall and the space of Disse. Plasma filters out of the lumen through the fenestrae into the space of Disse, the lymph so made runs back along
// Disse toward the portal tract, and in cirrhosis the pores close, collagen and a basement membrane build up, the microvilli flatten, the stellate cell activates and
// squeezes the lumen. The rates are the engine's (model.ts sinusoidTargets); every one eases, nothing jumps.
//
// NO lymph chevrons here (owner's call, 5d3b7e86): the lymph is drawn by the filling space of Disse and its duct; the chevrons belong to the lobule's ducts. The blood's
// own chevrons run on the lumen like on any vessel, following the Blood menu.
import { Group } from 'three';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE, FLOW_FADE_MS, PULSE_MS } from '../flow.ts';
import { Batch, type V3 } from '../lobule/batch.ts';
import { type SinusoidTargets, easeToward } from '../lobule/model.ts';
import { PartSet, SINUSOID_PARTS, type SinusoidPartName } from '../lobule/parts.ts';
import { SINUSOID_L } from '../lobule/shots.ts';
import { LOBULE_PALETTES, tone } from '../lobule/tones.ts';
import { InkSet } from '../lobule/ink-set.ts';
import type { InkContext } from '../lobule/ink.ts';
import { washAmount, washProgress } from '../lobule/wash.ts';
import { rng } from '../lobule/geometry.ts';
import { SEED, SLOT, UM, canaliculusAt, cellOf, edgeAt, h1, nucAt, poreAt, poreOpenness } from './layout.ts';
import { ellipse, polygon, rounded, rrect, slab, taper } from './flat.ts';

/** Local units per micrometre, and the stretch drawn: four hepatocytes of the 2D plate (97 µm), the portal end at the left. */
export const SPAN_UM = 97.4;
export const U = SINUSOID_L / SPAN_UM;
const xl = (um: number): number => (um - SPAN_UM / 2) * U;
const yl = (um: number): number => um * U;
const FACE = UM.lum + UM.endo + UM.disse;   // the plates' face on Disse, µm from the axis
const R0 = UM.lum * U;                       // the lumen's half width, healthy
const MARK_PITCH = 0.55;
/** The stretch's ends in local x. */
const X0 = xl(0), X1 = xl(SPAN_UM);
/** The lumen's colour at its two ends: the lens's value toward the portal end (left) and toward the central end (right), as weights along the lobule's sinusoids. */
const W_PORTAL = 0.8, W_CENTRAL = 0.2;

export interface SinusoidViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean }

interface Cur { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number }
const REST: Cur = { por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 };

const at = (x: number, y: number, z = 0): V3 => [x, y, z];
const SIDES = [1, -1] as const;
/** z of each layer's back face and its thickness: plates, space of Disse, the strokes in it, the lining, what sits on the lining, the cells that reach over it. */
const Z = { plate: -0.02, disse: 0, stroke: 0.02, lining: 0.02, onLining: 0.05, nucleus: 0.015, cell: 0.04 } as const;
const THIN = 0.03;

export class SinusoidView {
  readonly set = new PartSet<SinusoidPartName>(SINUSOID_PARTS);
  readonly group: Group = this.set.group;
  readonly objects: CelObject[] = [];
  private cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private mode: FlowMarkMode;
  private lit = new Set<SinusoidPartName>(['lumen']);   // the sinusoid view is about the sinusoid: its blood carries marks when "key chevrons only"
  private blood = { chevrons: true, key: false };
  private marks = 0;
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
  private readonly inks = new InkSet();
  /** The named pieces (for tests and the state mapping). */
  get parts(): SinusoidView['o'] { return this.o; }
  private o!: {
    lumen: CelObject; kupffer: CelObject; kNuc: CelObject; lining: CelObject; pores: CelObject[]; poreTh: number[]; endoNuc: CelObject; bm: CelObject;
    disse: CelObject; villi: CelObject[]; collagen: CelObject; plates: CelObject; nuclei: CelObject; canal: CelObject; junctions: CelObject;
    stellate: CelObject; arms: CelObject; sNuc: CelObject; duct: CelObject; wash: CelObject;
  };

  private readonly shared: CelShared;
  constructor(shared: CelShared, opts: SinusoidViewOptions = {}) {
    this.shared = shared;
    this.look = opts.look ?? 'light';
    this.phone = !!opts.phone;
    this.mode = opts.flowMode ?? DEFAULT_FLOW_MODE;
    this.reduce = !!opts.reduceMotion;
    this.build();
    this.applyLook(this.look);
    this.group.visible = false;
  }

  private make(part: SinusoidPartName, b: Batch, toneKey: Parameters<typeof tone>[0], opts: { bands?: 2 | 3; px: number; chevrons?: boolean; ink?: boolean }): CelObject {
    if (opts.ink) b.withInk();
    const o = new CelObject(b.build(), {
      tone: tone(toneKey), bands: opts.bands ?? 2, spec: 0, px: opts.px,
      vessel: opts.chevrons ? { index: 0, len: 0.45, stubSpeed: 0, radius: 0, baseD: 1 } : undefined,
    }, this.shared);
    this.objects.push(o);
    this.set.get(part).group.add(o.group);
    if (opts.ink) { o.setInkAmount(1); this.inks.add(o.toonMesh.geometry, 'sin', b.tubes, [[W_PORTAL, W_CENTRAL]]); }
    return o;
  }

  private build(): void {
    const r = rng(11);
    const lumenXs = Array.from({ length: 24 }, (_, i) => X0 + ((X1 - X0) * i) / 23);

    // the lumen: the blood's channel, portal end to central end, a flat band with a rounded face; the lens's colour runs along it and chevrons run on it
    const lb = new Batch();
    lb.tube(lumenXs.map((x) => at(x, 0)), { radius: R0, radial: 14, squash: 0.34, uvx: (_i, arc) => arc / MARK_PITCH });
    const lumen = this.make('lumen', lb, 'sin1', { px: 1.2, chevrons: true, ink: true });

    // the Kupffer cell: a macrophage anchored on the lower lining, a foot spread over it, reaching into the stream; it holds a red cell it has taken up
    const kb = new Batch(), kx = xl(62), ky = -yl(UM.lum) + 0.05;
    slab(kb, polygon(rounded([[-0.2, -0.04], [-0.17, 0.13], [0.0, 0.2], [0.17, 0.12], [0.22, -0.04]], 3)), THIN, kx, ky, 0.075);
    slab(kb, taper([[-0.55, -0.045], [-0.25, -0.035], [0.25, -0.035], [0.58, -0.05]], 0.03, 0.012), THIN, kx, ky, 0.075);
    slab(kb, taper([[0.12, 0.1], [0.26, 0.2], [0.34, 0.3]], 0.07, 0.025), THIN, kx, ky, 0.075);
    const kupffer = this.make('kupffer', kb, 'kupffer', { px: 0.9 });
    const knb = new Batch();
    slab(knb, ellipse(0.075, 0.045), 0.012, kx - 0.06, ky + 0.115, 0.108, 0.3);
    slab(knb, ellipse(0.04, 0.04), 0.012, kx + 0.07, ky + 0.07, 0.108);
    const kNuc = this.make('kupffer', knb, 'nucleus', { px: 0.6 });

    // the lining: an endothelial sheet either side of the lumen, with its sieve plates of fenestrae (five evenly spaced pores, shut from the ends in as the lining
    // defenestrates) and its flattened nuclei
    const liningB = new Batch();
    for (const s of SIDES) slab(liningB, rrect(X1 - X0, yl(UM.endo), 0.02), THIN + 0.01, (X0 + X1) / 2, s * yl(UM.lum + UM.endo / 2), Z.lining);
    const lining = this.make('wall', liningB, 'endo', { px: 0.8 });
    const bands: Batch[] = [new Batch(), new Batch(), new Batch()], poreTh = [0.3, 0.55, 0.9];
    for (const [si, s] of SIDES.entries()) {
      const sd = si === 0 ? SEED.poreUp : SEED.poreDn;
      for (let j = 0; j < SPAN_UM / SLOT; j++) {
        const p = poreAt(j, sd);
        if (!p) continue;
        slab(bands[p.th < poreTh[0]! ? 0 : p.th < poreTh[1]! ? 1 : 2]!, ellipse(0.03, 0.026, 10), 0.012, xl(p.x), s * yl(UM.lum + UM.endo / 2), Z.onLining + 0.015);
      }
    }
    const pores = bands.map((b) => this.make('wall', b, 'fen', { px: 0 }));
    const enb = new Batch();
    for (const [si, s] of SIDES.entries()) for (let n = -1; n < 3; n++) {
      const x = nucAt(n, si === 0 ? SEED.nucUp : SEED.nucDn);
      if (x < 0 || x > SPAN_UM) continue;
      slab(enb, ellipse(0.19, 0.07, 16), THIN, xl(x), s * (yl(UM.lum) + 0.045), Z.onLining);
    }
    const endoNuc = this.make('wall', enb, 'nucleus', { px: 0.8 });
    const bmb = new Batch();
    for (const s of SIDES) slab(bmb, rrect(X1 - X0, 0.022, 0.01), 0.012, (X0 + X1) / 2, s * (yl(UM.lum + UM.endo) + 0.014), Z.lining + 0.006);
    const bm = this.make('wall', bmb, 'collagen', { px: 0.7 });

    // the space of Disse above and below, its microvilli (fine strokes from the plates' face, flattened as collagen fills it), its collagen fibres, and the lymph duct it
    // drains into at the portal end (no marks)
    const db = new Batch();
    for (const s of SIDES) slab(db, rrect(X1 - X0, yl(UM.disse), 0.03), THIN, (X0 + X1) / 2, s * yl(UM.lum + UM.endo + UM.disse / 2), Z.disse);
    const disse = this.make('disse', db, 'disse', { px: 0.9 });
    const villi: CelObject[] = [];
    for (const [si, s] of SIDES.entries()) {
      const vb = new Batch();
      for (let i = 0; i < SPAN_UM / 0.8; i++) {
        const hx = (i + 0.5) * 0.8 + 0.22 * (h1(i, 61 + si) - 0.5), len = yl(UM.disse) * 0.5 * (0.55 + 0.45 * h1(i, 63 + si)) * 2;
        slab(vb, taper([[0, 0], [0.012 * Math.sin(i), -s * len * 0.5], [0.02 * Math.sin(i), -s * len]], 0.016, 0.01), 0.014, xl(hx), 0, Z.stroke);
      }
      const o = this.make('disse', vb, 'cord3', { px: 0 });
      o.group.position.y = s * yl(FACE);   // (the strokes stand on the plate's face and reach toward the lining: scaling the group by `mv` flattens them about it)
      villi.push(o);
    }
    const cb = new Batch();
    for (let i = 0; i < 70; i++) {
      const s = r() < 0.5 ? -1 : 1, x = X0 + 0.15 + r() * (X1 - X0 - 0.3), y = s * (yl(UM.lum + UM.endo) + 0.03 + r() * (yl(UM.disse) - 0.06));
      slab(cb, rrect(0.2 + r() * 0.2, 0.014, 0.007), 0.014, x, y, Z.stroke + 0.005, (r() - 0.5) * 0.5);
    }
    const collagen = this.make('disse', cb, 'collagen', { px: 0.6 });
    const ub = new Batch();
    ub.tube([at(X0 + 0.1, -yl(UM.lum + UM.endo + UM.disse / 2), 0.02), at(X0 - 0.4, -yl(UM.lum + UM.endo + UM.disse / 2) - 0.07, 0.02), at(X0 - 0.95, -yl(UM.lum + UM.endo + UM.disse / 2) - 0.2, 0.02)], { radius: 0.09, radial: 10, squash: 0.35, capped: true });
    const duct = this.make('lymph-duct', ub, 'lymph', { px: 1.0 });

    // the hepatocyte plates: tidy polygonal cells (each border a line with one gentle bend, so neighbours fit like tiles), a round nucleus (two in one cell in eight), and
    // between neighbours at mid-plate the bile canaliculus cut across, with the tight junctions that seal it
    const pb = new Batch(), nb = new Batch(), cnb = new Batch(), jb = new Batch();
    for (const [si, s] of SIDES.entries()) {
      const sd = si === 0 ? SEED.plateUp : SEED.plateDn;
      const Y = (v: number) => s * yl(FACE + v);
      for (let j = 0; j < 4; j++) {
        const c = cellOf(j, sd), vm = UM.hep * (0.3 + 0.4 * h1(j, sd + 9)), vm2 = UM.hep * (0.3 + 0.4 * h1(j + 1, sd + 9));
        const raw: [number, number][] = [
          [xl(edgeAt(j, sd, 0)), Y(0)], [xl(edgeAt(j, sd, vm)), Y(vm)], [xl(edgeAt(j, sd, UM.hep)), Y(UM.hep)],
          [xl(edgeAt(j + 1, sd, UM.hep)), Y(UM.hep)], [xl(edgeAt(j + 1, sd, vm2)), Y(vm2)], [xl(edgeAt(j + 1, sd, 0)), Y(0)],
        ];
        const cx = raw.reduce((a, p) => a + p[0], 0) / raw.length, cy = raw.reduce((a, p) => a + p[1], 0) / raw.length;
        const inset = raw.map(([x, y]): [number, number] => [cx + (x - cx) * 0.975, cy + (y - cy) * 0.985]);
        slab(pb, polygon(rounded(inset, 2)), 0.04, 0, 0, Z.plate);
        for (let k = 0; k < (c.bi ? 2 : 1); k++) {
          const uu = c.bi ? c.nu + (k === 0 ? -0.15 : 0.15) : c.nu, vv = c.nv + (k === 1 ? 0.04 : 0), rr = (c.bi ? c.nr * 0.82 : c.nr) * U;
          const nx = xl(c.x0 + 2 + (c.x1 - 2 - (c.x0 + 2)) * uu), ny = Y(2 + (UM.hep - 4) * vv);
          slab(nb, ellipse(rr, rr, 18), 0.015, nx, ny, Z.nucleus + 0.03);
        }
      }
      for (let j = 1; j < 5; j++) {
        const x = canaliculusAt(j, sd);
        if (x < 0 || x > SPAN_UM) continue;
        const cx = xl(x), cy = Y(UM.hep / 2);
        slab(cnb, ellipse(0.078, 0.078, 14), 0.018, cx, cy, Z.cell + 0.005);
        for (const dv of [-1, 1]) slab(jb, rrect(0.16, 0.022, 0.011), 0.014, cx, cy + dv * 0.15, Z.cell + 0.005);
      }
    }
    const plates = this.make('hepatocytes', pb, 'cord2', { bands: 2, px: 0.9 });
    const nuclei = this.make('hepatocytes', nb, 'nucleus', { px: 0.8 });
    const canal = this.make('canaliculi', cnb, 'bileLight', { px: 0.9 });
    const junctions = this.make('canaliculi', jb, 'bile', { px: 0 });

    // the stellate cell in the upper Disse: a plump body lying along the sinusoid, its processes curving down onto the lining and along it, its nucleus; activation swells it
    const sb = new Batch(), sx = xl(30), sy = yl(UM.lum + UM.endo + UM.disse * 0.55);
    slab(sb, ellipse(0.3, 0.092, 20), 0.03, sx, sy, 0.05);
    const stellate = this.make('stellate', sb, 'stellate', { px: 1.0 });
    const ab = new Batch();
    slab(ab, taper([[-0.22, 0], [-0.34, -0.06], [-0.46, -0.1], [-0.66, -0.11]], 0.06, 0.012), 0.03, sx, sy, 0.05);
    slab(ab, taper([[0.2, 0], [0.32, -0.05], [0.4, -0.09], [0.58, -0.1]], 0.06, 0.012), 0.03, sx, sy, 0.05);
    slab(ab, taper([[-0.05, 0.08], [-0.02, 0.18], [0.02, 0.26]], 0.04, 0.01), 0.03, sx, sy, 0.05);
    const arms = this.make('stellate', ab, 'stellate', { px: 0.8 });
    const snb = new Batch();
    slab(snb, ellipse(0.1, 0.058, 16), 0.012, sx - 0.02, sy, 0.083);
    const sNuc = this.make('stellate', snb, 'nucleus', { px: 0.6 });

    // the wedge's amber along the lumen from its central end (uv.x = 0 there) back toward the portal end
    const wb = new Batch();
    wb.tube([...lumenXs].reverse().map((x) => at(x, 0)), { radius: R0, radial: 14, squash: 0.34, uvx: (_i, arc) => arc / SINUSOID_L });
    const wash = this.make('wash', wb, 'amber', { px: 0 });
    wash.setReveal(0); wash.group.visible = false;

    this.o = { lumen, kupffer, kNuc, lining, pores, poreTh, endoNuc, bm, disse, villi, collagen, plates, nuclei, canal, junctions, stellate, arms, sNuc, duct, wash };
    for (const name of SINUSOID_PARTS) {
      const objs = this.objects.filter((o) => this.set.get(name).group.children.includes(o.group));
      this.set.get(name).driver = { objects: objs, palette: () => {}, phone: () => {}, step: () => false, dispose: () => { for (const o of objs) o.dispose(); } };
    }
    this.apply();
  }

  // ---- looks, device, state ------------------------------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; }
  get palette(): Palette { return LOBULE_PALETTES[this.look]; }
  applyLook(look: LookId): void { this.look = look; const p = LOBULE_PALETTES[look]; for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); } this.dirty = true; }
  setPhone(phone: boolean): void { this.phone = phone; for (const o of this.objects) o.setPhone(phone); this.dirty = true; }

  setVisible(v: boolean): void { this.visible = v; this.group.visible = v; this.dirty = true; if (!v) this.washOn = false; else this.inks.freshen(); }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the model (sinusoidTargets of the lobule's model). They ease in. */
  setTargets(t: SinusoidTargets): void { Object.assign(this.goal, t); this.dirty = true; }
  snapTargets(t: SinusoidTargets): void { this.setTargets(t); Object.assign(this.cur, this.goal); }
  /** The lens, look, model and reference the lumen's colour comes from (the 2D sinusoid is coloured as the lobule's vessels are). */
  setInk(ctx: InkContext): void { this.inks.set(ctx); this.dirty = true; }

  setLit(parts: Iterable<SinusoidPartName>): void { this.lit = new Set(parts); this.dirty = true; }
  setFlowMode(mode: FlowMarkMode): void { this.mode = mode; this.dirty = true; }
  /** The Blood menu: chevrons on or off, and key routes only. */
  setBlood(b: { chevrons: boolean; keyChevrons: boolean }): void { this.blood = { chevrons: b.chevrons, key: b.keyChevrons }; this.dirty = true; }
  pulse(nowMs: number): void { this.pulseStart = nowMs; this.pulseUntil = nowMs + PULSE_MS; this.dirty = true; }
  /** A dive on into the sinusoid carries the same wash along the one sinusoid, from its central end to its portal end (the 2D sinusoid-wash timing). */
  startWash(landedAtMs: number): void { this.washOn = true; this.washAt = landedAtMs; this.dirty = true; }
  stopWash(): void { this.washOn = false; this.washK = 0; this.dirty = true; }
  get washProgress(): number { return this.washK; }
  swap(name: SinusoidPartName, node: Parameters<PartSet<SinusoidPartName>['swap']>[1], keepPlaceholder = false): void { this.set.swap(name, node, keepPlaceholder); this.dirty = true; }

  update(now: number): boolean {
    if (!this.visible) { this.lastNow = -1; return false; }
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    let moving = this.dirty;
    this.dirty = false;
    if (easeToward(this.cur as unknown as Record<string, number>, this.goal as unknown as Record<string, number>, this.reduce ? 1e6 : dt)) moving = true;
    if (this.inks.step(dt, this.reduce)) moving = true;
    if (this.washOn) { const k = washProgress(now - this.washAt, this.reduce); if (k !== this.washK) { this.washK = k; moving = true; } if (k < 1) moving = true; }
    const goal = this.blood.chevrons && (!this.blood.key || this.lit.has('lumen')) ? 1 : 0, k = this.reduce ? 1 : Math.min(1, dt / FLOW_FADE_MS);
    if (this.marks !== goal) { this.marks = Math.abs(goal - this.marks) <= k ? goal : this.marks + Math.sign(goal - this.marks) * k; moving = true; }
    if (this.marks > 0.001) moving = true;
    this.apply();
    return moving;
  }

  private apply(): void {
    const c = this.cur, o = this.o;
    const infl = (obj: CelObject, v: number) => { obj.toon.uniforms.inflate.value = v; };
    const lumen = R0 * (c.lum - 1) - R0 * c.pinch * 0.5;
    infl(o.lumen, lumen);
    // the blood's marks, at the lobule's first-generation sinusoid speed against healthy (a stopped or reversed sinusoid carries none, as in 2D)
    o.lumen.toon.uniforms.stubSpeed.value = (1.4 / 15) * 15 * Math.sqrt(Math.max(0, c.v));
    o.lumen.setFlow(this.marks, false);
    // pores close: each sieve plate's dots shrink away at its own threshold, from the ends in
    o.pores.forEach((p, i) => infl(p, -0.03 * (1 - poreOpenness(o.poreTh[i] ?? 0.9, c.por))));
    // basement membrane and collagen come out of nothing; microvilli flatten; the space of Disse swells with the filtration (and stays thin when nothing filters)
    const grow = (obj: CelObject, base: number, a: number, max: number) => { obj.group.visible = a > 0.004; infl(obj, -base + (base + max) * a); };
    grow(o.bm, 0.011, c.bm, 0.012);
    grow(o.collagen, 0.007, c.col, 0.012);
    for (const v of o.villi) v.group.scale.y = Math.max(0.05, c.mv);
    infl(o.disse, 0.012 * (Math.min(4, c.filt) - 1) - 0.02 * c.col);
    // the stellate cell activates: it swells, its processes lengthen
    infl(o.stellate, 0.03 * c.act); infl(o.arms, 0.012 * c.act); infl(o.sNuc, 0.01 * c.act);
    // the wedge's amber along the lumen, from its central end
    const k = this.washK, show = this.washOn && k > 0;
    o.wash.group.visible = show;
    if (show) { o.wash.setReveal(k); infl(o.wash, lumen - 0.02 + 0.04 * (washAmount(k) / 0.85)); }
  }

  /** Scene points (this view's own units) of the places tags name (the 2D app's captions): 'in' (blood arrives, portal end), 'out' (to the central vein), 'lumen', 'fen', 'disse', 'hep', 'hsc', 'kup', 'lymph', 'canaliculus'. */
  anchor(name: string, out: V3 = [0, 0, 0]): V3 {
    const P: Record<string, V3> = {
      in: at(X0, 0), out: at(X1, 0), lumen: at(xl(48), 0, R0 * 0.34), fen: at(xl(5.5), yl(UM.lum + UM.endo / 2), 0.07), disse: at(xl(70), yl(UM.lum + UM.endo + UM.disse / 2), 0.04),
      hep: at(xl(37), yl(FACE + UM.hep * 0.7), 0.05), hsc: at(xl(30), yl(UM.lum + UM.endo + UM.disse * 0.55), 0.09), kup: at(xl(62), -yl(UM.lum) + 0.2, 0.1), lymph: at(X0 - 0.6, -yl(UM.lum + UM.endo + UM.disse / 2) - 0.12, 0.1),
      canaliculus: at(xl(canaliculusAt(2, SEED.plateUp)), yl(FACE + UM.hep / 2), 0.06),
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

  dispose(): void { for (const o of this.objects) o.dispose(); }
}
