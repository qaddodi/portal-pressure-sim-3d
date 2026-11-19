// The dock's lobule strip's tiles (2D dock.js LOBULE_TILES), plain data so a test can read them.
export interface Scale { lo: number; hi: number }

/** On the Lobule and Sinusoid views the strip reads the lobule's own flows instead of HVPG and PPG (2D dock.js LOBULE_TILES; collapsed it keeps LOBULE_PRIMARY, the two key flows):
 *  through the sinusoids and in from the portal venule, each as a percentage of the healthy patient's. The words and cut-offs are 2D's. */
export const LOBULE_TILES = [
  { id: 'lz-sin', k: 'Sinusoids', title: 'Sinusoidal flow', scale: { lo: 0, hi: 150 }, ticks: [55, 75], reversible: false,
    sev: (v: number) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), word: (v: number) => (v > 75 ? 'Normal' : v > 55 ? 'Low' : 'Severe') },
  { id: 'lz-pv', k: 'Portal in', title: 'Portal inflow', scale: { lo: -60, hi: 150 }, ticks: [0, 50], reversible: true,
    sev: (v: number) => (v < -2 ? 'critical' : v < 50 ? 'danger' : v < 75 ? 'caution' : 'ok'), word: (v: number) => (v < -2 ? 'Reversed' : v < 50 ? 'Severe' : v < 75 ? 'Low' : 'Normal') },
] as const;
