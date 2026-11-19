// The registry entry of the plane chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
import type { ChartKind } from '../registry.ts';
import { planeFrame } from './frame.ts';
import { PLANES, type Fp, type PlanePoint } from './model.ts';

// Made-up readings, a specimen shows a look, not a patient.
const CSPH: PlanePoint[] = [
  { f: { lsm: 8.5, plt: 215 }, name: 'Healthy', site: 'none' }, { f: { lsm: 21, plt: 112 }, name: 'Cirrhosis', site: 'pre' }, { f: { lsm: 31, plt: 88 }, name: 'Decompensated', site: 'sin' },
];
const HP: PlanePoint[] = [
  { f: { hvpg: 3, ppg: 4 }, name: 'Healthy' }, { f: { hvpg: 12.5, ppg: 15 }, name: 'Cirrhosis', short: 'Cirrhosis' }, { f: { hvpg: 4, ppg: 9.5 }, name: 'Presinusoidal obstruction', short: 'Presinusoidal', site: 'pre' },
  { f: { hvpg: 15, ppg: 17 }, name: 'Decompensated', from: { hvpg: 12.5, ppg: 15 } },
];
const FLOW: PlanePoint[] = [
  { f: { pvFlow: 1.1, ppg: 3.5 }, name: 'Healthy' }, { f: { pvFlow: 0.85, ppg: 13.5 }, name: 'Cirrhosis' }, { f: { pvFlow: 0.55, ppg: 8 }, name: 'On carvedilol', from: { pvFlow: 0.85, ppg: 13.5 } },
];
const CASE: Fp = { lsm: 22.4, plt: 118 };
const STOPS = [{ f: { lsm: 9, plt: 210 } as Fp, name: 'Healthy' }, { f: { lsm: 16.5, plt: 150 } as Fp, name: 'Compensated' }];

export const planeEntry: ChartKind = {
  kind: 'plane', what: 'Two-quantity plane with zones (CSPH plane, stiffness × platelets)', slides: undefined, status: 'done',
  specimens: [
    { id: 'csph', label: 'Summary: three patients on the Baveno VIII stiffness and platelets plane (specimen numbers)', build: (c) => planeFrame({ plane: PLANES.csph!, points: CSPH }, c).frame },
    { id: 'hvpg-ppg', label: 'Summary: HVPG against PPG, the zones named by the key, one patient with the ring he started from', build: (c) => planeFrame({ plane: PLANES['hvpg-ppg']!, points: HP }, c).frame },
    { id: 'flow-ppg', label: 'Summary: portal flow against PPG, lines of equal resistance, a patient moved by a drug', build: (c) => planeFrame({ plane: PLANES['flow-ppg']!, points: FLOW }, c).frame },
    { id: 'card', label: 'Data card: the slide\'s case as a dot, the trail of the slides before it, its reading under the plot', build: (c) => planeFrame({ plane: PLANES.csph!, ring: CASE, stops: STOPS, walk: { walk: [], armed: false } }, c).frame },
  ],
};
