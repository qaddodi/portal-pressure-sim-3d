// The measures the timeline chart can draw (docs/approved/timeline-chart.md): what each is called, its unit and lane, where the record keeps it (feed.ts `days`, day-keys.ts) and how its reading is worded.
// Pure data and words. The model makes no bilirubin, INR, creatinine or sodium: those are the case's own and appear as words only (CASE_ONLY).
import { fmt } from '../charts/fmt.ts';

export type LaneId = 'p' | 'hvpg' | 'asc' | 'shunt' | 'co';
export type GroupId = 'pressures' | 'volume' | 'shunt' | 'heart';

export interface Measure {
  id: string;
  /** the key of the day record (feed.ts noteDay: the trace ids of Over time, 'hvpg', and day-keys.ts) */
  key: string;
  name: string;
  /** the short name a lane's title carries ("PV 17.5") */
  short: string;
  group: GroupId;
  lane: LaneId;
  /** the chart colour token of the measure ('tr-pv'); `ink` is its text twin where the palette has one */
  tok: string;
  /** the reading as a number the lane draws (the record's own value to the lane's unit) */
  scale: (v: number) => number;
  /** the reading in words, in the lane's unit */
  words: (v: number) => string;
  /** the Over time pane's hide rule: a measure the learner has not yet measured is not drawn */
  hide?: 'pv' | 'trueHVPG' | 'ra';
  /** drawn when the card first opens */
  on: boolean;
}

const same = (v: number) => v;
const mm = (v: number) => fmt(v, 1);

export const MEASURES: readonly Measure[] = [
  { id: 'pv', key: 'CONF', name: 'Portal vein', short: 'PV', group: 'pressures', lane: 'p', tok: 'tr-pv', scale: same, words: mm, hide: 'pv', on: true },
  { id: 'wedge', key: 'whvp', name: 'Wedged hepatic', short: 'WHVP', group: 'pressures', lane: 'p', tok: 'tr-wedge', scale: same, words: mm, hide: 'trueHVPG', on: true },
  { id: 'hv', key: 'RHV', name: 'Free hepatic', short: 'FHVP', group: 'pressures', lane: 'p', tok: 'tr-hv', scale: same, words: mm, hide: 'trueHVPG', on: true },
  { id: 'ivc', key: 'IVCS', name: 'IVC', short: 'IVC', group: 'pressures', lane: 'p', tok: 'tr-ivc', scale: same, words: mm, hide: 'ra', on: true },
  { id: 'ra', key: 'RA', name: 'Right atrium', short: 'RA', group: 'pressures', lane: 'p', tok: 'tr-ra', scale: same, words: mm, hide: 'ra', on: false },
  { id: 'var', key: 'var', name: 'Esophageal varix', short: 'Varix', group: 'pressures', lane: 'p', tok: 'tr-var', scale: same, words: mm, hide: 'pv', on: false },
  { id: 'sv', key: 'SV', name: 'Splenic', short: 'SV', group: 'pressures', lane: 'p', tok: 'tr-sv', scale: same, words: mm, hide: 'pv', on: false },
  { id: 'smv', key: 'smv', name: 'SMV', short: 'SMV', group: 'pressures', lane: 'p', tok: 'tr-smv', scale: same, words: mm, hide: 'pv', on: false },
  { id: 'asc', key: 'asc', name: 'Ascites volume', short: 'Ascites', group: 'volume', lane: 'asc', tok: 'asc', scale: same, words: (v) => `${fmt(v, 1)} L`, on: true },
  { id: 'shunt', key: 'shunt', name: 'Shunt fraction', short: 'Shunt fraction', group: 'shunt', lane: 'shunt', tok: 'shunt', scale: (v) => v * 100, words: (v) => `${Math.round(v * 100)}%`, on: true },
  { id: 'co', key: 'co', name: 'Cardiac output', short: 'Cardiac output', group: 'heart', lane: 'co', tok: 'tr-ra', scale: same, words: (v) => `${fmt(v, 1)} L/min`, on: false },
];
export const MEASURE_OF: Readonly<Record<string, Measure>> = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
/** the HVPG lane is always the headline (the mocks): its own key and word */
export const HVPG = { key: 'hvpg', name: 'HVPG', tok: 'tr-hvpg' } as const;

export const GROUPS: readonly { id: GroupId; name: string; unit: string }[] = [
  { id: 'pressures', name: 'Pressures', unit: 'mmHg' },
  { id: 'volume', name: 'Volume', unit: 'L' },
  { id: 'shunt', name: 'Shunt', unit: '% of splanchnic inflow' },
  { id: 'heart', name: 'Heart', unit: '' },
];
/** the cut-offs a lane draws, from the model's own (pressure-cuts.js: HVPG 10 and 12; flow cuts: the large shunt 0.3; ascites grades 150 mL and 1500 mL) */
export const CASE_ONLY = ['Sodium', 'Creatinine', 'Bilirubin', 'INR', 'MELD-Na'] as const;

/** which measures the lane holds */
export const laneOf = (lane: LaneId): readonly Measure[] => MEASURES.filter((m) => m.lane === lane);
