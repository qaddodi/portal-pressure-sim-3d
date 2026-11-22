// The tone of a vessel's flow heads, kept per vessel (external review, 20 Nov: "chevron ink flips dark/cream at a hard luminance threshold"; Mohammad: nothing pops). The shaders used to judge every pixel of every head by a hard step on
// the lumen's luminance, so a head flipped between near-black and cream the instant a pressure, a lens or a look took its colour across the threshold, and flickered when it hovered there. Now each coloured vessel has ONE latched ink:
//   decide(lens data, look)   reads the vessel's mean luminance as DRAWN (the lens colour through celTubeBase, the four colours along it) and runs the latch (blood/chevron-glsl.ts CHEV_INK: cream under AT - HYST, dark over AT + HYST,
//                             unchanged between), so a value that hovers at the threshold changes nothing
//   step(dt)                  eases each vessel's shown value toward its latch over CHEV_INK.EASE_MS (linear here; the shader smooths it): the head's tone glides from ink to cream and back
//   write(grad)               puts the shown values in the fifth row of the lens's colour texture (r: 0 dark ink .. 1 cream), where vessels/shaders.ts reads them; each lens set (the one leaving, the one arriving) has its own
// The first time a vessel is seen its latch and shown value are set at once (nothing is changing); a vessel the lens does not colour (mode 0, lanes) keeps its latch and is judged by the shader's short eased step instead.
import { CHEV_INK, CHEV_INK_ROW, chevLatchJs, chevLum } from '../blood/chevron-glsl.ts';
import { celTubeBase, isDarkLook } from '../vessels/cel-ink.ts';
import { LENS_EDGE_COUNT, type LensData } from './model.ts';
import { isRawLens } from './pressure-ramp.ts';

const NE = LENS_EDGE_COUNT;
export const INK_ROW = CHEV_INK_ROW;

/** The mean linear luminance a coloured vessel is drawn at, or null when the lens does not colour it: the four colours along it, each through the vessels' own transform. */
export function drawnLuminance(d: LensData, k: number, look: string): number | null {
  if (d.mode !== 1 || d.grad[k * 4 + 3]! <= 0) return null;
  const dark = isDarkLook(look), raw = isRawLens(d.lens);   // (an as-drawn lens, the pressure ramp, is not put through the transform)
  let sum = 0, n = 0;
  for (let row = 0; row < 4; row++) {
    const i = (row * NE + k) * 4;
    if (d.grad[i + 3]! <= 0) continue;
    sum += chevLum(celTubeBase([d.grad[i]!, d.grad[i + 1]!, d.grad[i + 2]!], dark, raw)); n++;
  }
  return n ? sum / n : null;
}

export class ChevronInk {
  /** The latch: 1 = cream ink. */
  private readonly cream = new Uint8Array(NE);
  /** What the shader is shown, 0 dark ink .. 1 cream. */
  private readonly shown = new Float32Array(NE);
  private readonly seeded = new Uint8Array(NE);
  /** True when motion is reduced: a change lands at once. */
  instant = false;

  /** Runs the latch for every vessel the lens colours. Returns true when a latch changed (the shown values now move). */
  decide(d: LensData, look: string): boolean {
    let changed = false;
    for (let k = 0; k < NE; k++) {
      const lum = drawnLuminance(d, k, look);
      if (lum == null) continue;
      if (!this.seeded[k]) { this.seeded[k] = 1; this.cream[k] = lum < CHEV_INK.AT ? 1 : 0; this.shown[k] = this.cream[k]!; continue; }
      const next = chevLatchJs(this.cream[k] === 1, lum) ? 1 : 0;
      if (next !== this.cream[k]) { this.cream[k] = next; changed = true; }
    }
    return changed;
  }

  /** Moves every shown value toward its latch by `dtMs`; true while any is still on its way. */
  step(dtMs: number): boolean {
    let moving = false;
    const dk = this.instant ? 1 : Math.min(1, Math.max(0, dtMs) / CHEV_INK.EASE_MS);
    for (let k = 0; k < NE; k++) {
      const to = this.cream[k]!, v = this.shown[k]!;
      if (v === to) continue;
      const n = v < to ? Math.min(to, v + dk) : Math.max(to, v - dk);
      this.shown[k] = n;
      if (n !== to) moving = true;
    }
    return moving;
  }

  /** Whether any shown value is not yet at its latch. */
  get moving(): boolean { for (let k = 0; k < NE; k++) if (this.shown[k] !== this.cream[k]) return true; return false; }

  /** The shown value of vessel `k` (0 dark ink .. 1 cream), for tests. */
  valueOf(k: number): number { return this.shown[k]!; }
  /** The latch of vessel `k`: true = cream ink, for tests. */
  creamOf(k: number): boolean { return this.cream[k] === 1; }

  /** Puts the shown values in the colour texture's ink row. */
  write(grad: Float32Array): void {
    for (let k = 0; k < NE; k++) { const i = (INK_ROW * NE + k) * 4; grad[i] = this.shown[k]!; grad[i + 3] = this.seeded[k]!; }
  }
}
