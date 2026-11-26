// The one rule for every card with Pressure | Velocity tabs (Mohammad, 26 Nov: "the TIPS IR card should open with pressure, then velocity is the other tab; and
// when I switch to velocity the actual figure lens should switch to velocity too").
//   · the tabs are always in this order, Pressure first, and a card opens on Pressure (the figure's own default lens);
//   · a card keeps no copy of the choice: its tab is read from the figure's lens (Velocity when the figure wears the velocity lens, else Pressure), and a tap sets the
//     figure's lens (sceneApi.setLens), so the card and the figure cannot disagree, whichever of them was changed last.
// Pure and node-safe: the hook that reads and writes the lens is src/ui/charts/useMeasureLens.ts.
import type { LensId } from './model.ts';

export type MeasureLens = 'pressure' | 'velocity';
/** The tabs, in order. */
export const MEASURE_TABS: readonly [MeasureLens, string][] = [['pressure', 'Pressure'], ['velocity', 'Velocity']];
export const MEASURE_DEFAULT: MeasureLens = 'pressure';
/** The tab that goes with a figure lens: Velocity for the velocity lens, Pressure for every other (the card opens on Pressure). */
export const measureOf = (lens: LensId | string): MeasureLens => (lens === 'velocity' ? 'velocity' : MEASURE_DEFAULT);
