// Where a bleed leaves the vessel (the tear): the one number the jet (bleed.ts) and the mark that names it ("Bleeding varix") share, read off the same rows the jet is built from
// (copied/bleed-shapes.js bleedShapesInto: row 1 starts at the tear). Pure: node judges it, and the figure's cards read it without the scene.
import { bleedShapesInto, makeBleedRows } from './copied/bleed-shapes.js';
import { SITES } from './copied/anatomy-b4.ts';

export type BleedSite = 'VAR' | 'GV';

/** The tear's point in the 2D figure's units (x right, y down): the esophageal varix's, or the gastric varix's at the fundus. */
export function tearPoint(site: BleedSite): readonly [number, number] {
  const rows = bleedShapesInto(makeBleedRows(), { site, total: 0 }, 50, { varix: SITES.varix, fundus: SITES.fundus }) as number[][];
  return [rows[1]![0]!, rows[1]![1]!];
}

/** The vessels a bleed's mark names at the tear while the bleed runs there: the esophageal varix's columns, and the gastric varix. */
export const TEAR_EDGES: Readonly<Record<BleedSite, ReadonlySet<string>>> = { VAR: new Set(['C1a', 'C1b', 'varix']), GV: new Set(['C2', 'gastric']) };
