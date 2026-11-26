// Where a bleed leaves the vessel (the tear): the one number the jet (bleed.ts) and the mark that names it ("Bleeding varix") share, from the stream's
// own fit (stream-fit.ts tearOf: the esophageal varix's
// tear is on the esophagus's far left wall, so the stream stays inside the organs). Pure: node judges it, and the figure's cards read it without the scene.
import { tearOf } from './stream-fit.ts';

export type BleedSite = 'VAR' | 'GV';

/** The tear's point in the 2D figure's units (x right, y down): the esophageal varix's (on the far left wall of the esophagus), or the gastric varix's at the fundus. */
export const tearPoint = (site: BleedSite): readonly [number, number] => tearOf(site);

/** The vessels a bleed's mark names at the tear while the bleed runs there: the esophageal varix's columns, and the gastric varix. */
export const TEAR_EDGES: Readonly<Record<BleedSite, ReadonlySet<string>>> = { VAR: new Set(['C1a', 'C1b', 'varix']), GV: new Set(['C2', 'gastric']) };
