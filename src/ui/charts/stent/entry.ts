// The registry entry of the stent pictures (2D: tool-stent.js; slides: tips-complete's stent card, the Tests card's stent tabs). Specimens are made-up numbers, not a patient.
import type { ChartKind } from '../registry.ts';
import { dropFrame, sideFrame, traceFrame } from './frame.ts';
import { stentState } from './model.ts';

// a fingerprint's stent terms (mmHg, L/min, cm/s, mm, cm): a 10 mm TIPS, open; and the same with its distal end narrowed and a waist in the middle
const FP_OPEN = { ppg: 9.4, ivc: 4.5, tipsFlow: 1.9, tipsDp: 3.2, tipsG0: 138, tipsG1: 152, tipsG2: 134, tipsTract: 1.1, tipsWall: 0.6, tipsEnds: 1, tipsJet: 0.5, tipsLumen: 10, tipsVel: 152, tipsD: 10, tipsLen: 8, tipsWaistLen: 1, tipsTrans: 0, tipsRed: 0, tipsStn: 0, tipsStnSite: 'distal' };
const FP_NARROW = { ...FP_OPEN, tipsDp: 5.6, tipsFlow: 1.5, tipsG0: 126, tipsG1: 188, tipsG2: 301, tipsTract: 1.1, tipsWall: 0.9, tipsEnds: 1, tipsJet: 2.6, tipsLumen: 5, tipsVel: 301, tipsStn: 0.5, tipsRed: 0.2, tipsWaistLen: 3, tipsTrans: 1, ppg: 11.8 };
const OPEN = stentState(FP_OPEN, 'TIPS', null), NARROW = stentState(FP_NARROW, 'TIPS', null), NONE = stentState(null, 'TIPS', null);

export const stentEntry: ChartKind = {
  kind: 'stent', what: 'Stent pictures: drop, trace, waist', slides: undefined, status: 'done',
  specimens: [
    { id: 'side', label: 'The stent in side view, lumen coloured by velocity (specimen numbers)', build: (c) => sideFrame(OPEN, c, { gate: 'mid' }) },
    { id: 'side-narrow', label: 'Side view with a narrowed distal end and a waist, coloured by pressure, with the five sites', build: (c) => sideFrame(NARROW, c, { color: 'pressure', sites: true }) },
    { id: 'trace-pressure', label: 'The static pressure along the stent', build: (c) => traceFrame(NARROW, c, { pick: 'pressure' }) },
    { id: 'trace-energy', label: 'The energy lost so far along the stent', build: (c) => traceFrame(OPEN, c, { pick: 'energy' }) },
    { id: 'trace-velocity', label: 'The mean velocity along the stent', build: (c) => traceFrame(NARROW, c, { pick: 'velocity' }) },
    { id: 'drop-ppg', label: 'Where the pressure goes, from the PPG', build: (c) => dropFrame(NARROW, c, { to: 'ppg' }) },
    { id: 'drop-stent', label: 'Where the pressure goes, the stent\'s own drop', build: (c) => dropFrame(OPEN, c, { to: 'stent' }) },
    { id: 'none', label: 'No stent in', build: (c) => sideFrame(NONE, c) },
  ],
};
