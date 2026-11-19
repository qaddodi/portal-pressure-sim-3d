// The Tests devices on the figure (B11): the Doppler probe, the FibroScan probe and the endoscope with its ligator cap and EUS needle. They follow `useProbes` (state.ts; bind-tests.ts keeps it in step with the
// Tests card), ease in and out, and leave when the figure goes to the Circuit (like the other devices). `update` is called from the scene's frame and answers whether it needs another.
import { Box3, Group } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { DopplerProbe } from './doppler-probe.ts';
import { FibroProbe } from './fibro-probe.ts';
import { EndoScope } from './scope.ts';
import { useProbes, type FibroOrgan } from './state.ts';
import type { ScreenEnv } from './screen.ts';

/** What the layer asks of the scene: an organ's box in the figure (null while it is not built), and the stiffness the FibroScan reads (kPa). */
export interface ProbeEnv { organBox(organ: FibroOrgan): Box3 | null; kpa(organ: FibroOrgan): number | null; /** the screen the devices keep clear of the cards on (the scene's; tests leave it out) */ screen?: ScreenEnv }

export class ProbeLayer {
  readonly group = new Group();
  readonly doppler: DopplerProbe;
  readonly fibro: FibroProbe;
  readonly scope: EndoScope;
  private last = -1;
  private readonly env: ProbeEnv;

  constructor(shared: CelShared, env: ProbeEnv) {
    this.env = env;
    this.group.name = 'test-devices';
    this.doppler = new DopplerProbe(shared); this.fibro = new FibroProbe(shared); this.scope = new EndoScope(shared);
    this.group.add(this.doppler.group, this.fibro.group, this.scope.group);
  }

  /** Steps the devices. `away`: the figure is off the body (the Circuit, a dive): they ease out. True while any moves. */
  update(now: number, away = false): boolean {
    const dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const s = useProbes.getState();
    const on = (b: boolean) => b && !away;
    const a = this.doppler.update(dt, on(s.doppler.on), s.doppler.edge, s.doppler.seg, this.env.screen ?? null, now);
    const f = this.fibro.update(dt, now, on(s.fibro.on), s.fibro.organ, this.env.organBox, this.env.kpa(s.fibro.organ));
    const e = this.scope.update(dt, on(s.endoscope.on), s.endoscope.mode, s.endoscope.station, s.endoscope.u, s.endoscope.needle);
    return a || f || e;
  }

  /** Every device object, for the scene's look and phone switches. */
  get objects() { return [...this.doppler.parts, ...this.fibro.parts, ...this.scope.parts]; }
  applyPalette(p: Palette): void { this.doppler.applyPalette(p); this.fibro.applyPalette(p); this.scope.applyPalette(p); }
  setPhone(phone: boolean): void { this.doppler.setPhone(phone); this.fibro.setPhone(phone); this.scope.setPhone(phone); }
  /** True when a device is on the figure or asked for (the clock keeps drawing while the FibroScan's waves run). */
  get active(): boolean { const s = useProbes.getState(); return s.doppler.on || s.fibro.on || s.endoscope.on || this.doppler.active || this.fibro.shown > 0 || this.scope.d > 0.5; }
  dispose(): void { this.doppler.dispose(); this.fibro.dispose(); this.scope.dispose(); }
}
