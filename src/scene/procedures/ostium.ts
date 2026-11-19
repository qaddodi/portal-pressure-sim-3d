// How far along the HVPG catheter's route (0..1, the share the catheter takes) its tip stands at a blocked hepatic vein's ostium: the 2D tip stops two figure units before the
// vein begins (stage-cath.js: `r.hv0 - 2`), so (hv0 - 2 - start) / (free - start) on the route. tests/deck-procs-link.test.ts holds it to the route's own numbers.
export const OSTIUM_U = 0.747;
