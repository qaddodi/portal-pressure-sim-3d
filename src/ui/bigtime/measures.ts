// The measures the timeline chart can draw (docs/approved/timeline-chart.md): what each is called, its unit and lane, where the record keeps it (feed.ts `days`, day-keys.ts) and how its reading is worded.
// Pure data and words. The model makes no bilirubin, INR, creatinine or sodium: those are the case's own and appear as words only (CASE_ONLY).
import { fmt } from '../charts/fmt.ts';

/** the encephalopathy risk index's words (metrics.js heRisk: Low under 0.2, Moderate under 0.45, else High; the engine keeps the cuts inline, tests/bigtime.test.ts pins these to its label) */
export const HE_CUTS = Object.freeze({ moderate: 0.2, high: 0.45 });
export const heWord = (v: number): string => (v < HE_CUTS.moderate ? 'Low' : v < HE_CUTS.high ? 'Moderate' : 'High');

export type LaneId = 'p' | 'hvpg' | 'stiff' | 'spl' | 'plt' | 'asc' | 'shunt' | 'co' | 'bp' | 'hr' | 'vx' | 'he' | 'habr';
export type GroupId = 'pressures' | 'gradients' | 'stiffness' | 'volume' | 'shunt' | 'liverflow' | 'heart' | 'bp' | 'blood' | 'varix' | 'brain' | 'artery';

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
  /** the reading as the list's row writes it when the group's header already names the unit ("6.7" under Volume L); `words` when absent */
  row?: (v: number) => string;
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
  // the gradients (one lane, the headline: the HVPG's zones when it is on): each its own series, read from the same shown pressures as the HVPG deck's catheter and needle (reads.ts)
  { id: 'hvpg', key: 'hvpg', name: 'HVPG', short: 'HVPG', group: 'gradients', lane: 'hvpg', tok: 'tr-hvpg', scale: same, words: mm, hide: 'trueHVPG', on: true },
  { id: 'ppg', key: 'ppg', name: 'PPG', short: 'PPG', group: 'gradients', lane: 'hvpg', tok: 'tr-ppg', scale: same, words: mm, hide: 'pv', on: false },
  { id: 'eus', key: 'eus', name: 'EUS-PPG', short: 'EUS-PPG', group: 'gradients', lane: 'hvpg', tok: 'tr-hv', scale: same, words: mm, hide: 'pv', on: false },
  // the elastography readings (the model's metrics.lsm and metrics.ssm, kPa): one lane, the same unit; off until chosen
  { id: 'lsm', key: 'lsm', name: 'Liver stiffness', short: 'LSM', group: 'stiffness', lane: 'stiff', tok: 'lsm', scale: same, words: (v) => `${fmt(v, 1)} kPa`, row: (v) => fmt(v, 1), on: false },
  { id: 'ssm', key: 'ssm', name: 'Spleen stiffness', short: 'SSM', group: 'stiffness', lane: 'stiff', tok: 'tr-sv', scale: same, words: (v) => `${fmt(v, 1)} kPa`, row: (v) => fmt(v, 1), on: false },
  { id: 'asc', key: 'asc', name: 'Ascites volume', short: 'Ascites', group: 'volume', lane: 'asc', tok: 'asc', scale: same, words: (v) => `${fmt(v, 1)} L`, row: (v) => fmt(v, 1), on: true },
  { id: 'shunt', key: 'shunt', name: 'Shunt fraction', short: 'Shunt fraction', group: 'shunt', lane: 'shunt', tok: 'shunt', scale: (v) => v * 100, words: (v) => `${Math.round(v * 100)}%`, on: true },
  { id: 'co', key: 'co', name: 'Cardiac output', short: 'Cardiac output', group: 'heart', lane: 'co', tok: 'tr-ra', scale: same, words: (v) => `${fmt(v, 1)} L/min`, row: (v) => fmt(v, 1), on: false },
  // what the model also computes (metrics.js): the spleen and platelets, the liver's blood flow, the pressure and pulse, the varix, the encephalopathy risk and the hepatic artery's response; all off until chosen
  { id: 'spl', key: 'spl', name: 'Spleen size', short: 'Spleen', group: 'blood', lane: 'spl', tok: 'tr-sv', scale: same, words: (v) => `${fmt(v, 1)} cm`, row: (v) => fmt(v, 1), on: false },
  { id: 'plt', key: 'plt', name: 'Platelets', short: 'Platelets', group: 'blood', lane: 'plt', tok: 'tr-sin', scale: same, words: (v) => `${Math.round(v)}`, row: (v) => String(Math.round(v)), on: false },
  { id: 'pflow', key: 'pflow', name: 'Portal flow', short: 'Portal flow', group: 'liverflow', lane: 'co', tok: 'tr-pv', scale: same, words: (v) => `${fmt(v, 2)} L/min`, row: (v) => fmt(v, 2), on: false },
  { id: 'perf', key: 'perf', name: 'Liver perfusion', short: 'Liver perfusion', group: 'liverflow', lane: 'shunt', tok: 'tr-hv', scale: same, words: (v) => `${Math.round(v)}%`, row: (v) => `${Math.round(v)}%`, on: false },
  { id: 'map', key: 'map', name: 'Arterial pressure', short: 'MAP', group: 'bp', lane: 'bp', tok: 'tr-ivc', scale: same, words: (v) => `${Math.round(v)} mmHg`, row: (v) => String(Math.round(v)), on: false },
  { id: 'app', key: 'app', name: 'Perfusion pressure', short: 'APP', group: 'bp', lane: 'bp', tok: 'tr-ra', scale: same, words: (v) => `${Math.round(v)} mmHg`, row: (v) => String(Math.round(v)), on: false },
  { id: 'hr', key: 'hr', name: 'Heart rate', short: 'Heart rate', group: 'bp', lane: 'hr', tok: 'tr-var', scale: same, words: (v) => `${Math.round(v)} bpm`, row: (v) => String(Math.round(v)), on: false },
  { id: 'vx', key: 'vx', name: 'Varix size', short: 'Varix', group: 'varix', lane: 'vx', tok: 'tr-scler', scale: same, words: (v) => `${fmt(v, 1)} mm`, row: (v) => fmt(v, 1), on: false },
  { id: 'he', key: 'he', name: 'Encephalopathy risk', short: 'Encephalopathy risk', group: 'brain', lane: 'he', tok: 'tr-hvpg', scale: same, words: (v) => `${fmt(v, 2)} ${heWord(v)}`, row: (v) => heWord(v), on: false },
  { id: 'habr', key: 'habr', name: 'Artery response', short: 'Artery', group: 'artery', lane: 'habr', tok: 'tr-wedge', scale: same, words: (v) => `${fmt(v, 2)}×`, row: (v) => `${fmt(v, 2)}×`, on: false },
];
export const MEASURE_OF: Readonly<Record<string, Measure>> = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
/** the HVPG lane is always the headline (the mocks): its own key and word */
export const HVPG = { key: 'hvpg', name: 'HVPG', tok: 'tr-hvpg' } as const;

