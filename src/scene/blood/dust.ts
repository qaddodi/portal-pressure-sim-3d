// The dust's live settings: the numbers the vessels' shader reads (one vec4 array, shared by every vessel), eased. A setting changed (by the hidden ?dust panel, a preset, pasted text) is a new TARGET: the values glide to it
// (EASE_MS), so a density, a size, a swirl or a colour never snaps, and a select (colour by, particle colour, speed follows) is a set of weights that cross-fade. Nothing here runs a frame of its own: the scene steps it
// in its own update and keeps the clock awake while it returns true. Pure but for the three.js-free Float32Array: a node test loads it.
import { DUST_NUMERIC, DUST_UNIFORMS, DUST_VEC4, dustDefaults, dustDerive, hexRgb, parseDust, type DustSettings, type DustWeights } from './dust-spec.ts';

/** The time constant of the glide (ms): 95 percent of the way in three of these. */
export const DUST_EASE_MS = 240;

const NUMERIC = DUST_NUMERIC.map((r) => r[0]);
const MODES = ['random', 'speed', 'depth', 'radius', 'source'] as const;

export class DustTuner {
  /** The uniform every vessel shares (`dustP`): DUST_VEC4 vec4s, flat. */
  readonly uniform: { value: Float32Array } = { value: new Float32Array(DUST_VEC4 * 4) };
  private tgt: DustSettings = dustDefaults();
  private cur: Record<string, number> = {};
  private w: DustWeights = { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 };
  private rgb: [number, number, number] = [0.62, 0.77, 1];
  private phone = false;
  private devicePixels = 4.5e6;
  /** How the scene is woken when a target changes while nothing else is moving (set by the scene: clock.invalidate). */
  onWake: (() => void) | null = null;

  constructor() { this.snap(); }

  /** The settings now wanted (the panel shows these). */
  settings(): DustSettings { return { ...this.tgt }; }

  /** Changes some settings: they ease in. Unknown keys are ignored. */
  set(patch: DustSettings): void {
    for (const [k, v] of Object.entries(patch)) if (k in this.tgt) this.tgt[k] = v;
    this.onWake?.();
  }
  /** Replaces every setting (a preset, pasted text, Reset): the same glide. */
  replace(all: DustSettings): void { this.tgt = { ...dustDefaults(), ...all }; this.onWake?.(); }
  /** Pasted text (Copy's own, or the lab's): throws a short message on text that is not settings. */
  applyText(text: string): void { this.replace(parseDust(text, dustDefaults())); }
  /** Jumps to the targets at once (the first frame, a test). */
  snap(): void {
    for (const k of NUMERIC) this.cur[k] = this.tgt[k] as number;
    this.w = this.weightsOf(); this.rgb = hexRgb(String(this.tgt.partHex));
    this.write();
  }

  /** The device class and the canvas size the sample budget follows (dust-spec.ts dustBudget): changes at once, they are not an animation. */
  setView(phone: boolean, devicePixels: number): void {
    if (phone === this.phone && Math.abs(devicePixels - this.devicePixels) < 0.02 * this.devicePixels) return;
    this.phone = phone; this.devicePixels = devicePixels; this.write();
  }
  setPhone(phone: boolean): void { this.setView(phone, this.devicePixels); }

  private weightsOf(): DustWeights {
    const mode = String(this.tgt.colorBy);
    return { random: mode === 'random' ? 1 : 0, speed: mode === 'speed' ? 1 : 0, depth: mode === 'depth' ? 1 : 0, radius: mode === 'radius' ? 1 : 0, source: mode === 'source' ? 1 : 0, custom: this.tgt.partColor === 'custom' ? 1 : 0, local: this.tgt.vel === 'flat' ? 0 : 1 };
  }

  /** Eases the values toward the targets by `dtMs`. Returns true while anything is still moving (the scene keeps asking for frames). */
  step(dtMs: number): boolean {
    const k = 1 - Math.exp(-Math.max(0, dtMs) / DUST_EASE_MS);
    let moving = false;
    const go = (from: number, to: number, span: number): number => {
      const d = to - from;
      if (Math.abs(d) <= 1e-3 * span) return to;
      moving = true;
      return from + d * k;
    };
    for (const r of DUST_NUMERIC) {
      const key = r[0];
      if (key === 'budget') { this.cur[key] = this.tgt[key] as number; continue; }
      this.cur[key] = go(this.cur[key]!, this.tgt[key] as number, r[3] - r[2]);
    }
    const want = this.weightsOf(), w = this.w as unknown as Record<string, number>;
    for (const key of [...MODES, 'custom', 'local']) w[key] = go(w[key]!, (want as unknown as Record<string, number>)[key]!, 1);
    const rgb = hexRgb(String(this.tgt.partHex));
    for (let i = 0; i < 3; i++) this.rgb[i] = go(this.rgb[i]!, rgb[i]!, 1);
    this.write();
    return moving;
  }

  /** The uniform values for the present eased numbers. */
  private write(): void {
    const v = dustDerive(this.cur, this.w, this.rgb, { phone: this.phone, devicePixels: this.devicePixels });
    const a = this.uniform.value;
    DUST_UNIFORMS.forEach((name, i) => { a[i] = v[name]; });
  }

  /** The eased values now (tests, the panel's readout). */
  values(): Readonly<Record<string, number>> { return this.cur; }
}

/** The one tuner of the page: the scene's vessels read its uniform, the ?dust panel writes its targets. */
export const dustTuner = new DustTuner();
