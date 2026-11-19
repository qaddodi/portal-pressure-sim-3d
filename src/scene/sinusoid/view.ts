// The sinusoid in 3D: one sinusoid cut along its length, the wall up close and what crosses it (the 2D app's sinusoid view, sinusoid-view.js). Blood
// runs from the portal end (left) to the central vein (right). Built once at start-up; opening the view is a camera move.
//
// What it is for: the wall and the space of Disse. Plasma filters out of the lumen through the fenestrae (the sieve plates) into the space of Disse,
// the lymph so made runs back along Disse toward the portal tract, and in cirrhosis the pores close, collagen and a basement membrane build up, the
// stellate cell activates and squeezes the lumen. The rates are the engine's (model.ts sinusoidTargets); every one eases, nothing jumps.
//
// NO lymph chevrons here (owner's call, 5d3b7e86): the lymph is drawn by the filling space of Disse and its duct; the chevrons belong to the lobule's
// ducts. The blood's own chevrons run on the lumen like on any vessel the slide names.
import { Group, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { type FlowMarkMode, DEFAULT_FLOW_MODE, FLOW_FADE_MS, PULSE_MS, markSpeed, targetAmount } from '../flow.ts';
import { Batch, type V3 } from '../lobule/batch.ts';
import { type SinusoidTargets, easeToward } from '../lobule/model.ts';
import { PartSet, SINUSOID_PARTS, type SinusoidPartName } from '../lobule/parts.ts';
import { SINUSOID_L, SINUSOID_ORIGIN } from '../lobule/shots.ts';
import { LOBULE_PALETTES, tone } from '../lobule/tones.ts';
import { rng } from '../lobule/geometry.ts';
import { washAmount, washProgress } from '../lobule/wash.ts';

const [OX, OY, OZ] = SINUSOID_ORIGIN;
const L = SINUSOID_L;
const R0 = 0.34;   // the lumen's radius, healthy
const MARK_PITCH = R0 * 5;

export interface SinusoidViewOptions { look?: LookId; phone?: boolean; flowMode?: FlowMarkMode; reduceMotion?: boolean }

interface Cur { por: number; col: number; bm: number; mv: number; act: number; lum: number; pinch: number; v: number; filt: number; prot: number }
const REST: Cur = { por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 };

const at = (x: number, y: number, z = 0): V3 => [OX + x, OY + y, OZ + z];

export class SinusoidView {
  readonly set = new PartSet<SinusoidPartName>(SINUSOID_PARTS);
  readonly group: Group = this.set.group;
  readonly objects: CelObject[] = [];
  private cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private mode: FlowMarkMode;
  private lit = new Set<SinusoidPartName>(['lumen']);   // the sinusoid view is about the sinusoid: its blood carries marks (option A)
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
  private o!: {
    lumen: CelObject; kupffer: CelObject; fen: CelObject; bm: CelObject; disse: CelObject; collagen: CelObject; plates: CelObject; nuclei: CelObject;
    stellate: CelObject; arms: CelObject; duct: CelObject; wash: CelObject;
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

  private make(part: SinusoidPartName, b: Batch, toneKey: Parameters<typeof tone>[0], opts: { bands: 2 | 3; px: number; chevrons?: boolean }): CelObject {
    const o = new CelObject(b.build(), {
      tone: tone(toneKey), bands: opts.bands, spec: 0, px: opts.px,
      vessel: opts.chevrons ? { index: 0, len: 0.45, stubSpeed: 0, radius: 0, baseD: 1 } : undefined,
    }, this.shared);
    this.objects.push(o);
    this.set.get(part).group.add(o.group);
    return o;
  }

  private build(): void {
    const r = rng(11);
    const xs = (n: number, from = -L / 2, to = L / 2) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
    const sph = new SphereGeometry(1, 10, 8);
    const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), zAxis = new Vector3(0, 0, 1);
    const blob = (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, a = 0) => {
      q.setFromAxisAngle(zAxis, a); pos.set(OX + x, OY + y, OZ + z); sc.set(sx, sy, sz); m.compose(pos, q, sc); b.shape(sph, m);
    };

    // the lumen: the blood's channel, portal end to central end; chevrons run on it
    const lb = new Batch();
    lb.tube(xs(24).map((x) => at(x, 0)), { radius: R0, radial: 14, uvx: (_i, arc) => arc / MARK_PITCH });
    const lumen = this.make('lumen', lb, 'sin1', { bands: 2, px: 1.4, chevrons: true });
    // the Kupffer cell: a macrophage sitting in the lumen on the wall
    const kb = new Batch(); blob(kb, 1.0, 0.27, 0.12, 0.2, 0.17, 0.17, 0.3);
    const kupffer = this.make('kupffer', kb, 'kupffer', { bands: 2, px: 1.0 });

    // the wall: sieve plates of fenestrae on the side facing us, and the basement membrane under the endothelium (a thin line along each edge)
    const fb = new Batch();
    for (let plate = 0; plate < 14; plate++) {
      const cx = -L / 2 + 0.3 + ((plate + r() * 0.6) / 14) * (L - 0.6), cth = (r() - 0.5) * 1.1;
      for (let k = 0; k < 9; k++) {
        const x = cx + (r() - 0.5) * 0.34, th = cth + (r() - 0.5) * 0.5;
        blob(fb, x, Math.sin(th) * R0 * 0.99, Math.cos(th) * R0 * 0.99, 0.028, 0.028, 0.012, 0);
      }
    }
    const fen = this.make('wall', fb, 'fen', { bands: 2, px: 0 });
    const bb = new Batch();
    for (const s of [-1, 1]) bb.tube(xs(12).map((x) => at(x, s * (R0 + 0.01), -0.02)), { radius: 0.02, radial: 6 });
    const bm = this.make('wall', bb, 'collagen', { bands: 2, px: 0.8 });

    // the space of Disse above and below the lumen (the plasma's way out), its collagen, the lymph duct it drains into at the portal end (no marks)
    const db = new Batch();
    for (const s of [-1, 1]) db.tube(xs(16).map((x) => at(x, s * 0.56, -0.05)), { radius: 0.14, radial: 10 });
    const disse = this.make('disse', db, 'disse', { bands: 2, px: 1.0 });
    const cb = new Batch();
    for (let i = 0; i < 46; i++) { const s = r() < 0.5 ? -1 : 1; blob(cb, -L / 2 + 0.2 + r() * (L - 0.4), s * (0.5 + (r() - 0.5) * 0.12), 0.1 + r() * 0.06, 0.2, 0.026, 0.026, (r() - 0.5) * 1.2); }
    const collagen = this.make('disse', cb, 'collagen', { bands: 2, px: 0.7 });
    const ub = new Batch();
    ub.tube([at(-L / 2, -0.56, -0.05), at(-L / 2 - 0.5, -0.64, -0.05), at(-L / 2 - 1.0, -0.74, -0.05)], { radius: 0.15, radial: 10, capped: true });
    const duct = this.make('lymph-duct', ub, 'lymph', { bands: 2, px: 1.0 });

    // hepatocytes: two plates, four cells each, with their nuclei
    const pb = new Batch(), nb = new Batch();
    for (const s of [-1, 1]) for (const x of [-2.2, -0.75, 0.75, 2.2]) {
      blob(pb, x, s * 1.5, -0.1, 0.7, 0.58, 0.62);
      blob(nb, x + (r() - 0.5) * 0.2, s * 1.5, 0.38, 0.2, 0.2, 0.12);
    }
    const plates = this.make('hepatocytes', pb, 'cord2', { bands: 3, px: 1.6 });
    const nuclei = this.make('hepatocytes', nb, 'cord3', { bands: 2, px: 0.9 });

    // the stellate cell in the lower space of Disse, its arms reaching round the lumen; activation swells it and squeezes the lumen
    const sb = new Batch(); blob(sb, -1.3, -0.5, 0.06, 0.15, 0.13, 0.13);
    const stellate = this.make('stellate', sb, 'stellate', { bands: 2, px: 1.0 });
    const ab = new Batch();
    ab.tube([at(-1.3, -0.5, 0.06), at(-1.15, -0.2, 0.3), at(-1.0, 0.1, 0.3)], { radius: 0.035, radial: 6 });
    ab.tube([at(-1.3, -0.5, 0.06), at(-1.55, -0.2, 0.3), at(-1.7, 0.15, 0.25)], { radius: 0.035, radial: 6 });
    ab.tube([at(-1.3, -0.5, 0.06), at(-0.9, -0.55, 0.1), at(-0.5, -0.5, 0.08)], { radius: 0.035, radial: 6 });
    const arms = this.make('stellate', ab, 'stellate', { bands: 2, px: 0.8 });

    // the wedge's wash: amber along the lumen from its central end (uv.x = 0 there) back toward the portal end
    const wb = new Batch();
    wb.tube(xs(24).reverse().map((x) => at(x, 0)), { radius: R0, radial: 14, uvx: (_i, arc) => arc / L });
    const wash = this.make('wash', wb, 'amber', { bands: 2, px: 0 });
    wash.setReveal(0); wash.group.visible = false;

    this.o = { lumen, kupffer, fen, bm, disse, collagen, plates, nuclei, stellate, arms, duct, wash };
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

  setVisible(v: boolean): void { this.visible = v; this.group.visible = v; this.dirty = true; if (!v) this.washOn = false; }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the model (sinusoidTargets of the lobule's model). They ease in. */
  setTargets(t: SinusoidTargets): void { Object.assign(this.goal, t); this.dirty = true; }
  snapTargets(t: SinusoidTargets): void { this.setTargets(t); Object.assign(this.cur, this.goal); }

  setLit(parts: Iterable<SinusoidPartName>): void { this.lit = new Set(parts); this.dirty = true; }
  setFlowMode(mode: FlowMarkMode): void { this.mode = mode; this.dirty = true; }
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
    if (this.washOn) { const k = washProgress(now - this.washAt, this.reduce); if (k !== this.washK) { this.washK = k; moving = true; } if (k < 1) moving = true; }
    const pulse = now >= this.pulseUntil ? 0 : Math.min(1, (this.pulseUntil - now) / 1000, (now - this.pulseStart) / FLOW_FADE_MS);
    const goal = targetAmount(this.mode, this.lit.has('lumen'), pulse), k = this.reduce ? 1 : Math.min(1, dt / FLOW_FADE_MS);
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
    // the blood's marks: speed against healthy, signed (negative when the flow reverses)
    o.lumen.toon.uniforms.stubSpeed.value = markSpeed(Math.max(-3, Math.min(3, c.v)) * 8);
    o.lumen.setFlow(this.marks, false);
    // pores close: the sieve plates' dots shrink away
    infl(o.fen, -0.028 * (1 - c.por));
    // basement membrane and collagen come out of nothing; the space of Disse swells with the filtration (and stays thin when nothing filters)
    const grow = (obj: CelObject, base: number, a: number, max: number) => { obj.group.visible = a > 0.004; infl(obj, -base + (base + max) * a); };
    grow(o.bm, 0.02, c.bm, 0.03);
    grow(o.collagen, 0.026, c.col, 0.03);
    infl(o.disse, 0.035 * (Math.min(4, c.filt) - 1) - 0.06 * c.col);
    // kupffer cell and microvilli: the cell stays; flattened microvilli are the fen plates' own flatten (mv) in the finished art
    infl(o.kupffer, 0);
    // the stellate cell activates
    infl(o.stellate, 0.05 * c.act); infl(o.arms, 0.02 * c.act);
    // the wedge's amber along the lumen, from its central end
    const k = this.washK, show = this.washOn && k > 0;
    o.wash.group.visible = show;
    if (show) { o.wash.setReveal(k); infl(o.wash, lumen - 0.04 + 0.07 * (washAmount(k) / 0.85)); }
  }

  /** Scene points of the places tags name (the 2D app's captions): 'in' (blood arrives, portal end), 'out' (to the central vein), 'lumen', 'fen', 'disse', 'hep', 'hsc', 'kup', 'lymph'. */
  anchor(name: string, out: V3 = [0, 0, 0]): V3 {
    const P: Record<string, V3> = {
      in: at(-L / 2, 0), out: at(L / 2, 0), lumen: at(0.2, 0, R0), fen: at(-0.4, R0 * 0.55, R0 * 0.85), disse: at(0.9, -0.56, 0.1),
      hep: at(-0.75, 1.5, 0.5), hsc: at(-1.3, -0.5, 0.2), kup: at(1.0, 0.3, 0.3), lymph: at(-L / 2 - 0.6, -0.68, 0.15),
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
