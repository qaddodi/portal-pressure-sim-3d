// The registry entry of the profile chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// Specimens: made-up but plausible pressures (the model's shapes: a cirrhotic liver's fall at the sinusoid, a clot in the portal vein, a block after the liver),
// never a patient. The 2D gallery's specimens are profile/default, spans, from, block-pvt and block-hepatic (src/ui/gallery/catalog.js).
import type { ChartKind } from '../registry.ts';
import type { ChartCtx } from '../Chart.tsx';
import { profileFrameAtRest } from './frame.ts';
import { NO_SPANS, SPANS, goalOf, planProfile, profOf, spansOf, spansStented, type Prof, type Span } from './model.ts';

/** The eight stations' pressures (gut, portal vein, portal venule, sinusoid (wedged), central vein, hepatic vein, IVC, right atrium), then HVPG, PPG and EUS-PPG. */
const HEALTHY = profOf([12, 8.1, 7.6, 6.9, 5.2, 4.6, 4, 3.5], 2.3, 4.1, 3);
const CIRRHOSIS = profOf([21, 17.6, 17.3, 16.2, 6.3, 5.1, 4.6, 4], 11.1, 13, 12.2);
const CLOT = profOf([22.4, 19.3, 8.2, 7.5, 6.1, 5.5, 5, 4.5], 2, 14.3, 2.7);
const HEPATIC = profOf([29.5, 25.8, 25.6, 25.3, 24.9, 24.9, 4.3, 3.9], 0.4, 21.5, 0.3);
const AFTER_TIPS = profOf([17.5, 14.2, 13.7, 13.9, 5, 4.6, 4.5, 3.9], 9.3, 9.7, 9.4);

interface Spec { p: Prof; hl?: Prof | null; bf?: Prof | null; spans?: Span[]; fromLabel?: string; held?: boolean; height?: number }
/** A specimen at rest on a chart context (the box's type size, as the card takes it). */
export function profileSpecimen(s: Spec, c: ChartCtx) {
  const f = Math.max(12, c.type.sm), hl = s.hl ?? null, bf = s.bf ?? null, spans = s.spans ?? SPANS;
  return profileFrameAtRest(planProfile(Math.max(240, c.w), s.height ?? 0, f, goalOf(s.p, hl, bf), hl, bf, spans, s.fromLabel), c, { held: s.held });
}

export const profileEntry: ChartKind = {
  kind: 'profile', what: 'Pressure profile along the circuit', slides: 33, status: 'done',
  specimens: [
    { id: 'default', label: 'Gut to heart, HVPG and PPG brackets, the healthy line dashed (cirrhosis, specimen numbers)', build: (c) => profileSpecimen({ p: CIRRHOSIS, hl: HEALTHY }, c) },
    { id: 'spans', label: 'With the EUS-PPG bracket as well', build: (c) => profileSpecimen({ p: CIRRHOSIS, hl: HEALTHY, spans: spansOf(['hvpg', 'eus', 'ppg']) }, c) },
    { id: 'clot', label: 'A clot in the portal vein: the red block stands on the portal vein', build: (c) => profileSpecimen({ p: CLOT, hl: HEALTHY }, c) },
    { id: 'hepatic', label: 'A block after the liver: the pressure is held up to the hepatic vein', build: (c) => profileSpecimen({ p: HEPATIC, hl: HEALTHY }, c) },
    { id: 'from', label: 'After a stent: the state before dotted, no HVPG bracket (a stent is in)', build: (c) => profileSpecimen({ p: AFTER_TIPS, hl: HEALTHY, bf: CIRRHOSIS, spans: spansStented(SPANS), fromLabel: 'Before TIPS' }, c) },
    { id: 'raw', label: 'The raw ladder: no bracket, the readings alone', build: (c) => profileSpecimen({ p: CIRRHOSIS, hl: HEALTHY, spans: NO_SPANS }, c) },
    { id: 'held', label: 'A question slide: the answer held back (no blocks, no brackets)', build: (c) => profileSpecimen({ p: CIRRHOSIS, hl: HEALTHY, held: true }, c) },
  ],
};
