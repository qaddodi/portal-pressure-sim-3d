// The disease layer: everything the patient's illness changes on the figure besides the vessels' own width and colour (B3), driven from one engine frame and the patient's
// parameters, on the one clock. Organs (the liver's shape and dusk, the spleen's size and ghost, the grey of a lens), the ascites pool, clots, the plexuses and the cavernoma,
// the bleed, the dye. `feed` takes the newest model state (cheap, call it whenever a frame arrives); `update(now)` eases and returns true while something moves.
//   const d = new DiseaseLayer(shared, vesselObjects); scene.add(d.group); d.applyLook(look, palette);
//   d.feed(frame, params, healthyP, { instant, presence, recruit });  …  in the clock's render phase: if (d.update(now)) clock.invalidate('disease');
import { Group } from 'three';
import type { CelObject, CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { OrganLayer } from '../organs/layer.ts';
import { AscitesLayer } from './ascites.ts';
import { BleedLayer } from './bleed.ts';
import { ClotLayer } from './clots.ts';
import { DyeLayer } from './dye.ts';
import { Eased, FluidFollow } from './follow.ts';
import { StrandLayer } from './strands.ts';
import { type BodyTargets, type DiseaseFrame, type DiseaseParams, bodyTargets } from './targets.ts';

export type { BodyTargets, DiseaseFrame, DiseaseParams };
export { bodyTargets } from './targets.ts';

type FrameData = DiseaseFrame & { Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> };
export interface FeedContext {
  /** a new patient or the first frame: nothing eases across it */
  instant?: boolean;
  /** a vessel's presence 0 or 1 (the vessels' own tracks) */
  presence: (id: string) => number;
  /** a collateral's recruitment 0..1 */
  recruit: (id: string, f: { D: ArrayLike<number> }) => number;
}

export class DiseaseLayer {
  readonly group = new Group();
  readonly organs: OrganLayer;
  readonly clots: ClotLayer;
  readonly strands: StrandLayer;
  readonly ascites = new AscitesLayer();
  readonly bleed: BleedLayer;
  readonly dye: DyeLayer;
  private fluid = new FluidFollow();
  private bandsShown = new Eased(0, 0.2, 0.01);
  private frame: FrameData | null = null;
  private ctx: FeedContext | null = null;
  private targets: BodyTargets | null = null;
  private instant = true;
  private lastNow = -1;
  private moving = true;
  /** the lens greys the organs; set by the scene when the colour lens changes */
  setLensGrey(on: boolean): void { this.organs.setLensGrey(on); this.moving = true; }

  constructor(shared: CelShared, vessels: readonly CelObject[]) {
    this.organs = new OrganLayer(shared);   // (built when the organs file is in: OrganLayer.build)
    this.clots = new ClotLayer(shared);
    this.strands = new StrandLayer(shared);
    this.bleed = new BleedLayer(shared);
    this.dye = new DyeLayer(vessels.filter((v) => v.edge).map((v) => ({ id: v.edge!.id, geometry: v.toonMesh.geometry })));
    this.group.add(this.organs.group, this.ascites.group, this.clots.group, this.strands.group, this.bleed.group, this.dye.group);
  }

  applyLook(look: LookId, p: Palette): void {
    this.organs.applyLook(p); this.clots.applyLook(look, p); this.strands.applyLook(p); this.bleed.applyLook(look, p); this.moving = true;
  }
  setPhone(phone: boolean): void { this.organs.setPhone(phone); this.clots.setPhone(phone); this.strands.setPhone(phone); this.moving = true; }

  /** The newest model state. `params` are the patient's parameters (null until the first preset loads); `healthyP` the healthy node pressures. */
  feed(f: FrameData, params: DiseaseParams | null, healthyP: ArrayLike<number> | null, ctx: FeedContext, jump = false): void {
    this.frame = f; this.ctx = ctx;
    this.targets = bodyTargets(f, params ?? {}, healthyP);
    if (jump || ctx.instant) this.instant = true;
    this.organs.setBody(this.targets, this.instant);
    this.moving = true;
  }

  /** Steps everything on the clock; true while anything moves (draw another frame). */
  update(now: number): boolean {
    const dt = this.lastNow < 0 ? 0.016 : Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const t = this.targets, f = this.frame, ctx = this.ctx;
    let moving = this.moving;
    this.moving = false;
    if (!t || !f || !ctx) return this.organs.update(now) || moving;
    const inst = this.instant; this.instant = false;
    moving = this.organs.update(now) || moving;
    moving = this.fluid.follow(t.ascites, dt, inst) || moving;
    this.ascites.set(this.fluid.shown);
    this.organs.setBowelLift(this.ascites.bulge / 34 * 26);
    moving = this.clots.set(t.thrombus, dt, inst) || moving;
    moving = this.bandsShown.to(t.bands, dt, inst) || moving;
    const m = f.metrics ?? {};
    moving = this.strands.set({
      presence: ctx.presence, recruit: (id) => ctx.recruit(id, f), bands: this.bandsShown.value,
      varixD: { varix: (m.varix?.d as number | undefined) ?? null, gastricVarix: (m.gastricVarix?.d as number | undefined) ?? null },
    }, dt * 1000, inst) || moving;
    moving = this.bleed.set(t.bleed, dt, inst) || moving;
    moving = this.dye.step(dt, f) || moving;
    return moving;
  }

  dispose(): void { this.organs.dispose(); this.clots.dispose(); this.strands.dispose(); this.ascites.dispose(); this.bleed.dispose(); this.dye.dispose(); }
}
