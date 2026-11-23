// The change-from-healthy chart's inputs from the 3D engine (2D: tool-shift.js configure/pin/progress read the deck's states; here the caller hands the same things over).
// A slide's state is what the engine's 'sequence' gives (client.sequence: fp, trail, start); the trail keys a time-lapse slide keeps are SHIFT_KEYS (2D shiftTrail).
import type { SeqStep } from '../../../engine/client.ts';
import { SHIFT_KEYS, shiftStages, stageVals, type ShiftSlide, type Readings, type Stage, type StageState, type Trail } from './model.ts';

/** The keys a time-lapse slide under this chart keeps day by day (2D shiftTrail): every reading the chart draws. false for a slide with no time-lapse. */
export const shiftTrail = (s: { lapse?: unknown } | null | undefined): readonly string[] | false => (s?.lapse ? SHIFT_KEYS : false);

/** The chart's SVR is MAP ÷ CO, as the slide's equation ("MAP = CO × SVR") and its notes teach it ("93 ÷ 5 in health"). The engine's own svr is (MAP − RA) ÷ CO, which leaves out the right atrial pressure:
 *  on the chart CO 133 % × SVR 64 % came to 85 %, not the 91 % MAP it names (hyperdynamic 4). Taken here, once, for every state and every day of a trail, so the three lines multiply exactly. */
export const svrOfMapCo = (fp: Readings): Readings => (Number.isFinite(fp.map) && Number.isFinite(fp.co) && fp.co! > 0 ? { ...fp, svr: fp.map! / fp.co! } : fp);
const trailMapCo = (t: Trail): Trail => t.map((r) => { const i = SHIFT_KEYS.indexOf('svr') + 1, co = r[SHIFT_KEYS.indexOf('co') + 1]!, map = r[SHIFT_KEYS.indexOf('map') + 1]!; return co > 0 && Number.isFinite(map) ? r.map((v, j) => (j === i ? map / co : v)) : r; });

/** What the chart needs of a worked-out slide state (an engine 'seqStep'). */
export const stateOfStep = (st: Pick<SeqStep, 'fp'> & { trail?: unknown; start?: unknown }): StageState => {
  const start = (st.start as { fp?: Readings | null } | null) ?? null, trail = (st.trail as Trail | null) ?? null;
  return { fp: svrOfMapCo(st.fp as Readings), trail: trail ? trailMapCo(trail) : null, start: start ? { ...start, fp: start.fp ? svrOfMapCo(start.fp) : start.fp } : null };
};

export interface ShiftData { stages: Stage[]; vals: (Readings | null)[]; trails: (Trail | null)[] }
/** The chart's data from a deck's slides and each slide's state (by slide index; stateOf: the slide's state key when slides share one, else the slide index). */
export function shiftData(slides: readonly ShiftSlide[], states: (j: number) => StageState | null | undefined, stateOf?: readonly number[] | null): ShiftData {
  const stages = shiftStages(slides, stateOf);
  return { stages, vals: stages.map((s) => stageVals(s, states(s.j))), trails: stages.map((s) => (s.start ? null : states(s.j)?.trail ?? null)) };
}
