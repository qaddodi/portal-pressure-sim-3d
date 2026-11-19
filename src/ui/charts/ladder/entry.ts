// The registry entry of the ladder chart: the six ladders (2D visual: 'ladders'), here the phone's grid of cases (each case's pressures on one line with the red blocks, the
// stations named once over them). The wide cell's chart is the profile chart. Specimens are made-up pressures, not patients.
import type { ChartKind } from '../registry.ts';
import { ladderColumnFrame, namesFrame, stripFrame } from './frame.ts';
import { NODES } from '../../../engine/hales/portal/topology.js';
import type { Fp } from './model.ts';

const NI = Object.fromEntries(NODES.map((n: { id: string }, i: number) => [n.id, i]));
/** Eight stations' pressures (gut to right atrium) as a fingerprint carries them: the tile keys, and the portal venule (no tile of its own) in the model's node pressures (`at.P`). */
export const caseFp = (int: number, pv: number, rpv: number, whvp: number, cv: number, fhvp: number, ivc: number, ra: number): Fp => {
  const P = new Float32Array(NODES.length);
  P[NI.RPV!] = rpv;
  return { int, pv, whvp, cv, fhvp, ivc, ra, hvpg: whvp - fhvp, ppg: pv - ivc, at: { P } };
};
const fp = caseFp;
const HEALTHY = fp(11, 8, 7, 6, 4, 3.5, 3.4, 2);
const CASES: { fp: Fp }[] = [
  { fp: fp(24, 22, 21, 15, 5, 4, 3.5, 2) },    // a fall inside the sinusoids
  { fp: fp(26, 24, 8, 6, 4, 3.5, 3.4, 2) },    // a fall before them
  { fp: fp(24, 22, 21, 20, 18, 9, 8, 6) },     // a fall after them
  { fp: fp(21, 19, 18, 17, 16, 15, 15, 14) },  // every pressure high, no fall
];

export const ladderEntry: ChartKind = {
  kind: 'ladder', what: 'The six ladders: each case\'s Gut to heart pressures on one line with the red blocks (visual: ladders)', slides: 3, status: 'done',
  specimens: [
    { id: 'names', label: 'The stations named once, under the sinusoidal brace', build: (c) => namesFrame(c) },
    { id: 'one', label: 'One case on a line, a fall inside the sinusoids', build: (c) => stripFrame(CASES[0]!.fp, HEALTHY, c)! },
    { id: 'four', label: 'Four cases under the names (phone grid)', build: (c) => ladderColumnFrame(CASES.map((k) => ({ ...k, healthy: HEALTHY })), c) },
  ],
};
