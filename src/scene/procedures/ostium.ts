// How far along the HVPG catheter's route (0..1, the share the catheter takes) its tip stands at a blocked hepatic vein's ostium: the 2D tip stops two figure units before the
// vein begins (stage-cath.js: `r.hv0 - 2`), so (hv0 - 2 - start) / (free - start) on the route. tests/deck-procs-link.test.ts holds it to the route's own numbers.
// (The placed anatomy, `?anatomy=new`: the same rule read from the route laid on the placed courses, route-placed.ts, where the tip goes on into the lower branch, so the share is its own.)
import { PLACED } from '../anatomy/source.ts';
import { routeOf } from './route.ts';

const placedOstium = (): number => { const r = routeOf('hvpg')!; return (r.hv0 - 2 - r.start) / (r.free - r.start); };
export const OSTIUM_U = PLACED ? placedOstium() : 0.7448;
