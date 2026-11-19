// Settings: every row of the 2D app's sheet (Settings › the one-shot rows, Appearance, Display, Model, Diagnostics, Reset), in its order, with the 2D app's words from
// strings.generated.ts. The sheet renders from this table and the parity claims are derived from it, so a row is claimed only while the sheet shows it.
import { UI } from '../strings.generated.ts';

export interface Row { section: string | null; label: string; kind: string; hint?: string }
const all = UI.settings as readonly Row[];
export function settingsRow(section: string | null, label: string): Row {
  const r = all.find((x) => x.section === section && x.label === label);
  if (!r) throw new Error(`the 2D Settings has no row "${section ?? 'Top'}/${label}"`);
  return r;
}
export const rowId = (r: Row) => `settings:${r.section ?? 'Top'}/${r.label}`;

/** The sheet, section by section. `phone`: only on the bottom bar's Settings (2D: withSearch); `talk: false`: not while presenting. */
export interface Section { title: string | null; rows: { row: Row; phone?: boolean; talk?: boolean }[] }
export const SECTIONS: readonly Section[] = [
  { title: null, rows: [
    { row: settingsRow(null, 'Send feedback') }, { row: settingsRow(null, 'History'), phone: true }, { row: settingsRow(null, 'Help'), phone: true }, { row: settingsRow(null, 'Enter full screen') },
  ] },
  { title: 'Appearance', rows: ['Light', 'Soft', 'Dark', 'Navy', 'Black', 'System'].map((l) => ({ row: settingsRow('Appearance', l) })) },
  { title: 'Display', rows: [
    { row: settingsRow('Display', 'Blur effect') }, { row: settingsRow('Display', 'Figure detail') },
    { row: settingsRow('Display', 'Figure detail: Less detail') }, { row: settingsRow('Display', 'Figure detail: More detail') },
    { row: settingsRow('Display', 'Sharp while moving') }, { row: settingsRow('Display', 'Keyboard shortcuts') },
  ] },
  { title: 'Model', rows: [{ row: settingsRow('Model', 'Advanced physiology'), talk: false }] },
  { title: 'Diagnostics', rows: [{ row: settingsRow('Diagnostics', 'Show frame rate') }, { row: settingsRow('Diagnostics', 'Show frame breakdown') }] },
  { title: null, rows: [{ row: settingsRow(null, 'Reset everything…'), talk: false }] },
];

/** Rows that do their 2D work today (the rest are on the sheet with the 2D words and stored, but nothing behind them yet). */
export const WIRED: ReadonlySet<string> = new Set([
  'Appearance/Light', 'Appearance/Soft', 'Appearance/Dark', 'Appearance/Navy', 'Appearance/Black', 'Appearance/System',
  'Display/Keyboard shortcuts', 'Display/Blur effect', 'Diagnostics/Show frame rate', 'Diagnostics/Show frame breakdown', 'Top/History', 'Top/Reset everything…', 'Top/Enter full screen', 'Top/Help',
]);
export const isWired = (r: Row) => WIRED.has(`${r.section ?? 'Top'}/${r.label}`);
