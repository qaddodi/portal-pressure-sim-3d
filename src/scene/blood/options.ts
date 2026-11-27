// The Blood menu's choices (the 2D top bar's Blood menu, main.js bloodItems): the moving blood (chevrons, all or the key routes only) and what the
// figure shows beside it (pressure values, potential collaterals, organ names). Kept in localStorage like the other settings. The words are the 2D
// app's (tests/blood-options.test.ts finds each in main.js when PPS_2D_REPO is set).
import { create } from 'zustand';

export interface BloodChoice {
  /** Moving blood: chevrons that point the way blood moves in each vessel, orange where the flow is reversed */
  chevrons: boolean;
  /** Key chevrons only: just the main routes, not every vessel (always while presenting) */
  keyChevrons: boolean;
  /** Pressure values: the number beside each vessel's name */
  chips: boolean;
  /** Potential collaterals: dotted routes that open with pressure */
  collaterals: boolean;
  /** Organ names: the caption on each organ */
  labels: boolean;
}
export const BLOOD_DEFAULT: Readonly<BloodChoice> = { chevrons: true, keyChevrons: false, chips: true, collaterals: false, labels: true };

/** [key, title, line under it], in the menu's order and sections. */
export const BLOOD_MENU: readonly { section: string; rows: readonly (readonly [keyof BloodChoice, string, string])[] }[] = [
  { section: 'Moving blood', rows: [['chevrons', 'Chevrons', 'Flow arrows, orange where reversed'], ['keyChevrons', 'Key chevrons only', 'Just the main routes, not every vessel']] },
  { section: 'Show on the figure', rows: [['chips', 'Pressure values', 'The number beside each vessel’s name'], ['collaterals', 'Potential collaterals', 'Dotted routes that open with pressure'], ['labels', 'Organ names', 'The caption on each organ']] },
];

const KEY = 'pps3d.blood';
function load(): BloodChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<BloodChoice> | null;
    if (raw && typeof raw === 'object') return { ...BLOOD_DEFAULT, ...Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in BLOOD_DEFAULT && typeof v === 'boolean')) };
  } catch { /* storage unavailable or not JSON */ }
  return { ...BLOOD_DEFAULT };
}

interface BloodState extends BloodChoice { set(patch: Partial<BloodChoice>): void }
export const useBlood = create<BloodState>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    const { chevrons, keyChevrons, chips, collaterals, labels } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ chevrons, keyChevrons, chips, collaterals, labels })); } catch { /* storage unavailable */ }
  },
}));
