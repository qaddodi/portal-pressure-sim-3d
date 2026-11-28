// The instrument readings of a Tests pane as name and value rows, for the hidden data table beside its picture (WCAG 1.1.1, 1.3.1). A spectrum, a scope's picture and a stiffness map draw their
// numbers as shapes or as tiles outside the picture; the same strings the tiles print are written here, one place each, so a screen reader hears the velocity, the grade or the kPa and never only
// "Doppler trace". Pure: the panes pass the rows to `<Chart readings>` and the test reads them.
import type { Report } from './doppler/model.ts';
import type { readingsOf } from './endo/readings.ts';
import type { wallReadings } from './endo/wall.ts';

export type ReadingRows = readonly (readonly [string, string])[];
const keep = (rows: [string, string | undefined | null][]): [string, string][] => rows.filter((r): r is [string, string] => !!r[1] && r[1] !== '—').map(([n, v]) => [n, v]);

/** Doppler: the direction, the speed, the pattern and every tile the pane shows (stent gates, indices, the usual speed). */
export function dopplerRows(rep: Report | null, usual = ''): ReadingRows {
  if (!rep) return [];
  const rows: [string, string | undefined][] = [['Flow', rep.dir], ['Speed', rep.acquiring ? '' : `${rep.vel} cm/s`], ['Pattern', rep.pattern]];
  for (const t of rep.tiles) if (t.show && t.k !== 'Speed') rows.push([t.label, t.v === '—' ? '' : `${t.v}${t.unit ? ` ${t.unit}` : ''}`]);
  if (usual) rows.push(['Usual speed', `${usual} cm/s`]);
  return keep(rows);
}
/** Endoscopy: bands, grade, diameter, wall, the three pressures when the slide shows them, and the red marks. */
export function endoRows(rd: NonNullable<ReturnType<typeof readingsOf>>, pressureNames: readonly string[] | null): ReadingRows {
  const rows: [string, string][] = [['Bands placed', String(rd.bands)], ['Grade', rd.grade], ['Diameter', rd.diam], ['Wall thickness', rd.wall]];
  if (pressureNames) pressureNames.forEach((n, i) => rows.push([n, rd.pressures[i]!]));
  rows.push(['Red wale marks', rd.red]);
  return rows;
}
/** Wall mechanics: the stress as a share of the wall's limit and its word, then the law's terms. */
export function wallRows(r: ReturnType<typeof wallReadings> | null): ReadingRows {
  if (!r) return [];
  return keep([['Wall stress', `${r.pct}% of tear point, ${r.word}`], ['Pressure across the wall', r.ptm], ['Radius', r.r], ['Wall thickness', r.w], ['Index', r.index]]);
}
/** FibroScan: the organ and its stiffness. */
export const fibroRows = (organ: string, kpa: string | null, cutoffs: readonly (readonly [string, string])[]): ReadingRows =>
  [...(kpa && kpa !== '–' ? [['Stiffness', `${kpa} kPa`] as const] : []), ...cutoffs.map(([t, v]) => [`${organ} cut-off ${t}`, v] as const)];
