// What the profile reads from the 3D engine (2D: tool-profile.js profileOf / healthy() / before(), presenter-tools.js's ctx). The chart's inputs are fingerprints, the
// readings the tiles print (src/engine/hales/portal/fingerprint.js: pv, whvp, fhvp, ivc, ra, int, cv, hvpg, ppg, eus, `at.P` the node pressures, tipsFlow / dipsFlow):
// the engine's 'sequence' answer carries one per slide (src/ui/talk/slide-states.ts), a live frame gives the same readings (fpFromFrame).
import { tenthGap } from '../../../engine/hales/core/gap.js';
import type { EngineFrame } from '../../../engine/hales/host/protocol.d.ts';
import { engine } from '../../../engine/index.ts';
import { goalOf, profileOf, spansFor, type Fp, type Goal, type Prof, type Span } from './model.ts';

/** The profile's inputs from the three fingerprints a slide has: its own, the healthy one and (for `from`) the earlier state. null where the slide has no profile. */
export function profileInputs(fp: Fp | null | undefined, healthy?: Fp | null, before?: Fp | null): { p: Prof; hl: Prof | null; bf: Prof | null; goal: Goal } | null {
  const p = profileOf(fp);
  if (!p) return null;
  const hl = profileOf(healthy), bf = profileOf(before);
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return { p, hl, bf, goal: { ...goalOf(p, hl, bf), whvp: num(fp?.whvp), fhvp: num(fp?.fhvp) } };
}

/** The brackets of a slide for a state: the slide's `spans` option, less the HVPG once a stent is in. */
export const spansOfSlide = (want: readonly string[] | null | undefined, fp: Fp | null | undefined): Span[] => spansFor(want, fp);

/** The earlier state a slide's `from` names (2D before()): a slide id → that slide's fingerprint; `true` → the nearest slide before this one whose state differs.
 *  slides: the slides in order, each with its id; fpOf(id): a slide's fingerprint; index: this slide's place. */
export function beforeOf(from: boolean | string | null | undefined, o: { slides: readonly { id?: string }[]; index: number; fp: Fp | null; fpOf(id: string): Fp | null | undefined }): Fp | null {
  if (!from) return null;
  if (typeof from === 'string') return o.fpOf(from) ?? null;
  for (let j = o.index - 1; j >= 0; j--) {
    const id = o.slides[j]?.id, fp = id ? o.fpOf(id) : null;
    if (fp && fp !== o.fp) return fp;
  }
  return null;
}

/** A live engine frame as the fingerprint keys the profile reads (the frame holds the readings of the model as it stands, eased). */
export function fpFromFrame(f: Pick<EngineFrame, 'P' | 'Pf' | 'metrics'>): Fp {
  const m = f.metrics as unknown as Record<string, any>, P = f.Pf || f.P;
  return {
    pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg), ra: m.vitals?.ra ?? m.ra, ivc: m.ivc, ppg: tenthGap(m.pv, m.ivc, m.ppg),
    tipsFlow: m.tips ? m.tips.flow : null, dipsFlow: m.dips ? m.dips.flow : null,
    at: { P },
  } as Fp;
}

let healthy: Promise<Fp | null> | null = null;
/** The healthy patient's fingerprint (2D: the presenter's `live.base`): worked out once, by the engine's own chain. */
export function healthyFp(): Promise<Fp | null> {
  if (!healthy) {
    healthy = engine().sequence([{ preset: 'healthy' }]).then((r) => (r[0]?.fp as Fp | undefined) ?? null);
    healthy.catch(() => { healthy = null; });
  }
  return healthy;
}