export const GROUPS: readonly { id: GroupId; name: string; unit: string }[] = [
  { id: 'pressures', name: 'Pressures', unit: 'mmHg' },
  { id: 'gradients', name: 'Gradients', unit: 'mmHg' },
  { id: 'stiffness', name: 'Stiffness', unit: 'kPa' },
  { id: 'volume', name: 'Volume', unit: 'L' },
  { id: 'shunt', name: 'Shunt', unit: '% of splanchnic inflow' },
  { id: 'liverflow', name: 'Liver blood flow', unit: 'L/min · % of healthy' },
  { id: 'heart', name: 'Heart', unit: 'L/min' },
  { id: 'bp', name: 'Pressure and pulse', unit: 'mmHg · bpm' },
  { id: 'blood', name: 'Spleen and platelets', unit: 'cm · ×10⁹/L' },
  { id: 'varix', name: 'Varices', unit: 'mm' },
  { id: 'brain', name: 'Encephalopathy', unit: 'risk index, 0 to 1' },
  { id: 'artery', name: 'Hepatic artery', unit: '× its resting flow' },
];
/** the cut-offs a lane draws, from the model's own (pressure-cuts.js: HVPG 10 and 12; flow cuts: the large shunt 0.3; ascites grades 150 mL and 1500 mL) */
export const CASE_ONLY = ['Sodium', 'Creatinine', 'Bilirubin', 'INR', 'MELD'] as const;

/** which measures the lane holds */
export const laneOf = (lane: LaneId): readonly Measure[] => MEASURES.filter((m) => m.lane === lane);
