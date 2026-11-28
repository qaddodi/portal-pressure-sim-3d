// The summary table's Doppler column (2D col-wave.js, deck visuals V16: `cols: [..., 'wave']`, `wave: 'PV_TRUNK'` on the slide or on a row): a small trace in each row, eight seconds (two breaths, about nine beats) of that row's own velocity
// at the vessel, drawn as the scanner shows it (toward the probe above the baseline in the Doppler's toward colour, away below in its away colour; the hepatic veins and the IVC drain away from the probe, so their
// forward flow is below). Each row is drawn on its own scale (the row's peak, never under 20 cm/s, so a still vein stays a line and a pulsing one shows its beats and breaths; the slide's `waveMax` puts every row on one scale), and the words and the hover give the real cm/s. The numbers are pure
// here (a test holds them); WaveCell.tsx draws the shapes with the charts' one GPU drawer.
import type { TableRowSpec, TableSpec } from '../../decks/schema.ts';

export interface Trace { t: number[]; v: number[] }

/** The vessels that drain away from the probe: their forward flow is drawn below the baseline. */
export const AWAY: ReadonlySet<string> = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA']);
export const NAME: Readonly<Record<string, string>> = {
  PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SMV_CONF: 'superior mesenteric vein', SV_CONF: 'splenic vein',
  RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'IVC', A_HEP: 'hepatic artery', TIPS: 'stent',
};
export const WAVE_SECS = 8, WAVE_MAX = 50, WAVE_MIN = 20;
/** One row's scale, cm/s from the baseline to the edge: its own peak plus a tenth, in steps of 5, never under WAVE_MIN (a trace with no flow, or a ripple of a few cm/s, stays flat). A slide's `waveMax` is every row's scale. */
export const waveScale = (w: Trace | null | undefined, table?: Pick<TableSpec, 'waveMax'> | null): number => {
  if (table?.waveMax != null && table.waveMax > 0) return table.waveMax;
  if (!w?.v?.length) return WAVE_MAX;
  return Math.max(WAVE_MIN, Math.ceil((Math.max(...w.v.map((v) => Math.abs(v))) * 1.1) / 5) * 5);
};
/** A trace as it is kept (baked, held): every second sample (40 ms apart, finer than the cell's pixels) and velocities to 0.1 cm/s. */
export const packTrace = (w: Trace): Trace => ({ t: w.t.filter((_, i) => i % 2 === 0), v: w.v.filter((_, i) => i % 2 === 0).map((v) => Math.round(v * 10) / 10) });
export const HEADING = 'Doppler';
export const CUT = 'Eight seconds of each row\'s own trace, about two breaths: flow toward the probe above the line, away below it; each row on its own scale, so compare the shapes (hover for the cm/s)';
/** The cell's own units: a trace is drawn in a box 120 x 36 and the baseline is its middle. */
export const W = 120, H = 36, MID = H / 2, PAD = 3;
/** The air each side of a trace inside its cell, px (deck-ui.css `td.wave` pads by the same; the "No flow" label keeps to it too), so a trace and its label never reach the table's edge. */
export const WAVE_AIR_PX = 10;

/** The vessel a row's trace is of: the row's own, the slide's, or the main portal vein. */
export const waveVessel = (row: Pick<TableRowSpec, 'wave'> | null | undefined, table: Pick<TableSpec, 'wave'> | null | undefined): string =>
  typeof row?.wave === 'string' ? row.wave : typeof table?.wave === 'string' ? table.wave : 'PV_TRUNK';
/** The scale of the slide's traces, cm/s from the baseline to the edge. */
export const waveMax = (table: Pick<TableSpec, 'waveMax'> | null | undefined): number => (table?.waveMax != null && table.waveMax > 0 ? table.waveMax : WAVE_MAX);

/** What a trace says in numbers: the lowest and highest velocity as the scanner shows it (away vessels flipped), the peak, whether it runs past the scale. A trace with no samples is null. */
export function waveStats(w: Trace | null | undefined, vessel: string, max = WAVE_MAX): { min: number; max: number; peak: number; over: boolean; none: boolean } | null {
  if (!w?.t?.length || w.t.length !== w.v?.length) return null;
  const sign = AWAY.has(vessel) ? -1 : 1, k = (MID - PAD) / max, top = MID - 1;
  const peak = Math.max(...w.v.map((v) => Math.abs(v)));
  const lo = Math.min(...w.v.map((v) => sign * v)), hi = Math.max(...w.v.map((v) => sign * v));
  return { min: lo, max: hi, peak, over: peak * k > top, none: Math.max(Math.abs(lo), Math.abs(hi)) < 1 };
}

/** The trace's points in a box of cw x ch px, [x0, y0, x1, y1, …]: the time along x, the velocity up (toward the probe) or down, held at the edge of the box. */
export function wavePoints(w: Trace, vessel: string, max: number, cw: number, ch: number): number[] {
  const sign = AWAY.has(vessel) ? -1 : 1, t1 = w.t[w.t.length - 1] || 1, top = MID - 1, k = (MID - PAD) / max;
  const out: number[] = [];
  for (let i = 0; i < w.v.length; i++) out.push((w.t[i]! / t1) * cw, ((MID - Math.max(-top, Math.min(top, sign * w.v[i]! * k))) / H) * ch);
  return out;
}

const n0 = (v: number) => String(Math.round(v));
/** The cell in words, for a screen reader and the hover title. */
export function waveWords(w: Trace | null | undefined, vessel: string, max = WAVE_MAX): { sr: string; title: string } {
  const s = waveStats(w, vessel, max), name = NAME[vessel] || vessel;
  if (!s) return { sr: 'calculating', title: '' };
  if (s.none) return { sr: `No flow in the ${name}`, title: 'No flow' };
  return { sr: `Doppler of the ${name}: ${n0(s.min)} to ${n0(s.max)} cm/s, toward the probe positive`, title: `${n0(s.min)} to ${n0(s.max)} cm/s${s.over ? `, past the ${max} cm/s scale` : ''}` };
}
