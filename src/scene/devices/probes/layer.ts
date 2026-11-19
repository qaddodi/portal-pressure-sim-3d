// The Tests devices on the figure (B11): the Doppler probe, the FibroScan probe and the endoscope with its ligator cap and EUS needle. They follow `useProbes` (state.ts; bind-tests.ts keeps it in step with the
// Tests card), ease in and out, and leave when the figure goes to the Circuit (like the other devices). `update` is called from the scene's frame and answers whether it needs another.
import { Box3, Group, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { DopplerProbe } from './doppler-probe.ts';
import { FibroProbe } from './fibro-probe.ts';
import { EndoScope, type EusDrive, type ScopeDrive } from './scope.ts';
import { glueTarget3 } from '../glue-cast.ts';
import { useProbes, type FibroOrgan } from './state.ts';
import type { ScreenEnv } from './screen.ts';
import { probeLabel } from '../../labels/probe-labels.ts';

/** What the layer asks of the scene: an organ's box in the figure (null while it is not built), and the stiffness the FibroScan reads (kPa). */
export interface ProbeEnv { organBox(organ: FibroOrgan): Box3 | null; kpa(organ: FibroOrgan): number | null; /** the screen the devices keep clear of the cards on (the scene's; tests leave it out) */ screen?: ScreenEnv; /** the EUS-PPG's procedure frame while it plays (null otherwise): the echoendoscope follows it */ eus?(): EusDrive | null }

export class ProbeLayer {
  readonly group = new Group();
  readonly doppler: DopplerProbe;
  readonly fibro: FibroProbe;
  readonly scope: EndoScope;
  private last = -1;
  /** the scope is the glue slide's (a drive was given, or it is fading out where it stood) */
  private gluing = false;
  private readonly env: ProbeEnv;

  constructor(shared: CelShared, env: ProbeEnv) {
    this.env = env;
    this.group.name = 'test-devices';
    this.doppler = new DopplerProbe(shared); this.fibro = new FibroProbe(shared); this.scope = new EndoScope(shared);
    this.group.add(this.doppler.group, this.fibro.group, this.scope.group);
  }

  /** Steps the devices. `away`: the figure is off the body (the Circuit, a dive): they ease out. True while any moves. */
  update(now: number, away = false, drive: ScopeDrive | null = null): boolean {
    const dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const s = useProbes.getState();
    const on = (b: boolean) => b && !away;
    const a = this.doppler.update(dt, on(s.doppler.on), s.doppler.edge, s.doppler.seg, this.env.screen ?? null, now);
    const f = this.fibro.update(dt, now, on(s.fibro.on), s.fibro.organ, this.env.organBox, this.env.kpa(s.fibro.organ), this.env.screen ?? null);
    let e: boolean;
    if (drive) {
      // the glue slide's procedure plays the scope (the procedure layer's frame: the 2D record, not the Tests card's store); the figure leaving the body takes it too
      this.gluing = true;
      e = this.scope.update(dt, !away, 'glue', 'pv', drive.u, drive.needle, drive, now);
    } else if (this.gluing) {
      // the procedure is off: the scope parked over the varix fades out where it stands
      e = this.scope.leave(dt);
      if (!e) this.gluing = false;
    } else e = this.scope.update(dt, on(s.endoscope.on), s.endoscope.mode, s.endoscope.station, s.endoscope.u, s.endoscope.needle, this.env.eus?.() ?? null, now);
    if (this.env.screen) this.writeLabels(s.doppler.edge, s.doppler.seg);
    return a || f || e;
  }

  /** What the label layer draws of the devices: the FibroScan probe's screen number (labels/probe-labels.ts). */
  private writeLabels(edge: string, seg: string | null): void {
    const sc = probeLabel.scan, fp = this.fibro, at = fp.screenAt;
    sc.on = at.placed; sc.alpha = fp.shown * at.headOp; sc.x = at.x; sc.y = at.y; sc.turn = at.turn; sc.k = fp.reading;
  }

  /** Every device object, for the scene's look and phone switches. */
  get objects() { return [...this.doppler.parts, ...this.fibro.parts, ...this.scope.parts]; }
  applyPalette(p: Palette): void { this.doppler.applyPalette(p); this.fibro.applyPalette(p); this.scope.applyPalette(p); }
  setPhone(phone: boolean): void { this.doppler.setPhone(phone); this.fibro.setPhone(phone); this.scope.setPhone(phone); }
  /** What the camera frames while the glue slide plays: the scope's end on the way in, then the middle of the scope and the varix it works on (2D glueFocus); null otherwise. */
  glueFocus(out: Vector3): Vector3 | null {
    if (!this.gluing || this.scope.d < 0.5) return null;
    const tip = this.scope.pose.tip;
    return this.scope.needle > 0.01 || this.scope.fan > 0.5 ? out.copy(tip).add(glueTarget3(new Vector3())).multiplyScalar(0.5) : out.copy(tip);
  }
  /** True when a device is on the figure or asked for (the clock keeps drawing while the FibroScan's waves run). */
  get active(): boolean { const s = useProbes.getState(); return s.doppler.on || s.fibro.on || s.endoscope.on || this.doppler.active || this.fibro.shown > 0 || this.scope.d > 0.5 || this.gluing; }
  dispose(): void { this.doppler.dispose(); this.fibro.dispose(); this.scope.dispose(); }
}
